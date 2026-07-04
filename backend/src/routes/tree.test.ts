import Database from 'better-sqlite3';
import { describe, it, expect, beforeAll, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

// Must import after mock
const { treeRouter } = await import('./tree.js');
import express from 'express';
import request from 'supertest';

function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject a fake user on every request
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/v1/tree', treeRouter);
  return app;
}

function seedMinimal(database: Database.Database) {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS persons (
      id TEXT PRIMARY KEY, sex TEXT NOT NULL DEFAULT 'U',
      is_living INTEGER NOT NULL DEFAULT 1, is_private INTEGER NOT NULL DEFAULT 0,
      notes TEXT, created_by TEXT, gedcom_id TEXT, display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS names (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      name_type TEXT DEFAULT 'birth', prefix TEXT, given_name TEXT, middle_name TEXT,
      surname TEXT, suffix TEXT, nickname TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, event_date TEXT, event_date_qualifier TEXT,
      event_date_sort_key INTEGER, event_place TEXT, description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY, spouse1_id TEXT REFERENCES persons(id),
      spouse2_id TEXT REFERENCES persons(id), marriage_date TEXT,
      marriage_date_qualifier TEXT, marriage_date_sort_key INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'child', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
      home_person_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY, file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS person_media (
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (person_id, media_id)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seedRelationshipTables(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS archive_objects (
      id TEXT PRIMARY KEY,
      object_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      privacy_level TEXT NOT NULL DEFAULT 'family',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS relationship_types (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_tree_relevant INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      relationship_type_id TEXT NOT NULL REFERENCES relationship_types(id),
      label TEXT,
      date_text TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS relationship_members (
      id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
      object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      UNIQUE (relationship_id, object_id, role)
    );
  `);
  database.prepare(`INSERT INTO relationship_types (id, code, name, is_tree_relevant) VALUES ('rel_type_family_union', 'family_union', 'Family Union', 1)`).run();
}

describe('GET /api/v1/tree/unconnected-segments', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    seedMinimal(db);

    // User with home_person_id = 'home'
    db.prepare(`INSERT INTO users (id, email, display_name, password_hash, role, home_person_id)
      VALUES ('user-1', 'a@b.com', 'Test', 'x', 'admin', 'home')`).run();

    // Master tree: home → spouse (family f-home)
    db.prepare(`INSERT INTO persons (id, sex) VALUES ('home', 'M'), ('spouse', 'F')`).run();
    db.prepare(`INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-home', 'home', 'spouse')`).run();

    // Disconnected segment: p1 + p2 in family f-disc
    db.prepare(`INSERT INTO persons (id, sex) VALUES ('p1', 'M'), ('p2', 'F')`).run();
    db.prepare(`INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-disc', 'p1', 'p2')`).run();
  });

  it('returns segments not connected to the home person', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/tree/unconnected-segments');
    expect(res.status).toBe(200);
    expect(res.body.segments).toHaveLength(1);
    const segPersonIds = res.body.segments[0].persons.map((p: { id: string }) => p.id);
    expect(segPersonIds).toContain('p1');
    expect(segPersonIds).toContain('p2');
    expect(segPersonIds).not.toContain('home');
    expect(segPersonIds).not.toContain('spouse');
  });

  it('returns empty segments when all people are connected to home', async () => {
    // Fresh db with only home person
    const localDb = new Database(':memory:');
    seedMinimal(localDb);
    localDb.prepare(`INSERT INTO users (id, email, display_name, password_hash, role, home_person_id)
      VALUES ('user-1', 'a@b.com', 'Test', 'x', 'admin', 'solo')`).run();
    localDb.prepare(`INSERT INTO persons (id, sex) VALUES ('solo', 'M')`).run();
    db = localDb;

    const app = buildApp();
    const res = await request(app).get('/api/v1/tree/unconnected-segments');
    expect(res.status).toBe(200);
    expect(res.body.segments).toHaveLength(0);
  });
});

describe('GET /api/v1/tree/unconnected-people', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    seedMinimal(db);

    // User with no home_person_id
    db.prepare(`INSERT INTO users (id, email, display_name, password_hash, role)
      VALUES ('user-1', 'a@b.com', 'Test', 'x', 'admin')`).run();

    // Person A and B in a family (connected)
    db.prepare(`INSERT INTO persons (id, sex) VALUES ('p-a', 'M'), ('p-b', 'F')`).run();
    db.prepare(`INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-1', 'p-a', 'p-b')`).run();

    // Person C — no family (unconnected)
    db.prepare(`INSERT INTO persons (id, sex) VALUES ('p-c', 'U')`).run();
  });

  it('returns only people with no family connections', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/tree/unconnected-people');
    expect(res.status).toBe(200);
    const ids = res.body.people.map((p: { id: string }) => p.id);
    expect(ids).toContain('p-c');
    expect(ids).not.toContain('p-a');
    expect(ids).not.toContain('p-b');
  });
});

describe('GET /api/v1/tree relationship view', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    seedMinimal(db);
    seedRelationshipTables(db);

    db.prepare(`INSERT INTO users (id, email, display_name, password_hash, role, home_person_id)
      VALUES ('user-1', 'a@b.com', 'Test', 'x', 'admin', 'p-parent-1')`).run();

    db.prepare(`INSERT INTO persons (id, sex) VALUES ('p-parent-1', 'M'), ('p-parent-2', 'F'), ('p-child', 'U')`).run();
    db.prepare(`INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES
      ('n-parent-1', 'p-parent-1', 'Alex', 'Apex', 1),
      ('n-parent-2', 'p-parent-2', 'Blair', 'Apex', 1),
      ('n-child', 'p-child', 'Casey', 'Apex', 1)`).run();
    db.prepare(`INSERT INTO archive_objects (id, object_type, title) VALUES
      ('p-parent-1', 'person', 'Alex Apex'),
      ('p-parent-2', 'person', 'Blair Apex'),
      ('p-child', 'person', 'Casey Apex'),
      ('rel-family-1', 'relationship', 'Family Union')`).run();
    db.prepare(`INSERT INTO relationships (id, relationship_type_id, label, date_text)
      VALUES ('rel-family-1', 'rel_type_family_union', 'Family Union', '2000-01-01')`).run();
    db.prepare(`INSERT INTO relationship_members (id, relationship_id, object_id, role, sort_order) VALUES
      ('rm-p1', 'rel-family-1', 'p-parent-1', 'partner', 0),
      ('rm-p2', 'rel-family-1', 'p-parent-2', 'partner', 1),
      ('rm-c', 'rel-family-1', 'p-child', 'child', 2)`).run();
  });

  it('adapts family_union relationships into the existing tree family shape', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/tree');
    expect(res.status).toBe(200);

    const ids = res.body.persons.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['p-parent-1', 'p-parent-2', 'p-child']));
    expect(res.body.families).toEqual([
      {
        id: 'rel-family-1',
        spouse1_id: 'p-parent-1',
        spouse2_id: 'p-parent-2',
        children_ids: ['p-child'],
        marriage_date: '2000-01-01',
      },
    ]);
  });
});
