import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { peopleRouter } = await import('./people.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/v1/people', peopleRouter);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE persons (
      id TEXT PRIMARY KEY,
      sex TEXT,
      is_living INTEGER,
      is_private INTEGER DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      gedcom_id TEXT,
      display_name TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE names (
      id TEXT PRIMARY KEY,
      person_id TEXT,
      name_type TEXT DEFAULT 'birth',
      prefix TEXT,
      given_name TEXT,
      middle_name TEXT,
      surname TEXT,
      suffix TEXT,
      nickname TEXT,
      is_primary INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      person_id TEXT,
      family_id TEXT,
      event_type TEXT NOT NULL,
      event_date TEXT,
      event_date_qualifier TEXT,
      event_date_sort_key INTEGER,
      event_place TEXT,
      description TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE families (
      id TEXT PRIMARY KEY,
      spouse1_id TEXT,
      spouse2_id TEXT,
      marriage_date TEXT,
      marriage_date_qualifier TEXT,
      marriage_date_sort_key INTEGER,
      marriage_place TEXT,
      divorce_date TEXT,
      divorce_place TEXT,
      gedcom_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE family_members (
      id TEXT PRIMARY KEY,
      family_id TEXT,
      person_id TEXT,
      role TEXT,
      sort_order INTEGER,
      created_at TEXT
    );
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('name_display_format', '%f %m %s');
  db.exec(`
    INSERT INTO persons (id, sex, is_living, created_at, updated_at)
    VALUES ('p1', 'M', 1, '2024-01-01', '2024-01-01'),
           ('p2', 'F', 1, '2024-01-01', '2024-01-01');
    INSERT INTO names (id, person_id, given_name, surname, is_primary, sort_order, created_at, updated_at)
    VALUES ('n1', 'p1', 'John', 'Smith', 1, 0, '2024-01-01', '2024-01-01'),
           ('n2', 'p2', 'Jane', 'Doe', 1, 0, '2024-01-01', '2024-01-01');
    INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, created_at, updated_at)
    VALUES ('f1', 'p1', 'p2', '14 JUN 1910', '2024-01-01', '2024-01-01');
    INSERT INTO events (id, person_id, family_id, event_type, event_date, event_date_sort_key, event_place, created_at, updated_at)
    VALUES ('e1', 'p1', NULL, 'birth', '1 JAN 1900', 19000101, 'Boston, MA', '2024-01-01', '2024-01-01'),
           ('e2', NULL, 'f1', 'marriage', '14 JUN 1910', 19100614, 'Boston, MA', '2024-01-01', '2024-01-01');
  `);
});

afterEach(() => db.close());

describe('GET /api/v1/people/:id', () => {
  it('includes family-backed events in the person timeline', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/people/p1');
    expect(res.status).toBe(200);
    const eventTypes = res.body.events.map((e: { event_type: string }) => e.event_type);
    expect(eventTypes).toContain('birth');
    expect(eventTypes).toContain('marriage');
    expect(res.body.events.find((e: { event_type: string }) => e.event_type === 'marriage')?.family_id).toBe('f1');
  });
});
