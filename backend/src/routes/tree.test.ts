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
