import type Database from 'better-sqlite3';
import { parseGedcomDate } from '../utils/gedcom-date.js';
import type { Logger } from '../services/logger.js';

/**
 * Populate marriage_date_sort_key for families that have a raw marriage_date
 * but no computed sort key. Idempotent — only updates rows where sort key is NULL.
 */
export function backfillMarriageSortKeys(db: Database.Database, logger: Logger): void {
  const rows = db.prepare(
    'SELECT id, marriage_date FROM families WHERE marriage_date IS NOT NULL AND marriage_date_sort_key IS NULL'
  ).all() as { id: string; marriage_date: string }[];

  if (rows.length === 0) return;

  logger.info(`Backfilling marriage_date_sort_key for ${rows.length} families`);

  const update = db.prepare(
    'UPDATE families SET marriage_date_sort_key = ?, marriage_date_qualifier = COALESCE(marriage_date_qualifier, ?) WHERE id = ?'
  );

  const runAll = db.transaction(() => {
    for (const row of rows) {
      const parsed = parseGedcomDate(row.marriage_date);
      if (parsed.sortKey > 0) {
        update.run(parsed.sortKey, parsed.qualifier, row.id);
      }
    }
  });

  runAll();
  logger.info('Marriage date sort key backfill complete');
}
