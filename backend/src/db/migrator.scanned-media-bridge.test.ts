import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCustomFunctions } from './connection.js';
import { runMigrations } from './migrator.js';
import type { Logger } from '../services/logger.js';

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');

const logger: Logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const tempDirs: string[] = [];

/**
 * The migration set up to and including `maxVersion`, so a scanned media row
 * can be inserted at the point in history where scanDirectory left it
 * unbridged and 077 can then be applied over it.
 */
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

describe('077 — scanned media artifact bridge', () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('gives a scanned media item the artifact identity the scanner never wrote', () => {
    const db = new Database(':memory:');
    registerCustomFunctions(db);

    try {
      runMigrations(db, createMigrationDir(76), logger);

      // A letter as scanDirectory recorded it before the fix: a media row,
      // is_external, with nothing in archive_objects.
      db.prepare(
        `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, is_external)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      ).run('media-letter', 'letter.pdf', 'letter.pdf', 'application/pdf', 2048, '/media/letters/letter.pdf');
      db.prepare(
        `INSERT INTO persons (id, sex, is_living) VALUES ('person-writer', 'F', 0)`,
      ).run();
      db.prepare(
        `INSERT INTO archive_objects (id, object_type, title) VALUES ('person-writer', 'person', 'Test Writer')`,
      ).run();
      db.prepare(
        'INSERT INTO person_media (person_id, media_id, is_primary, sort_order) VALUES (?, ?, 0, 0)',
      ).run('person-writer', 'media-letter');

      expect(db.prepare('SELECT 1 FROM artifacts WHERE id = ?').get('media-letter')).toBeUndefined();

      runMigrations(db, migrationsDir, logger);

      // The id is reused, which is what lets /api/v1/media/:id and
      // /api/v1/artifacts/:id describe the same letter.
      expect(
        db.prepare(
          `SELECT ao.title, ao.object_type, a.artifact_type_id, a.original_format,
                  af.storage_path, af.file_role
             FROM archive_objects ao
             JOIN artifacts a ON a.id = ao.id
             JOIN artifact_files af ON af.artifact_id = ao.id
            WHERE ao.id = 'media-letter'`,
        ).get(),
      ).toMatchObject({
        title: 'letter.pdf',
        object_type: 'artifact',
        artifact_type_id: 'artifact_type_document',
        original_format: 'application/pdf',
        storage_path: '/media/letters/letter.pdf',
        file_role: 'primary',
      });

      // And 063's "appears in" relationship, so the letter reaches the person
      // through the archive model rather than only through person_media.
      expect(
        db.prepare(
          `SELECT rm.role, rm.object_id FROM relationship_members rm
            WHERE rm.relationship_id = 'rel_appears_in_media_media-letter'
            ORDER BY rm.role`,
        ).all(),
      ).toEqual([
        { role: 'artifact', object_id: 'media-letter' },
        { role: 'subject', object_id: 'person-writer' },
      ]);

      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('leaves an already-catalogued artifact alone', () => {
    const db = new Database(':memory:');
    registerCustomFunctions(db);

    try {
      runMigrations(db, createMigrationDir(76), logger);

      db.prepare(
        `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, title, is_external)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      ).run('media-typed', 'cert.pdf', 'cert.pdf', 'application/pdf', 512, '/media/cert.pdf', 'Birth Certificate');
      db.prepare(
        `INSERT INTO archive_objects (id, object_type, title) VALUES ('media-typed', 'artifact', 'Birth Certificate')`,
      ).run();
      // Re-typed by hand from Document, which is the work 077 must not undo.
      db.prepare(
        `INSERT INTO artifacts (id, artifact_type_id) VALUES ('media-typed', 'artifact_type_certificate')`,
      ).run();

      runMigrations(db, migrationsDir, logger);

      expect(db.prepare('SELECT artifact_type_id FROM artifacts WHERE id = ?').get('media-typed')).toEqual({
        artifact_type_id: 'artifact_type_certificate',
      });
    } finally {
      db.close();
    }
  });
});
