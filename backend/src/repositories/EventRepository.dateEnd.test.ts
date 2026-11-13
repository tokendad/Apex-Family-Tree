import Database from 'better-sqlite3';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../db/connection.js');
const { runMigrations } = await import('../db/migrator.js');
const { EventRepository } = await import('./EventRepository.js');
const { PersonRepository } = await import('./PersonRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let personId: string;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
  personId = new PersonRepository().create({ display_name: 'Test Subject' }).id;
});

afterEach(() => db.close());

/* #33: events had nowhere to record an end, and a GEDCOM DATE_PERIOD like
   "FROM 1982 TO 1990" fell through parseGedcomDate entirely, sorting as 0. */
describe('EventRepository — event_date_end', () => {
  it('splits a "FROM x TO y" event_date into both columns', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'FROM 1982 TO 1990',
    });

    expect(event.event_date).toBe('1982');
    expect(event.event_date_end).toBe('1990');
    expect(event.event_date_sort_key).toBe(19820000);
    expect(event.event_date_end_sort_key).toBe(19900000);
  });

  it('leaves event_date_end null for a plain date', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'birth',
      event_date: '1925',
    });

    expect(event.event_date).toBe('1925');
    expect(event.event_date_end).toBeNull();
    expect(event.event_date_end_sort_key).toBeNull();
  });

  it('accepts an explicit end alongside a plain start', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: '1982',
      event_date_end: '1990',
    });

    expect(event.event_date).toBe('1982');
    expect(event.event_date_end).toBe('1990');
    expect(event.event_date_end_sort_key).toBe(19900000);
  });

  it('updates the end without disturbing the start', () => {
    const created = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: '1982',
    });

    const updated = new EventRepository().update(created.id, { event_date_end: '1990' });

    expect(updated?.event_date).toBe('1982');
    expect(updated?.event_date_end).toBe('1990');
    expect(updated?.event_date_end_sort_key).toBe(19900000);
  });

  it('updates the start without disturbing an existing end', () => {
    const created = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: '1982',
      event_date_end: '1990',
    });

    const updated = new EventRepository().update(created.id, { event_date: '1983' });

    expect(updated?.event_date).toBe('1983');
    expect(updated?.event_date_end).toBe('1990');
  });

  it('splits a period given on update the same way create does', () => {
    const created = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: '1982',
    });

    const updated = new EventRepository().update(created.id, { event_date: 'FROM 1985 TO 1995' });

    expect(updated?.event_date).toBe('1985');
    expect(updated?.event_date_end).toBe('1995');
    expect(updated?.event_date_end_sort_key).toBe(19950000);
  });

  it('clears the end when explicitly set to null', () => {
    const created = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: '1982',
      event_date_end: '1990',
    });

    const updated = new EventRepository().update(created.id, { event_date_end: null });

    expect(updated?.event_date_end).toBeNull();
    expect(updated?.event_date_end_sort_key).toBeNull();
    // The start is untouched by clearing the end.
    expect(updated?.event_date).toBe('1982');
  });

  it('populates the end of a BET...AND range without treating it as a span', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'birth',
      event_date: 'BET 1900 AND 1910',
    });

    // Stored verbatim -- BET...AND is not split the way FROM...TO is, since
    // it states one uncertain date rather than a duration.
    expect(event.event_date).toBe('BET 1900 AND 1910');
    expect(event.event_date_end).toBeNull();
    expect(event.event_date_sort_key).toBe(19000000);
  });

  /* Splitting a one-sided span would store a start with no end, which looks
     identical to a plain date with no end at all -- and there is no way
     back to "FROM"/"TO" from that at export time. Left verbatim instead, the
     exporter already round-trips it unchanged. */
  it('leaves an open-ended "FROM x" span verbatim instead of splitting it', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'FROM 1982',
    });

    expect(event.event_date).toBe('FROM 1982');
    expect(event.event_date_end).toBeNull();
    expect(event.event_date_sort_key).toBe(19820000);
  });

  it('leaves a "TO x" span with no known start verbatim', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'TO 1990',
    });

    expect(event.event_date).toBe('TO 1990');
    expect(event.event_date_end).toBeNull();
  });

  /* "TO 1990" has no start to sort by, but it is not *nothing*: the end is a
     better anchor than NULLS LAST, which would bury it after every event
     whose date was never even understood. */
  it('sorts a date with no start by the end it does have', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'TO 1990',
    });

    expect(event.event_date_sort_key).toBe(19900000);
  });

  /* The old code wrote `sortKey || null`, so an unparseable date's sort key
     of 0 became NULL and fell to NULLS LAST. A straight `?? null` would have
     stored the literal 0 instead, sorting that event first in every
     timeline -- the exact failure #33 reports for a period, reached here
     through text with no date-like content at all, where there is no end to
     fall back on either. */
  it('stores no sort key for text it cannot parse at all', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'sometime in the war',
    });

    expect(event.event_date_sort_key).toBeNull();
  });

  /* #33 again, by a different route: a one-sided "FROM 1982" stays verbatim
     in event_date (nothing to split), so adding an end later through its own
     field must not let the exporter nest the keyword into "FROM FROM ... TO". */
  it('does not nest FROM when an end is added later to an open-ended start', () => {
    const created = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'FROM 1982',
    });
    expect(created.event_date).toBe('FROM 1982');

    const updated = new EventRepository().update(created.id, { event_date_end: '1990' });
    expect(updated?.event_date).toBe('FROM 1982');
    expect(updated?.event_date_end).toBe('1990');
  });
});

/* The End Date form field always sends event_date_end, even when the user
   left it blank: `form.event_date_end.trim() || null`, never an omitted
   key. Every call in this block mirrors that shape -- `event_date_end: null`
   explicit, not undefined -- which is the exact input the single-string
   split path has to keep handling correctly, not just the narrower
   "nothing was said about the end" case the other describe block covers. */
describe('EventRepository — event_date_end sent explicitly as null (the End field form shape)', () => {
  it('still splits a period typed into Date with End left blank', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'FROM 1982 TO 1990',
      event_date_end: null,
    });

    expect(event.event_date).toBe('1982');
    expect(event.event_date_end).toBe('1990');
    expect(event.event_date_sort_key).toBe(19820000);
    expect(event.event_date_end_sort_key).toBe(19900000);
  });

  it('still keeps an open-ended "FROM x" verbatim with End left blank', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'FROM 1982',
      event_date_end: null,
    });

    expect(event.event_date).toBe('FROM 1982');
    expect(event.event_date_end).toBeNull();
    expect(event.event_date_sort_key).toBe(19820000);
  });

  it('a plain date with End left blank is unaffected', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'birth',
      event_date: '1982',
      event_date_end: null,
    });

    expect(event.event_date).toBe('1982');
    expect(event.event_date_end).toBeNull();
    expect(event.event_date_sort_key).toBe(19820000);
  });

  it('re-saving a legacy row that already holds "FROM x TO y" in event_date splits it, not mis-parses it', () => {
    // A row written before this column existed, or by any path that stored
    // the raw GEDCOM text verbatim.
    const created = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: '1982',
    });
    db.prepare('UPDATE events SET event_date = ? WHERE id = ?').run('FROM 1982 TO 1990', created.id);

    // The edit form loads event_date back into the Date field and
    // event_date_end (still null) into the End field, then saves both --
    // exactly this shape.
    const updated = new EventRepository().update(created.id, {
      event_date: 'FROM 1982 TO 1990',
      event_date_end: null,
    });

    expect(updated?.event_date).toBe('1982');
    expect(updated?.event_date_end).toBe('1990');
    expect(updated?.event_date_sort_key).toBe(19820000);
    expect(updated?.event_date_end_sort_key).toBe(19900000);
  });

  it('an End-only save (Date left blank) sorts by the end, not last', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: null,
      event_date_end: '1990',
    });

    expect(event.event_date).toBeNull();
    expect(event.event_date_end).toBe('1990');
    expect(event.event_date_sort_key).toBe(19900000);
    expect(event.event_date_end_sort_key).toBe(19900000);
  });

  it('a real end alongside a plain start parses both independently', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: '1982',
      event_date_end: '1990',
    });

    expect(event.event_date).toBe('1982');
    expect(event.event_date_end).toBe('1990');
    expect(event.event_date_sort_key).toBe(19820000);
    expect(event.event_date_end_sort_key).toBe(19900000);
  });

  /* A real (non-null) end alongside a Date field that still literally reads
     "FROM x TO y" -- a legacy row's text re-saved unchanged, or the keyword
     typed straight into Date while a different end is also given. Stripping
     the FROM before checking whether the date is a period defeats the
     period check itself: "1982 TO 1990" has no FROM/TO keyword left to
     match, so it fell to the plain-date parser and mis-read "1982" as a
     day, "TO" as an unmatched month, and "1990" as the year. */
  it('reads its own period correctly when a real end is also given', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      event_date: 'FROM 1982 TO 1990',
      event_date_end: '1995',
    });

    expect(event.event_date).toBe('1982');
    expect(event.event_date_end).toBe('1995');
    expect(event.event_date_sort_key).toBe(19820000);
    expect(event.event_date_end_sort_key).toBe(19950000);
  });
});
