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

  // An occupation event like the GEDCOM import produces: attached to a person
  // via events.person_id, with nothing in the relationship graph.
  db.prepare(
    "INSERT INTO events (id, person_id, event_type, event_date, description) VALUES ('e-occu', 'p-ray', 'occupation', '1982', 'Segment Treater')",
  ).run();

  db.prepare("INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-1', 'p-ray', 'p-jen')").run();
  db.prepare(
    "INSERT INTO events (id, family_id, event_type, event_date) VALUES ('e-marr', 'f-1', 'marriage', '28 SEP 2008')",
  ).run();
});

afterEach(() => {
  db.close();
});

describe('GET /events/:id — subject resolution', () => {
  it('names the person a person event belongs to', async () => {
    const res = await request(buildApp()).get('/api/v1/events/e-occu');
    expect(res.status).toBe(200);
    expect(res.body.person).toMatchObject({
      id: 'p-ray',
      given_name: 'Raymond',
      surname: 'LeFort',
    });
    expect(res.body.family).toBeNull();
  });

  it('names both partners of a family event', async () => {
    const res = await request(buildApp()).get('/api/v1/events/e-marr');
    expect(res.status).toBe(200);
    expect(res.body.person).toBeNull();
    expect(res.body.family.id).toBe('f-1');
    expect(res.body.family.spouse1).toMatchObject({ given_name: 'Raymond' });
    expect(res.body.family.spouse2).toMatchObject({ given_name: 'Jennifer' });
  });

  it('keeps the subject on the update response so an edit does not drop it', async () => {
    const res = await request(buildApp())
      .put('/api/v1/events/e-occu')
      .send({ event_type: 'occupation', event_date: '1983', description: 'Segment Treater' });
    expect(res.status).toBe(200);
    expect(res.body.event_date).toBe('1983');
    expect(res.body.person).toMatchObject({ id: 'p-ray', given_name: 'Raymond' });
  });
});
