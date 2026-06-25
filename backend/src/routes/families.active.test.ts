import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

// Must import after mock
const { familiesRouter } = await import('./families.js');
import express from 'express';
import request from 'supertest';

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

function seed() {
  db.exec(`
    INSERT INTO persons (id, sex, is_living, is_private, created_at, updated_at)
    VALUES
      ('p1', 'M', 1, 0, '2024-01-01', '2024-01-01'),
      ('p2', 'F', 1, 0, '2024-01-01', '2024-01-01'),
      ('p3', 'F', 1, 0, '2024-01-01', '2024-01-01');
    INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, divorce_date, created_at, updated_at)
    VALUES
      ('f1', 'p1', 'p2', '1 Jan 1990', NULL, '2024-01-01', '2024-01-01'),
      ('f2', 'p1', 'p3', '1 Jan 2005', '1 Jan 2010', '2024-01-01', '2024-01-01');
  `);
}

beforeEach(() => {
  db = new Database(':memory:');
  const migrations = [
    `CREATE TABLE persons (id TEXT PRIMARY KEY, sex TEXT, is_living INTEGER, is_private INTEGER, created_at TEXT, updated_at TEXT, display_name TEXT, home_person_id TEXT, notes TEXT)`,
    `CREATE TABLE names (id TEXT PRIMARY KEY, person_id TEXT, given_name TEXT, surname TEXT, is_primary INTEGER, sort_order INTEGER, name_type TEXT, middle_name TEXT, prefix TEXT, suffix TEXT, nickname TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE families (id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT, marriage_date TEXT, marriage_date_qualifier TEXT, marriage_date_sort_key TEXT, marriage_place TEXT, divorce_date TEXT, divorce_place TEXT, gedcom_id TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE family_members (id TEXT PRIMARY KEY, family_id TEXT, person_id TEXT, role TEXT, sort_order INTEGER, created_at TEXT)`,
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)`,
  ];
  for (const sql of migrations) db.exec(sql);
  seed();
});

afterEach(() => db.close());

describe('GET /api/v1/families/person/:personId/active', () => {
  it('returns active marriages (divorce_date IS NULL) for the person', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/families/person/p1/active');
    expect(res.status).toBe(200);
    expect(res.body.activeMarriages).toHaveLength(1);
    expect(res.body.activeMarriages[0].id).toBe('f1');
  });

  it('excludes marriages with a divorce_date', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/families/person/p1/active');
    const ids = res.body.activeMarriages.map((m: { id: string }) => m.id);
    expect(ids).not.toContain('f2');
  });

  it('returns empty array when person has no active marriages', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/families/person/p3/active');
    expect(res.status).toBe(200);
    expect(res.body.activeMarriages).toHaveLength(0);
  });

  it('returns the marriage regardless of which spouse slot the person is in', async () => {
    // p2 is in spouse2 slot of f1
    const app = buildApp();
    const res = await request(app).get('/api/v1/families/person/p2/active');
    expect(res.body.activeMarriages).toHaveLength(1);
    expect(res.body.activeMarriages[0].id).toBe('f1');
  });
});
