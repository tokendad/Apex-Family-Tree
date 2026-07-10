import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('MediaRepository scanDirectory', () => {
  let tmpDir: string;

  beforeAll(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-media-scan-'));
    db.exec('DELETE FROM media_items');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('relinks a file that moved into a subfolder instead of creating a duplicate row', () => {
    const repo = new MediaRepository();

    // Simulate a file that was scanned once at the top level of the media dir.
    const originalPath = path.join(tmpDir, 'photo.jpg');
    fs.writeFileSync(originalPath, 'hello-world-content');
    repo.scanDirectory(tmpDir);

    const beforeCount = (db.prepare('SELECT COUNT(*) as c FROM media_items').get() as { c: number }).c;
    expect(beforeCount).toBe(1);

    // Simulate the user reorganizing the file into a subfolder on disk.
    const subDir = path.join(tmpDir, 'Family');
    fs.mkdirSync(subDir);
    const movedPath = path.join(subDir, 'photo.jpg');
    fs.renameSync(originalPath, movedPath);

    const result = repo.scanDirectory(tmpDir);

    const rows = db.prepare('SELECT file_path FROM media_items').all() as { file_path: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].file_path).toBe(movedPath);
    expect(result.relinked).toBe(1);
    expect(result.added).toBe(0);
  });

  it('cleans up a pre-existing orphaned duplicate that already has a live counterpart', () => {
    const repo = new MediaRepository();

    // Simulate two historical scans: one that already recorded the file at
    // its current (live) subfolder path, and an older orphaned row left
    // over from before the file was moved there.
    const subDir = path.join(tmpDir, 'Family');
    fs.mkdirSync(subDir);
    const livePath = path.join(subDir, 'photo.jpg');
    fs.writeFileSync(livePath, 'hello-world-content');
    const size = fs.statSync(livePath).size;

    db.prepare(
      `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, is_external)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run('live-1', 'photo.jpg', 'photo.jpg', 'image/jpeg', size, livePath);

    const staleAbsentPath = path.join(tmpDir, 'photo.jpg');
    db.prepare(
      `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, is_external)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ).run('stale-1', 'photo.jpg', 'photo.jpg', 'image/jpeg', size, staleAbsentPath);

    const result = repo.scanDirectory(tmpDir);

    const rows = db.prepare('SELECT id, file_path FROM media_items').all() as { id: string; file_path: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('live-1');
    expect(rows[0].file_path).toBe(livePath);
    expect(result.removed).toBe(1);
  });
});
