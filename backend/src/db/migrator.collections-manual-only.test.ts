import Database from 'better-sqlite3';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerCustomFunctions } from './connection.js';
import { runMigrations } from './migrator.js';
import type { Logger } from '../services/logger.js';

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger: Logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
});

afterEach(() => db.close());

/** The DDL SQLite has stored for a table, with whitespace flattened. */
function ddl(table: string): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { sql: string } | undefined;
  return (row?.sql ?? '').replace(/\s+/g, ' ');
}

describe('060 — collections are manual only', () => {
  it('drops smart from the collection_type constraint', () => {
    expect(ddl('collections')).toContain("CHECK (collection_type IN ('manual'))");
    expect(ddl('collections')).not.toContain("'smart'");
  });

  it('rejects a smart collection at the database level', () => {
    db.prepare(
      "INSERT INTO archive_objects (id, object_type, title) VALUES ('obj-c1', 'collection', 'Test')",
    ).run();
    expect(() =>
      db.prepare("INSERT INTO collections (id, collection_type) VALUES ('obj-c1', 'smart')").run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('still accepts a manual collection', () => {
    db.prepare(
      "INSERT INTO archive_objects (id, object_type, title) VALUES ('obj-c2', 'collection', 'Test')",
    ).run();
    db.prepare("INSERT INTO collections (id, collection_type) VALUES ('obj-c2', 'manual')").run();
    expect(
      db.prepare("SELECT collection_type FROM collections WHERE id = 'obj-c2'").get(),
    ).toEqual({ collection_type: 'manual' });
  });

  // 031 and 041 each renamed "events" out of the way before dropping it, which
  // made SQLite rewrite other tables' foreign keys to point at the renamed
  // table — and then that table was dropped. 056 had to repair it twice. This
  // migration rebuilds "collections" the safe way round, so collection_items
  // must still reference "collections" and not "collections_new".
  it('leaves collection_items pointing at collections, not the scratch table', () => {
    const items = ddl('collection_items');
    expect(items).toContain('REFERENCES collections(id)');
    expect(items).not.toContain('collections_new');
    expect(ddl('collections_new')).toBe('');
  });

  it('cascades a collection delete to its items without a missing-table error', () => {
    db.prepare(
      "INSERT INTO archive_objects (id, object_type, title) VALUES ('obj-c3', 'collection', 'Test')",
    ).run();
    db.prepare(
      "INSERT INTO archive_objects (id, object_type, title) VALUES ('obj-p1', 'person', 'Someone')",
    ).run();
    db.prepare("INSERT INTO collections (id) VALUES ('obj-c3')").run();
    db.prepare(
      "INSERT INTO collection_items (id, collection_id, item_object_id) VALUES ('ci-1', 'obj-c3', 'obj-p1')",
    ).run();

    expect(() => db.prepare("DELETE FROM collections WHERE id = 'obj-c3'").run()).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) c FROM collection_items').get()).toEqual({ c: 0 });
  });

  it('keeps the foreign key graph clean', () => {
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('060 — belongs_to_collection is retired', () => {
  it('adds an is_active flag defaulting to on', () => {
    const cols = db.pragma('table_info(relationship_types)') as Array<{ name: string; dflt_value: string }>;
    const active = cols.find((c) => c.name === 'is_active');
    expect(active).toBeDefined();
    expect(active?.dflt_value).toBe('1');
  });

  it('marks only belongs_to_collection inactive', () => {
    const inactive = db
      .prepare('SELECT code FROM relationship_types WHERE is_active = 0')
      .all() as Array<{ code: string }>;
    expect(inactive.map((r) => r.code)).toEqual(['belongs_to_collection']);
  });

  it('keeps the row and its roles rather than deleting them', () => {
    expect(
      db.prepare("SELECT 1 FROM relationship_types WHERE code = 'belongs_to_collection'").get(),
    ).toBeTruthy();
    const roles = db
      .prepare(
        `SELECT COUNT(*) c FROM relationship_type_roles
          WHERE relationship_type_id = 'rel_type_belongs_to_collection'`,
      )
      .get() as { c: number };
    expect(roles.c).toBeGreaterThan(0);
  });
});
