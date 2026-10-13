import type Database from 'better-sqlite3';
import { parseGedcomDate } from '../utils/gedcom-date.js';
import type { Logger } from '../services/logger.js';
import { runWithFlags } from '../services/requestContext.js';
import { EventRepository } from '../repositories/EventRepository.js';

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

/**
 * Give a family's marriage and divorce dates an event of their own.
 *
 * A family row carries marriage_date and divorce_date directly, and the API
 * mirrors each into an event whenever a family is created or edited. Families
 * that arrived by import never went through that path, so eight of this
 * archive's twenty carried a marriage date that existed only on the family:
 * the Events page did not list it, and neither spouse's timeline showed it,
 * because a timeline is built from events. The date was on the family page and
 * nowhere else, which reads as a missing marriage rather than a missing row.
 *
 * Idempotent: only families whose date has no matching event are touched.
 */
export function backfillFamilyLifecycleEvents(db: Database.Database, logger: Logger): void {
  const rows = db.prepare(
    `SELECT f.id, f.marriage_date, f.marriage_place, f.divorce_date, f.divorce_place
     FROM families f
     WHERE (f.marriage_date IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM events e WHERE e.family_id = f.id AND e.event_type = 'marriage'))
        OR (f.divorce_date IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM events e WHERE e.family_id = f.id AND e.event_type = 'divorce'))`,
  ).all() as {
    id: string;
    marriage_date: string | null;
    marriage_place: string | null;
    divorce_date: string | null;
    divorce_place: string | null;
  }[];

  if (rows.length === 0) return;

  logger.info(`Backfilling lifecycle events for ${rows.length} families`);

  /* Through the repository, not raw INSERTs: an event needs an archive object
     beside it and a sort key derived from its date, and the point of the
     exercise is rows indistinguishable from the ones the API writes. The
     bulk flag keeps one startup job out of the audit log as several hundred
     separate edits. */
  runWithFlags({ bulkSource: 'import' }, () => {
    const events = new EventRepository();
    for (const family of rows) {
      if (family.marriage_date) {
        events.syncFamilyEvent(family.id, 'marriage', {
          event_date: family.marriage_date,
          event_place: family.marriage_place,
        });
      }
      if (family.divorce_date) {
        events.syncFamilyEvent(family.id, 'divorce', {
          event_date: family.divorce_date,
          event_place: family.divorce_place,
        });
      }
    }
  });

  logger.info('Family lifecycle event backfill complete');
}
