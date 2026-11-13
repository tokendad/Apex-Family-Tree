import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { eventsRouter } = await import('./events.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'admin' };
    next();
  });
  app.use('/api/v1/events', eventsRouter);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE persons (
      id TEXT PRIMARY KEY, sex TEXT, is_living INTEGER, is_private INTEGER,
      gedcom_id TEXT, notes TEXT, display_name TEXT, created_by TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE names (
      id TEXT PRIMARY KEY, person_id TEXT, name_type TEXT, prefix TEXT,
      given_name TEXT, middle_name TEXT, surname TEXT, suffix TEXT, nickname TEXT,
      is_primary INTEGER, sort_order INTEGER, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE families (
      id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT, marriage_date TEXT,
      marriage_date_qualifier TEXT, marriage_date_sort_key INTEGER, marriage_place TEXT,
      divorce_date TEXT, divorce_place TEXT, gedcom_id TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE family_members (
      id TEXT PRIMARY KEY, family_id TEXT, person_id TEXT, role TEXT,
      sort_order INTEGER, created_at TEXT
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY, person_id TEXT, family_id TEXT, event_type TEXT,
      event_date TEXT, event_date_qualifier TEXT, event_date_sort_key INTEGER,
      event_date_end TEXT, event_date_end_sort_key INTEGER,
      event_place TEXT, description TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
  `);

  const person = (id: string, given: string, surname: string) => {
    db.prepare('INSERT INTO persons (id, sex, is_living, is_private) VALUES (?, ?, 1, 0)').run(id, 'M');
    db.prepare(
      'INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, 1, 0)',
    ).run(`n-${id}`, id, 'birth', given, surname);
  };
  person('p-ray', 'Raymond', 'LeFort');
  person('p-jen', 'Jennifer', 'Corey');

  db.prepare(
    "INSERT INTO events (id, person_id, event_type, event_date, event_place) VALUES ('e-wake', 'p-ray', 'wake', '2010', 'Lefort Funeral Home')",
  ).run();
  db.prepare(
    "INSERT INTO events (id, person_id, event_type, event_date) VALUES ('e-birth-jen', 'p-jen', 'birth', '1955')",
  ).run();
});

afterEach(() => {
  db.close();
});

describe('GET /events?q= — narrowing the list for the Connections picker', () => {
  it('matches a word against the event and names the subject', async () => {
    const res = await request(buildApp()).get('/api/v1/events').query({ q: 'raymond' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('e-wake');
    expect(res.body.data[0].person).toMatchObject({ id: 'p-ray', given_name: 'Raymond' });
  });

  it('matches the event place', async () => {
    const res = await request(buildApp()).get('/api/v1/events').query({ q: 'funeral' });
    expect(res.body.data.map((e: { id: string }) => e.id)).toEqual(['e-wake']);
  });

  it('does not enrich the default bulk list with no q', async () => {
    const res = await request(buildApp()).get('/api/v1/events');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].person).toBeUndefined();
  });
});
