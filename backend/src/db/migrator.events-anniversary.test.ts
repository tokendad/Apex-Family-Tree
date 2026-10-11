import Database from 'better-sqlite3';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { registerCustomFunctions } from './connection.js';
import { runMigrations } from './migrator.js';
import type { Logger } from '../services/logger.js';

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function migratedDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  return db;
}

/**
 * The guard this repository has needed twice.
 *
 * 031 and 041 both rebuilt "events" by renaming it to "events_old" first. With
 * legacy_alter_table off, that rewrites references to the renamed table in
 * other tables' schemas, so the foreign keys in source_citations and
 * event_media came to point at "events_old" -- and once events_old was dropped,
 * every DELETE that cascaded into events failed with "no such table:
 * main.events_old". 037 repaired it, 041 reintroduced it, 056 repaired it
 * again. Nothing stopped a third occurrence.
 */
describe('events table rebuilds leave no dangling references', () => {
  it('has no schema anywhere referring to a scratch events table', () => {
    const db = migratedDatabase();
    try {
      const strays = db.prepare(
        `SELECT type, name FROM sqlite_master
         WHERE sql LIKE '%events_old%' OR sql LIKE '%events_new%'
            OR name IN ('events_old', 'events_new')`
      ).all();
      expect(strays).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('keeps the dependent foreign keys pointing at events', () => {
    const db = migratedDatabase();
    try {
      for (const table of ['source_citations', 'event_media']) {
        const row = db.prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?"
        ).get(table) as { sql: string };
        expect(row.sql).toContain('REFERENCES events(id)');
      }
    } finally {
      db.close();
    }
  });

  it('cascades a person delete through events without losing the table', () => {
    // This is the exact operation that surfaced the 056 breakage.
    const db = migratedDatabase();
    try {
      db.prepare(
        "INSERT INTO persons (id, sex) VALUES ('p_cascade', 'M')"
      ).run();
      db.prepare(
        `INSERT INTO events (id, person_id, event_type, event_date)
         VALUES ('e_cascade', 'p_cascade', 'birth', '1 JAN 1900')`
      ).run();

      expect(() =>
        db.prepare("DELETE FROM persons WHERE id = 'p_cascade'").run()
      ).not.toThrow();
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM events WHERE id = 'e_cascade'").get()
      ).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it('preserves all four indexes the events table carries', () => {
    const db = migratedDatabase();
    try {
      const names = db.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND tbl_name = 'events' AND name LIKE 'idx_%'
         ORDER BY name`
      ).all();
      expect(names).toEqual([
        { name: 'idx_events_date_sort' },
        { name: 'idx_events_family' },
        { name: 'idx_events_person' },
        { name: 'idx_events_type' },
      ]);
    } finally {
      db.close();
    }
  });
});

describe('anniversary event type (062)', () => {
  it('accepts an anniversary as a family event', () => {
    const db = migratedDatabase();
    try {
      db.prepare("INSERT INTO persons (id, sex) VALUES ('p_a', 'M')").run();
      db.prepare("INSERT INTO persons (id, sex) VALUES ('p_b', 'F')").run();
      db.prepare(
        "INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f_a', 'p_a', 'p_b')"
      ).run();
      db.prepare(
        `INSERT INTO events (id, family_id, event_type, event_date, event_date_qualifier, description)
         VALUES ('e_anniv', 'f_a', 'anniversary', '1 FEB 2026', 'exact', 'Golden wedding')`
      ).run();

      expect(
        db.prepare(
          "SELECT event_type, event_date, family_id FROM events WHERE id = 'e_anniv'"
        ).get()
      ).toEqual({
        event_type: 'anniversary',
        event_date: '1 FEB 2026',
        family_id: 'f_a',
      });
    } finally {
      db.close();
    }
  });

  it('still rejects a type outside the vocabulary', () => {
    const db = migratedDatabase();
    try {
      db.prepare("INSERT INTO persons (id, sex) VALUES ('p_c', 'M')").run();
      expect(() =>
        db.prepare(
          `INSERT INTO events (id, person_id, event_type)
           VALUES ('e_bad', 'p_c', 'not_a_real_type')`
        ).run()
      ).toThrow(/CHECK constraint failed/);
    } finally {
      db.close();
    }
  });

  it('keeps the person/family exclusivity check intact after the rebuild', () => {
    const db = migratedDatabase();
    try {
      db.prepare("INSERT INTO persons (id, sex) VALUES ('p_d', 'M')").run();
      db.prepare("INSERT INTO persons (id, sex) VALUES ('p_e', 'F')").run();
      db.prepare(
        "INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f_d', 'p_d', 'p_e')"
      ).run();

      // An event belongs to a person or to a family, never to both.
      expect(() =>
        db.prepare(
          `INSERT INTO events (id, person_id, family_id, event_type)
           VALUES ('e_both', 'p_d', 'f_d', 'anniversary')`
        ).run()
      ).toThrow(/CHECK constraint failed/);

      // ...and never to neither.
      expect(() =>
        db.prepare(
          "INSERT INTO events (id, event_type) VALUES ('e_neither', 'anniversary')"
        ).run()
      ).toThrow(/CHECK constraint failed/);
    } finally {
      db.close();
    }
  });
});
