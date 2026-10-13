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

const rollbackSql = fs.readFileSync(
  path.join(migrationsDir, '075-events-wake-type-down.sql'),
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

const wake = () =>
  new EventRepository().create({
    person_id: personId,
    event_type: 'wake',
    event_date: '29 NOV 1990',
    event_place: 'Worcester, Massachusetts',
  });

const rollback = () => {
  // The migrator runs with foreign keys off; match it, or the rebuild
  // behaves differently here than in production.
  db.pragma('foreign_keys = OFF');
  db.exec(rollbackSql);
  db.pragma('foreign_keys = ON');
};

/* event_type is a CHECK whitelist, so a type the application knows about but
   the table does not is refused by the database with the form already filled
   in. A wake is its own gathering -- not the burial, which is the interment,
   and not 'custom', which renders as the bare word "Event". */
describe('a wake', () => {
  it('can be recorded', () => {
    const event = wake();

    expect(new EventRepository().findById(event.id)).toMatchObject({
      event_type: 'wake',
      event_date: '29 NOV 1990',
      event_place: 'Worcester, Massachusetts',
    });
  });

  it('is still refused for a type nobody added', () => {
    expect(() =>
      new EventRepository().create({ person_id: personId, event_type: 'barn_raising' }),
    ).toThrow();
  });

  /* The migration rebuilds the table, so the columns 067 and 071 added after
     the last rebuild have to come across with everything else. */
  it('leaves the other events whole', () => {
    const burial = new EventRepository().create({
      person_id: personId,
      event_type: 'burial',
      event_place: 'Worcester County Memorial Park, Paxton, Massachusetts',
      plot: 'Garden of Heritage I, Lot 237 Grave 4',
      source_url: 'https://example.org/record',
    });

    expect(new EventRepository().findById(burial.id)).toMatchObject({
      plot: 'Garden of Heritage I, Lot 237 Grave 4',
      source_url: 'https://example.org/record',
    });
  });

  /* The migration drops and rebuilds the table, and a DROP takes every
     trigger with it. 063's trigger is the backstop that clears an event's
     archive object and the relationships pointing at it when the row goes
     without the repository's help -- a cascade, a cleanup script, a hand-run
     DELETE. The repository does its own tidying, so only a raw delete shows
     whether the trigger survived the rebuild. */
  it('keeps the trigger that clears up after a deleted event', () => {
    const event = wake();
    expect(db.prepare('SELECT id FROM archive_objects WHERE id = ?').get(event.id)).toBeTruthy();

    db.prepare('DELETE FROM events WHERE id = ?').run(event.id);

    expect(db.prepare('SELECT id FROM archive_objects WHERE id = ?').get(event.id)).toBeUndefined();
  });

  describe('when the migration is rolled back', () => {
    /* A rollback that threw away the evening's photographs would be worse
       than whatever it was run to fix. */
    it('is demoted rather than deleted', () => {
      const event = wake();

      rollback();

      expect(
        db.prepare('SELECT event_type, event_date, event_place FROM events WHERE id = ?')
          .get(event.id),
      ).toMatchObject({
        event_type: 'custom',
        event_date: '29 NOV 1990',
        event_place: 'Worcester, Massachusetts',
      });
    });

    it('keeps the photographs attached to it', () => {
      const event = wake();
      db.prepare(
        `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, created_at, updated_at)
         VALUES ('m1', 'Higgins Brothers.jpeg', 'Higgins Brothers.jpeg', 'image/jpeg', 1,
                 '/media/wake/Higgins Brothers.jpeg', datetime('now'), datetime('now'))`,
      ).run();
      db.prepare(
        `INSERT INTO event_media (event_id, media_id, sort_order, created_at)
         VALUES (?, 'm1', 0, datetime('now'))`,
      ).run(event.id);

      rollback();

      expect(
        db.prepare('SELECT COUNT(*) AS n FROM event_media WHERE event_id = ?').get(event.id),
      ).toEqual({ n: 1 });
    });
  });
});
