import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { MediaRepository } = await import('./MediaRepository.js');

function seedDB(database: Database.Database) {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE persons (
      id TEXT PRIMARY KEY,
      sex TEXT NOT NULL DEFAULT 'U',
      is_living INTEGER NOT NULL DEFAULT 1,
      is_private INTEGER NOT NULL DEFAULT 0,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE names (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      name_type TEXT DEFAULT 'birth',
      given_name TEXT,
      middle_name TEXT,
      surname TEXT,
      nickname TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      title TEXT,
      description TEXT,
      date_taken TEXT,
      uploaded_by TEXT,
      is_external INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE person_media (
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (person_id, media_id)
    );
    CREATE TABLE media_person_regions (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
      y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
      width REAL NOT NULL CHECK (width > 0 AND width <= 1),
      height REAL NOT NULL CHECK (height > 0 AND height <= 1),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  database.prepare('INSERT INTO persons (id, sex) VALUES (?, ?)').run('person-1', 'F');
  database.prepare('INSERT INTO persons (id, sex) VALUES (?, ?)').run('person-2', 'M');
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)')
    .run('name-1', 'person-1', 'Ruth', 'Apex');
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)')
    .run('name-2', 'person-2', 'Walter', 'Apex');
  database.prepare(
    `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('media-1', 'photo.jpg', 'photo.jpg', 'image/jpeg', 12, '/tmp/photo.jpg');
}

describe('MediaRepository person regions', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterAll(() => {
    db.close();
  });

  it('creates, updates, lists, and deletes media person regions', () => {
    const repo = new MediaRepository();

    const created = repo.createRegion('media-1', {
      person_id: 'person-1',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });

    expect(created.person_given_name).toBe('Ruth');
    expect(created.x).toBe(0.1);
    expect(repo.findRegions('media-1')).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) as count FROM person_media WHERE person_id = ? AND media_id = ?').get('person-1', 'media-1')).toEqual({ count: 1 });

    const updated = repo.updateRegion(created.id, {
      person_id: 'person-2',
      width: 0.35,
      height: 0.45,
    });

    expect(updated?.person_given_name).toBe('Walter');
    expect(updated?.width).toBe(0.35);
    expect(updated?.height).toBe(0.45);
    expect(db.prepare('SELECT COUNT(*) as count FROM person_media WHERE person_id = ? AND media_id = ?').get('person-2', 'media-1')).toEqual({ count: 1 });

    expect(repo.deleteRegion(created.id)).toBe(true);
    expect(repo.findRegions('media-1')).toHaveLength(0);
  });
});
