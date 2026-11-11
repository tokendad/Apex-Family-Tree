import { AiJobRepository } from '../repositories/AiJobRepository.js';
import { createLogger } from './logger.js';
import type { AiJob } from '../types/db.js';

const logger = createLogger();

/**
 * There is no background worker anywhere in this app. runAiJob creates the
 * job row, returns its id synchronously, and runs the actual call via
 * setImmediate so the HTTP response is never held open for an LLM round
 * trip -- a caller submits, gets a job id back immediately, and polls
 * GET /ai/jobs/:id for the result.
 *
 * MAX_CONCURRENT caps how many of these can be in flight at once across the
 * whole process, so a burst of submissions queues behind it instead of
 * firing N simultaneous requests at the provider's rate limit. This is a
 * module-level counter, not a real queue -- adequate for one admin's
 * single-container instance, not meant to scale past that.
 */
const MAX_CONCURRENT = 2;
let inFlight = 0;
const waiting: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight += 1;
}

function releaseSlot(): void {
  inFlight -= 1;
  const next = waiting.shift();
  if (next) next();
}

export function runAiJob(
  kind: AiJob['kind'],
  requestedBy: string,
  provider: string,
  model: string,
  inputRef: string | undefined,
  work: () => Promise<{ data: unknown; inputTokens: number; outputTokens: number }>,
): AiJob {
  const repo = new AiJobRepository();
  const job = repo.create({ kind, requested_by: requestedBy, provider, model, input_ref: inputRef });

  setImmediate(() => {
    void (async () => {
      await acquireSlot();
      try {
        repo.markRunning(job.id);
        const result = await work();
        repo.markCompleted(job.id, {
          result_json: JSON.stringify(result.data),
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`AI job ${job.id} (${kind}) failed:`, error);
        repo.markFailed(job.id, message);
      } finally {
        releaseSlot();
      }
    })();
  });

  return job;
}

/** Called once at boot. A job left 'pending' or 'running' means the process
 *  restarted before it finished -- including one still queued behind
 *  MAX_CONCURRENT when it went down, which never got as far as 'running'
 *  either. There is no way to resume either kind, so both are marked failed
 *  and a caller still watching sees a clean failure instead of polling a
 *  job that will never move again. */
export function sweepOrphanedAiJobs(): void {
  const failed = new AiJobRepository().failOrphanedJobs();
  if (failed > 0) {
    logger.info(`Marked ${failed} orphaned AI job(s) as failed after restart`);
  }
}
