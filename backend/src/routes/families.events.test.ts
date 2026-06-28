import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { familiesRouter } = await import('./families.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/v1/families', familiesRouter);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE persons (
      id TEXT PRIMARY KEY,
      sex TEXT,
      is_living INTEGER,
      is_private INTEGER,
      gedcom_id TEXT,
      notes TEXT,
      display_name TEXT,
      created_by TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE names (
      id TEXT PRIMARY KEY,
      person_id TEXT,
      name_type TEXT,
      prefix TEXT,
      given_name TEXT,
      middle_name TEXT,
      surname TEXT,
      suffix TEXT,
      nickname TEXT,
      is_primary INTEGER,
      sort_order INTEGER,
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
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      person_id TEXT,
      family_id TEXT,
      event_type TEXT,
      event_date TEXT,
      event_date_qualifier TEXT,
      event_date_sort_key INTEGER,
      event_place TEXT,
      description TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  db.prepare(
    `INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('p1', 'M', 1, 0, 'John Smith', '2024-01-01', '2024-01-01');
  db.prepare(
    `INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run('p2', 'F', 1, 0, 'Jane Doe', '2024-01-01', '2024-01-01');
  db.prepare(
    `INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('n1', 'p1', 'birth', 'John', 'Smith', 1, 0, '2024-01-01', '2024-01-01');
  db.prepare(
    `INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('n2', 'p2', 'birth', 'Jane', 'Doe', 1, 0, '2024-01-01', '2024-01-01');
});

afterEach(() => db.close());

describe('families route event sync', () => {
  it('creates a family marriage event when a family is created', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/v1/families')
      .send({
        spouse1_id: 'p1',
        spouse2_id: 'p2',
        marriage_date: '14 JUN 1910',
        marriage_place: 'Boston, MA',
        marriage_description: 'Ceremony at the chapel',
      });

    expect(res.status).toBe(201);

    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(res.body.id) as { id: string } | undefined;
    expect(family).toBeTruthy();

    const events = db.prepare(
      'SELECT event_type, event_date, event_place, description, family_id, person_id FROM events WHERE family_id = ? ORDER BY event_type'
    ).all(res.body.id) as Array<{
      event_type: string;
      event_date: string | null;
      event_place: string | null;
      description: string | null;
      family_id: string;
      person_id: string | null;
    }>;

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: 'marriage',
      event_date: '14 JUN 1910',
      event_place: 'Boston, MA',
      description: 'Ceremony at the chapel',
      family_id: res.body.id,
      person_id: null,
    });
  });

  it('updates the family event instead of creating duplicates', async () => {
    const app = buildApp();

    const createRes = await request(app)
      .post('/api/v1/families')
      .send({
        spouse1_id: 'p1',
        spouse2_id: 'p2',
        marriage_date: '14 JUN 1910',
        marriage_place: 'Boston, MA',
      });

    expect(createRes.status).toBe(201);

    const updateRes = await request(app)
      .put(`/api/v1/families/${createRes.body.id}`)
      .send({
        marriage_date: '15 JUN 1910',
        marriage_place: 'Cambridge, MA',
        divorce_date: '1 JAN 1920',
        divorce_place: 'Cambridge, MA',
      });

    expect(updateRes.status).toBe(200);

    const events = db.prepare(
      'SELECT event_type, event_date, event_place, family_id FROM events WHERE family_id = ? ORDER BY event_type'
    ).all(createRes.body.id) as Array<{
      event_type: string;
      event_date: string | null;
      event_place: string | null;
      family_id: string;
    }>;

    expect(events).toHaveLength(2);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: 'divorce', event_date: '1 JAN 1920', event_place: 'Cambridge, MA' }),
        expect.objectContaining({ event_type: 'marriage', event_date: '15 JUN 1910', event_place: 'Cambridge, MA' }),
      ])
    );
  });
});
