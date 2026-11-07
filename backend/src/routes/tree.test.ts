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
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'admin' };
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
      source_url TEXT,
      source_url_checked_at TEXT,
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

  /* The family_union relationship mirror of a legacy family is only ever
     rewritten by syncFamilyUnionFromLegacyFamily, which always copies the
     full current spouse/child list -- so it should never be missing a child
     family_members has. But a write path that inserts into family_members
     directly without going through FamilyRepository (a data migration's raw
     SQL, for one) leaves the mirror stale, and the home person's own family
     can be one of them. getAllTreeFamilies must still treat family_members
     as the real list, or a stale mirror quietly loses a child -- and
     everyone who descends from that child -- out of the connected tree. */
  it('treats a stale family_union mirror as additional data, not a replacement for family_members', async () => {
    const localDb = new Database(':memory:');
    seedMinimal(localDb);
    seedRelationshipTables(localDb);
    localDb.prepare(`INSERT INTO users (id, email, display_name, password_hash, role, home_person_id)
      VALUES ('user-1', 'a@b.com', 'Test', 'x', 'admin', 'home')`).run();

    // home + spouse have two children in family_members: 'synced-kid' (whose
    // sync ran) and 'late-kid' (added after, e.g. by a raw-SQL migration,
    // so the mirror below never picked it up). late-kid has their own
    // spouse and child, who should be reachable through them.
    localDb.prepare(`INSERT INTO persons (id, sex) VALUES
      ('home', 'M'), ('spouse', 'F'), ('synced-kid', 'F'), ('late-kid', 'F'),
      ('late-kid-spouse', 'M'), ('grandkid', 'F')`).run();
    localDb.prepare(`INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-home', 'home', 'spouse')`).run();
    localDb.prepare(`INSERT INTO family_members (id, family_id, person_id, role) VALUES
      ('fm1', 'f-home', 'synced-kid', 'child'), ('fm2', 'f-home', 'late-kid', 'child')`).run();
    localDb.prepare(`INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-late-kid', 'late-kid', 'late-kid-spouse')`).run();
    localDb.prepare(`INSERT INTO family_members (id, family_id, person_id, role) VALUES ('fm3', 'f-late-kid', 'grandkid', 'child')`).run();

    // The stale mirror: archive objects for everyone but only 'synced-kid'
    // as a family_union member, exactly as if sync ran before late-kid
    // existed and never ran again.
    for (const id of ['home', 'spouse', 'synced-kid', 'late-kid']) {
      localDb.prepare(`INSERT INTO archive_objects (id, object_type, title) VALUES (?, 'person', ?)`).run(id, id);
    }
    localDb.prepare(`INSERT INTO archive_objects (id, object_type, title) VALUES ('f-home', 'relationship', 'Family Union')`).run();
    localDb.prepare(`INSERT INTO relationships (id, relationship_type_id, date_text) VALUES ('f-home', 'rel_type_family_union', NULL)`).run();
    localDb.prepare(`INSERT INTO relationship_members (id, relationship_id, object_id, role, sort_order) VALUES
      ('m1', 'f-home', 'home', 'partner', 0),
      ('m2', 'f-home', 'spouse', 'partner', 1),
      ('m3', 'f-home', 'synced-kid', 'child', 0)`).run();

    db = localDb;
    const app = buildApp();
    const res = await request(app).get('/api/v1/tree/unconnected-segments');
    expect(res.status).toBe(200);
    // late-kid, their spouse and their child must all still be connected --
    // none of this family should show up as a separate, unconnected branch.
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
