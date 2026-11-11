import fs from 'fs';
import { IntakeRepository } from '../../repositories/IntakeRepository.js';
import { createLogger } from '../logger.js';

const logger = createLogger();

/**
 * Called once at boot, next to sweepOrphanedAiJobs(). An intake item left
 * 'pending' or 'extracting' by a process that restarted mid-call has two
 * problems ai_jobs's own sweep doesn't reach: the item itself never moves
 * past the panel's poll ceiling, and -- new in #73 Phase 2 -- a staged
 * upload under DATA_DIR/intake-uploads would sit there forever with nothing
 * left to commit it or clean it up. Both are resolved the same way a stuck
 * ai_jobs row is: mark it failed and tell the truth about why.
 */
export function sweepOrphanedIntakeItems(): void {
  const repo = new IntakeRepository();
  const orphaned = repo.findOrphanedItems();

  for (const item of orphaned) {
    if (item.source_file_path) {
      // Synchronous and fine to be: this runs once at boot, before the
      // server starts accepting requests, not on any request's hot path.
      try {
        fs.unlinkSync(item.source_file_path);
      } catch {
        // Already gone, or never existed -- either way there's nothing left
        // to clean up.
      }
      repo.clearSourceFile(item.id);
    }
    repo.setStatus(item.id, 'failed');
  }

  if (orphaned.length > 0) {
    logger.info(`Marked ${orphaned.length} orphaned intake item(s) as failed after restart`);
  }
}
