import Database from 'better-sqlite3';
import fs from 'fs';
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

const recomputeSql = fs.readFileSync(
  path.join(migrationsDir, '076-recompute-iso-date-sort-keys.sql'),
  'utf-8',
);
const revertSql = fs.readFileSync(
  path.join(migrationsDir, '076-recompute-iso-date-sort-keys-down.sql'),
  'utf-8',
);

let personId: string;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
  personId = new PersonRepository().create({ display_name: 'Walter Higgins Sr' }).id;
});

afterEach(() => db.close());

const add = (eventType: string, eventDate: string) =>
  new EventRepository().create({ person_id: personId, event_type: eventType, event_date: eventDate });

const sortKeyOf = (id: string) =>
  (db.prepare('SELECT event_date_sort_key AS k FROM events WHERE id = ?').get(id) as { k: number }).k;

/** The broken parser's output, written straight into the row the way it was
    stored before the fix. */
const breakSortKey = (id: string, key: number) =>
  db.prepare('UPDATE events SET event_date_sort_key = ? WHERE id = ?').run(key, id);

describe('a date written as YYYY-MM-DD', () => {
  it('sorts by its day, not by its year', () => {
    expect(sortKeyOf(add('death', '1990-11-26').id)).toBe(19901126);
  });

  it('sorts the same as the same day written the GEDCOM way', () => {
    expect(sortKeyOf(add('death', '1990-11-26').id))
      .toBe(sortKeyOf(add('burial', '26 NOV 1990').id));
  });

  /* The order this all exists for: a death in November and the burial three
     days later, both after an event earlier the same year. */
  it('puts a November burial after a March birthday', () => {
    const march = add('census', '1990-03-14').id;
    const death = add('death', '1990-11-26').id;
    const burial = add('burial', '1990-11-29').id;

    const order = (db.prepare(
      'SELECT id FROM events WHERE person_id = ? ORDER BY event_date_sort_key ASC',
    ).all(personId) as { id: string }[]).map(row => row.id);

    expect(order).toEqual([march, death, burial]);
  });
});

describe('migration 076 — dates entered before the parser was fixed', () => {
  /* A sort key is computed once, when the row is written, so fixing the
     parser does nothing for a date already in the archive. */
  it('recomputes a key that lost its month and day', () => {
    const death = add('death', '1990-11-26').id;
    breakSortKey(death, 19900000);

    db.exec(recomputeSql);

    expect(sortKeyOf(death)).toBe(19901126);
  });

  it('leaves the dates it cannot read alone', () => {
    const vague = add('birth', 'ABT 1919').id;
    const before = sortKeyOf(vague);

    db.exec(recomputeSql);

    expect(sortKeyOf(vague)).toBe(before);
  });

  /* GLOB's [0-9] matches a digit where LIKE's _ matches anything, and that is
     the whole guard: a date that merely looks ISO-shaped must not be mangled
     into a number. */
  it('does not touch text that only resembles a date', () => {
    const odd = add('custom', 'abcd-ef-gh').id;
    const before = sortKeyOf(odd);

    db.exec(recomputeSql);

    expect(sortKeyOf(odd)).toBe(before);
  });

  it('changes nothing the second time', () => {
    const death = add('death', '1990-11-26').id;
    db.exec(recomputeSql);
    const after = sortKeyOf(death);

    db.exec(recomputeSql);

    expect(sortKeyOf(death)).toBe(after);
  });

  it('puts the old wrong key back when rolled back', () => {
    const death = add('death', '1990-11-26').id;
    db.exec(recomputeSql);

    db.exec(revertSql);

    expect(sortKeyOf(death)).toBe(19900000);
  });
});
