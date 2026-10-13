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
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'admin' };
    next();
  });
  app.use('/api/v1/families', familiesRouter);
  return app;
}

function seed() {
  db.exec(`
    INSERT INTO persons (id, sex, is_living, is_private, created_at, updated_at)
    VALUES
      ('p1', 'M', 0, 0, '2024-01-01', '2024-01-01'),
      ('p2', 'F', 0, 0, '2024-01-01', '2024-01-01'),
      ('p3', 'M', 0, 0, '2024-01-01', '2024-01-01'),
      ('p4', 'F', 0, 0, '2024-01-01', '2024-01-01');
    INSERT INTO names (id, person_id, given_name, middle_name, surname, is_primary, sort_order)
    VALUES
      ('n1', 'p1', 'Raymond', 'Earl', 'LeFort', 1, 0),
      ('n2', 'p2', 'Eunice', 'Louise', 'Lagor', 1, 0),
      ('n3', 'p3', 'Walter', NULL, 'Jones', 1, 0),
      ('n4', 'p4', 'Mary', NULL, 'Smith', 1, 0);
    INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, created_at, updated_at)
    VALUES
      ('f1', 'p1', 'p2', '12 Jun 1948', '2024-01-01', '2024-01-01'),
      ('f2', 'p3', 'p4', '3 Sep 1952', '2024-01-01', '2024-01-01');
  `);
}

beforeEach(() => {
  db = new Database(':memory:');
  for (const sql of [
    `CREATE TABLE persons (id TEXT PRIMARY KEY, sex TEXT, is_living INTEGER, is_private INTEGER, created_at TEXT, updated_at TEXT, display_name TEXT, home_person_id TEXT, notes TEXT)`,
    `CREATE TABLE names (id TEXT PRIMARY KEY, person_id TEXT, given_name TEXT, surname TEXT, is_primary INTEGER, sort_order INTEGER, name_type TEXT, middle_name TEXT, prefix TEXT, suffix TEXT, nickname TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE families (id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT, marriage_date TEXT, marriage_date_qualifier TEXT, marriage_date_sort_key TEXT, marriage_place TEXT, divorce_date TEXT, divorce_place TEXT, gedcom_id TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE family_members (id TEXT PRIMARY KEY, family_id TEXT, person_id TEXT, role TEXT, sort_order INTEGER, created_at TEXT)`,
    `CREATE TABLE events (id TEXT PRIMARY KEY, person_id TEXT, family_id TEXT, event_type TEXT, event_date TEXT, event_date_qualifier TEXT, event_date_sort_key INTEGER, event_place TEXT, plot TEXT, description TEXT, source_url TEXT, source_url_checked_at TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)`,
  ]) db.exec(sql);
  seed();
});

afterEach(() => db.close());

const search = async (q: string) => {
  const res = await request(buildApp()).get(`/api/v1/families?q=${encodeURIComponent(q)}`);
  expect(res.status).toBe(200);
  return (res.body.data as { id: string }[]).map(family => family.id);
};

/* The family picker searches this endpoint as you type, the way the person
   picker does. Before, the whole query was one LIKE against one field, so a
   full name -- which is what anyone types when looking for a couple -- matched
   nothing. */
describe('GET /api/v1/families?q=', () => {
  it('finds a family by one spouse’s surname', async () => {
    expect(await search('lefort')).toEqual(['f1']);
  });

  it('finds a family by a full name', async () => {
    expect(await search('Raymond LeFort')).toEqual(['f1']);
  });

  it('finds it by a middle name, which is part of how a name is written', async () => {
    expect(await search('Earl LeFort')).toEqual(['f1']);
  });

  /* Either word may land on either spouse: nobody remembers which one the
     archive recorded first. */
  it('matches words across both spouses, in either order', async () => {
    expect(await search('lefort lagor')).toEqual(['f1']);
    expect(await search('lagor lefort')).toEqual(['f1']);
  });

  it('every word has to match, so one wrong word finds nothing', async () => {
    expect(await search('lefort jones')).toEqual([]);
  });

  it('returns the couple by name, not by id', async () => {
    const res = await request(buildApp()).get('/api/v1/families?q=lefort');
    expect(res.body.data[0].spouse1).toMatchObject({ given_name: 'Raymond', surname: 'LeFort' });
    expect(res.body.data[0].spouse2).toMatchObject({ given_name: 'Eunice', surname: 'Lagor' });
  });

  /* The picker re-resolves the family it was handed by id, so the detail
     endpoint has to name the couple the same way the list does. If it ever
     nested them differently, every selection would show the right names and
     then flip to "Unknown Family". */
  it('names the couple the same way on the detail endpoint', async () => {
    const res = await request(buildApp()).get('/api/v1/families/f1');

    expect(res.status).toBe(200);
    expect(res.body.spouse1).toMatchObject({ given_name: 'Raymond', surname: 'LeFort' });
    expect(res.body.spouse2).toMatchObject({ given_name: 'Eunice', surname: 'Lagor' });
    expect(res.body.marriage_date).toBe('12 Jun 1948');
  });

  it('lists everything when nothing is typed', async () => {
    expect((await search('')).sort()).toEqual(['f1', 'f2']);
  });
});
