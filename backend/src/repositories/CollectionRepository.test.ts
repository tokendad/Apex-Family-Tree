import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { CollectionRepository } = await import('./CollectionRepository.js');

function seedDB(database: Database.Database) {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY,
      object_type TEXT NOT NULL CHECK (object_type IN (
        'person', 'artifact', 'event', 'place', 'story', 'collection', 'claim', 'relationship'
      )),
      title TEXT NOT NULL,
      summary TEXT,
      privacy_level TEXT NOT NULL DEFAULT 'family' CHECK (privacy_level IN ('public', 'family', 'private', 'restricted')),
      is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      updated_by TEXT
    );
    CREATE TABLE artifacts (id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE);
    CREATE TABLE collections (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      collection_type TEXT NOT NULL DEFAULT 'manual' CHECK (collection_type IN ('manual', 'smart')),
      description TEXT,
      cover_artifact_id TEXT REFERENCES artifacts(id),
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE collection_items (
      id TEXT PRIMARY KEY,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      item_object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      added_by TEXT,
      UNIQUE (collection_id, item_object_id)
    );
    CREATE TABLE tags (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      description TEXT,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE object_tags (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (object_id, tag_id)
    );
  `);

  database.prepare('INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, 0, datetime(\'now\'), datetime(\'now\'))')
    .run('person-1', 'person', 'Ada Lovelace', 'family');
  database.prepare('INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, 0, datetime(\'now\'), datetime(\'now\'))')
    .run('artifact-1', 'artifact', 'Family Photo', 'family');
  database.prepare('INSERT INTO artifacts (id) VALUES (?)').run('artifact-1');
}

describe('CollectionRepository', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a collection and matching archive object', () => {
    const repo = new CollectionRepository();

    const collection = repo.create({
      title: 'Christmas Through the Years',
      summary: 'A seasonal family story',
      description: 'Photos, events, and people from family Christmases.',
      created_by: 'user-1',
    });

    expect(collection).toMatchObject({
      object_type: 'collection',
      title: 'Christmas Through the Years',
      summary: 'A seasonal family story',
      description: 'Photos, events, and people from family Christmases.',
      item_count: 0,
      created_by: 'user-1',
    });
  });

  it('adds mixed archive objects, preserves ordering, and rejects duplicates', () => {
    const repo = new CollectionRepository();
    const collection = repo.create({ title: 'Military Service' });

    repo.addItem(collection.id, { item_object_id: 'artifact-1', caption: 'Uniform photo', sort_order: 20 });
    repo.addItem(collection.id, { item_object_id: 'person-1', caption: 'Ancestor profile', sort_order: 10 });

    expect(repo.findItems(collection.id).map(item => [item.object_type, item.title, item.caption])).toEqual([
      ['person', 'Ada Lovelace', 'Ancestor profile'],
      ['artifact', 'Family Photo', 'Uniform photo'],
    ]);
    expect(() => repo.addItem(collection.id, { item_object_id: 'person-1' })).toThrow();
  });

  it('updates collection metadata and soft deletes the collection', () => {
    const repo = new CollectionRepository();
    const collection = repo.create({ title: 'Recipes' });

    const updated = repo.update(collection.id, { title: 'Family Recipes', privacy_level: 'private', updated_by: 'user-2' });
    expect(updated).toMatchObject({ title: 'Family Recipes', privacy_level: 'private', updated_by: 'user-2' });

    expect(repo.delete(collection.id, 'user-3')).toBe(true);
    expect(repo.findById(collection.id)).toBeUndefined();
  });

  it('assigns tags to archive objects case-insensitively', () => {
    const repo = new CollectionRepository();
    const collection = repo.create({ title: 'School Records' });

    repo.addTagToObject(collection.id, 'School');
    repo.addTagToObject(collection.id, 'school');

    expect(repo.findTagsForObject(collection.id).map(tag => tag.name)).toEqual(['School']);
  });
});
