import crypto from 'crypto';
import { IntakeRepository } from '../../repositories/IntakeRepository.js';
import { ArtifactRepository } from '../../repositories/ArtifactRepository.js';
import { SettingsRepository } from '../../repositories/SettingsRepository.js';
import { runAiJob } from '../aiJobs.js';
import { extractProposals } from './extraction.js';

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export interface ScanResult {
  queued: number;
}

/**
 * #73 Phase 3's proactive suggestions, admin-triggered rather than on a true
 * schedule -- this codebase has no cron/scheduler anywhere to hang a real
 * background scan off of, so "proactive" here means "the admin asked for a
 * batch of them just now," same manual-trigger shape as GEDCOM import/export.
 *
 * Reads up to `limit` not-yet-suggested artifacts that already have a
 * transcription, and runs the exact same extraction/review/commit pipeline
 * manual submissions use -- just with the intake item's source_artifact_id
 * set immediately instead of at commit, since the artifact already existed
 * before this scan found it. Nothing here writes anything but the intake
 * staging rows: no proposal is ever auto-accepted, same as #73's rule for a
 * pasted submission.
 */
export function scanForSuggestions(userId: string, limit = 5): ScanResult {
  const intakeRepo = new IntakeRepository();
  const artifactRepo = new ArtifactRepository();

  const alreadyReviewed = [...intakeRepo.findIntakeSourceArtifactIds()];
  const candidates = artifactRepo.findWithTranscription(alreadyReviewed, limit);

  const settings = new SettingsRepository();
  const providerId = settings.getSettingValue('llm_provider') || 'anthropic';
  const model = settings.getSettingValue('llm_model') || 'unknown';

  for (const artifact of candidates) {
    const item = intakeRepo.createItem({
      created_by: userId,
      source_text: artifact.transcription,
      source_hash: hashText(artifact.transcription),
      source_artifact_id: artifact.id,
      trigger: 'suggested',
    });
    intakeRepo.setStatus(item.id, 'extracting');

    const job = runAiJob('extract', userId, providerId, model, item.id, async () => {
      try {
        const result = await extractProposals({ text: artifact.transcription });
        intakeRepo.createProposals(item.id, result.proposals);
        intakeRepo.setStatus(item.id, 'awaiting_review');
        return {
          data: { proposalCount: result.proposals.length },
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
      } catch (error) {
        intakeRepo.setStatus(item.id, 'failed');
        throw error;
      }
    });
    intakeRepo.setAiJob(item.id, job.id);
  }

  return { queued: candidates.length };
}
