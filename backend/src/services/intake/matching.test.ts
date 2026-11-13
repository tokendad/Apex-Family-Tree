import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../../db/connection.js', () => ({ getDatabase: () => db }));

const { rankCandidates } = await import('./matching.js');

function seedSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE persons (
      id TEXT PRIMARY KEY, sex TEXT DEFAULT 'U', is_living INTEGER NOT NULL DEFAULT 1, notes TEXT
    );
    CREATE TABLE names (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL, name_type TEXT NOT NULL DEFAULT 'birth',
      given_name TEXT, surname TEXT, is_primary INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL, event_type TEXT NOT NULL,
      event_date TEXT, event_date_sort_key INTEGER, event_date_end TEXT, event_date_end_sort_key INTEGER,
      event_place TEXT, description TEXT
    );
    CREATE TABLE families (id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT);
    CREATE TABLE family_members (id TEXT PRIMARY KEY, family_id TEXT, person_id TEXT, role TEXT);
    CREATE TABLE source_citations (id TEXT PRIMARY KEY, person_id TEXT, event_id TEXT);
  `);
}

function addPerson(id: string, given: string, surname: string, birthYear?: number) {
  db.prepare('INSERT INTO persons (id) VALUES (?)').run(id);
  db.prepare('INSERT INTO names (id, person_id, given_name, surname) VALUES (?, ?, ?, ?)').run(`n_${id}`, id, given, surname);
  if (birthYear) {
    db.prepare('INSERT INTO events (id, person_id, event_type, event_date, event_date_sort_key) VALUES (?, ?, ?, ?, ?)')
      .run(`e_${id}`, id, 'birth', String(birthYear), birthYear * 10000);
  }
}

beforeEach(() => {
  db = new Database(':memory:');
  seedSchema(db);
});

describe('rankCandidates', () => {
  it('ranks an exact name + birth year match highest', () => {
    addPerson('p1', 'John', 'Smith', 1920);
    addPerson('p2', 'Jon', 'Smyth', 1920);

    const results = rankCandidates({ givenName: 'John', surname: 'Smith', birthDate: '1920' });

    expect(results[0].personId).toBe('p1');
    expect(results[0].score).toBeGreaterThanOrEqual(50);
    expect(results[0].reasons.length).toBeGreaterThan(0);
    expect(results[0].displayName).toBe('John Smith');
    expect(results[0].birthYear).toBe(1920);
  });

  it('returns no candidates when nothing in the tree is a plausible match', () => {
    addPerson('p1', 'Completely', 'Different', 1850);

    const results = rankCandidates({ givenName: 'Zzyzx', surname: 'Nomatch' });

    expect(results).toEqual([]);
  });

  it('returns an empty list with no given name or surname to block on', () => {
    addPerson('p1', 'John', 'Smith', 1920);

    const results = rankCandidates({ givenName: '', surname: null });

    expect(results).toEqual([]);
  });
});
