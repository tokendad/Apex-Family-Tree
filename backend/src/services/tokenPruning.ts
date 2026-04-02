import { getDatabase } from '../db/connection.js';
import type { Logger } from './logger.js';

export function pruneExpiredTokens(logger: Logger): void {
  const db = getDatabase();
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

  try {
    const refreshResult = db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(now);
    if (refreshResult.changes > 0) {
      logger.info(`Pruned ${refreshResult.changes} expired refresh token(s)`);
    }

    const inviteResult = db.prepare('DELETE FROM invite_tokens WHERE expires_at < ? AND used_at IS NULL').run(now);
    if (inviteResult.changes > 0) {
      logger.info(`Pruned ${inviteResult.changes} expired invite token(s)`);
    }

    const resetResult = db.prepare('DELETE FROM password_reset_tokens WHERE expires_at < ? AND used_at IS NULL').run(now);
    if (resetResult.changes > 0) {
      logger.info(`Pruned ${resetResult.changes} expired password reset token(s)`);
    }

    logger.info('Token pruning complete');
  } catch (error) {
    logger.error('Token pruning failed:', error);
  }
}
