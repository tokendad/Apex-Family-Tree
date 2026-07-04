import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { PlaceRepository } = await import('./PlaceRepository.js');

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
    CREATE TABLE places (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      normalized_name TEXT NOT NULL UNIQUE,
      place_type TEXT,
      address_text TEXT,
      locality TEXT,
      region TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      notes TEXT
    );
    CREATE TABLE place_aliases (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      source TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (place_id, alias)
    );
  `);
}

describe('PlaceRepository', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates, searches, updates, aliases, and soft deletes places', () => {
    const repo = new PlaceRepository();

    const place = repo.create({
      title: '  Denver, Colorado  ',
      summary: 'Family home city',
      place_type: 'city',
      locality: 'Denver',
      region: 'Colorado',
      country: 'United States',
      aliases: ['Denver CO', 'Denver, Colorado'],
      created_by: 'user-1',
    });

    expect(place).toMatchObject({
      object_type: 'place',
      title: 'Denver, Colorado',
      normalized_name: 'denver, colorado',
      locality: 'Denver',
      created_by: 'user-1',
    });
    expect(repo.findAliases(place.id).map(alias => alias.alias)).toEqual(['Denver, Colorado', 'Denver CO']);
    expect(repo.findAll({ search: 'colorado' }).data.map(row => row.title)).toEqual(['Denver, Colorado']);

    const updated = repo.update(place.id, {
      title: 'Denver County, Colorado',
      aliases: ['Denver County'],
      privacy_level: 'private',
      updated_by: 'user-2',
    });

    expect(updated).toMatchObject({
      title: 'Denver County, Colorado',
      normalized_name: 'denver county, colorado',
      privacy_level: 'private',
      updated_by: 'user-2',
    });
    expect(repo.findAliases(place.id).map(alias => alias.alias)).toEqual(['Denver County, Colorado', 'Denver County']);

    expect(repo.delete(place.id, 'user-3')).toBe(true);
    expect(repo.findById(place.id)).toBeUndefined();
    expect(repo.findAll().data).toEqual([]);
  });
});
