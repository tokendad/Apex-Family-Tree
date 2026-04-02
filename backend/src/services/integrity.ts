import { getDatabase } from '../db/connection.js';
import type { Logger } from './logger.js';

export interface IntegrityResult {
  ok: boolean;
  message: string;
  details: string[];
}

export function runIntegrityCheck(logger: Logger): IntegrityResult {
  const db = getDatabase();

  try {
    const rows = db.pragma('quick_check') as { quick_check: string }[];

    const details = rows.map(r => r.quick_check);
    const ok = details.length === 1 && details[0] === 'ok';

    if (ok) {
      logger.info('Database integrity check passed');
    } else {
      logger.warn('Database integrity check found issues:', details.join('; '));
    }

    return {
      ok,
      message: ok ? 'Database integrity check passed' : `Found ${details.length} issue(s)`,
      details,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Database integrity check failed: ${msg}`);

    return {
      ok: false,
      message: `Integrity check error: ${msg}`,
      details: [msg],
    };
  }
}

export function runForeignKeyCheck(logger: Logger): { ok: boolean; violations: unknown[] } {
  const db = getDatabase();

  try {
    const violations = db.pragma('foreign_key_check') as unknown[];

    if (violations.length === 0) {
      logger.info('Foreign key check passed — no violations');
    } else {
      logger.warn(`Foreign key check found ${violations.length} violation(s)`);
    }

    return { ok: violations.length === 0, violations };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Foreign key check failed: ${msg}`);
    return { ok: false, violations: [{ error: msg }] };
  }
}
