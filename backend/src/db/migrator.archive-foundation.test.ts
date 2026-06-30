import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCustomFunctions } from './connection.js';
import { runMigrations } from './migrator.js';
import type { Logger } from '../services/logger.js';

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');

const logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const tempDirs: string[] = [];

function createMigrationDir(maxVersion: number): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-migrations-'));
  tempDirs.push(tempDir);

  for (const file of fs.readdirSync(migrationsDir)) {
    if (!file.endsWith('.sql') || file.endsWith('-down.sql')) continue;

    const version = Number(file.slice(0, 3));
    if (Number.isNaN(version) || version > maxVersion) continue;

    fs.copyFileSync(path.join(migrationsDir, file), path.join(tempDir, file));
  }

  return tempDir;
}

function createDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  registerCustomFunctions(db);
  return db;
}

describe('archive foundation migration', () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('applies on a clean database and seeds archive lookup contracts', () => {
    const db = createDatabase();

    try {
      runMigrations(db, migrationsDir, logger);

      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'archive_objects'").get()).toBeTruthy();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'artifacts'").get()).toBeTruthy();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'artifact_files'").get()).toBeTruthy();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'relationships'").get()).toBeTruthy();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'relationship_members'").get()).toBeTruthy();
      expect(db.prepare('SELECT COUNT(*) AS count FROM artifact_types').get()).toEqual({ count: 12 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM evidence_classifications').get()).toEqual({ count: 8 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM confidence_levels').get()).toEqual({ count: 6 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM relationship_types').get()).toEqual({ count: 23 });

      expect(db.prepare('SELECT is_tree_relevant FROM relationship_types WHERE code = ?').get('family_union')).toEqual({
        is_tree_relevant: 1,
      });
      expect(db.prepare('SELECT COUNT(*) AS count FROM relationship_type_roles WHERE relationship_type_id = ?').get('rel_type_appears_in')).toEqual({
        count: 2,
      });
    } finally {
      db.close();
    }
  });

  it('backfills existing persons as archive objects without replacing legacy person tables', () => {
    const db = createDatabase();

    try {
      runMigrations(db, createMigrationDir(41), logger);

      db.prepare(`
        INSERT INTO persons (id, sex, is_living, is_private, notes, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('person-private', 'F', 1, 1, 'Private notes', 'Aunt Ruth', '2026-01-01 00:00:00', '2026-01-02 00:00:00');
      db.prepare(`
        INSERT INTO persons (id, sex, is_living, is_private, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('person-named', 'M', 0, 0, null, '2026-01-03 00:00:00', '2026-01-04 00:00:00');
      db.prepare(`
        INSERT INTO persons (id, sex, is_living, is_private, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('person-unknown', 'U', 1, 0, null, '2026-01-05 00:00:00', '2026-01-06 00:00:00');

      db.prepare(`
        INSERT INTO names (id, person_id, given_name, middle_name, surname, is_primary, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('name-named', 'person-named', 'Walter', 'Earl', 'LeFort', 1, 0);

      runMigrations(db, createMigrationDir(42), logger);

      expect(db.prepare('SELECT COUNT(*) AS count FROM persons').get()).toEqual({ count: 3 });
      expect(db.prepare('SELECT COUNT(*) AS count FROM archive_objects WHERE object_type = ?').get('person')).toEqual({ count: 3 });
      expect(db.prepare('SELECT title, privacy_level, summary FROM archive_objects WHERE id = ?').get('person-private')).toEqual({
        title: 'Aunt Ruth',
        privacy_level: 'private',
        summary: 'Private notes',
      });
      expect(db.prepare('SELECT title, privacy_level FROM archive_objects WHERE id = ?').get('person-named')).toEqual({
        title: 'Walter Earl LeFort',
        privacy_level: 'family',
      });
      expect(db.prepare('SELECT title FROM archive_objects WHERE id = ?').get('person-unknown')).toEqual({
        title: 'Unknown Person',
      });
    } finally {
      db.close();
    }
  });
});
