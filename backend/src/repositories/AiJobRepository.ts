import { BaseRepository } from './base.js';
import type { AiJob } from '../types/db.js';

export class AiJobRepository extends BaseRepository {
  findById(id: string): AiJob | undefined {
    return this.db.prepare('SELECT * FROM ai_jobs WHERE id = ?').get(id) as AiJob | undefined;
  }

  create(data: {
    kind: AiJob['kind'];
    requested_by: string | null;
    provider: string;
    model: string;
    input_ref?: string;
  }): AiJob {
    const id = this.generateId();
    this.db.prepare(
      `INSERT INTO ai_jobs (id, kind, status, requested_by, provider, model, input_ref, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`,
    ).run(id, data.kind, data.requested_by, data.provider, data.model, data.input_ref ?? null, this.now());
    return this.findById(id)!;
  }

  markRunning(id: string): void {
    this.db.prepare(
      `UPDATE ai_jobs SET status = 'running', started_at = ? WHERE id = ?`,
    ).run(this.now(), id);
  }

  markCompleted(id: string, data: { result_json: string; input_tokens?: number; output_tokens?: number }): void {
    this.db.prepare(
      `UPDATE ai_jobs SET status = 'completed', result_json = ?, input_tokens = ?, output_tokens = ?, completed_at = ?
       WHERE id = ?`,
    ).run(data.result_json, data.input_tokens ?? null, data.output_tokens ?? null, this.now(), id);
  }

  markFailed(id: string, errorMessage: string): void {
    this.db.prepare(
      `UPDATE ai_jobs SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`,
    ).run(errorMessage, this.now(), id);
  }

  /** Jobs left 'pending' or 'running' by a process that never came back.
   *  There is no persistent queue behind runAiJob's in-memory concurrency
   *  cap (see MAX_CONCURRENT in services/aiJobs.ts) -- a job queued behind
   *  it is just as orphaned by a restart as one already calling the
   *  provider, since nothing durable remembers it needed to run. Both
   *  statuses are dead the moment the process that created them exits. */
  failOrphanedJobs(): number {
    return this.db.prepare(
      `UPDATE ai_jobs SET status = 'failed', error_message = 'Interrupted by server restart', completed_at = ?
       WHERE status IN ('pending', 'running')`,
    ).run(this.now()).changes;
  }
}
