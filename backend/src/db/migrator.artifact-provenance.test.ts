import Database from 'better-sqlite3';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { registerCustomFunctions } from './connection.js';
import { runMigrations } from './migrator.js';
import type { Logger } from '../services/logger.js';

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');

const logger: Logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

describe('167 — artifact provenance', () => {
  it('adds digitized_at/provenance_confidence_notes and an append-only identification history', () => {
    const db = new Database(':memory:');
    registerCustomFunctions(db);

    try {
      runMigrations(db, migrationsDir, logger);

      db.prepare(
        `INSERT INTO archive_objects (id, object_type, title) VALUES ('artifact-1', 'artifact', 'Class Photo')`,
      ).run();
      db.prepare(
        `INSERT INTO artifacts (id, artifact_type_id, digitized_at, provenance_confidence_notes)
         VALUES ('artifact-1', 'artifact_type_photo', '2026-06-22', 'Matched by clothing; not fully certain.')`,
      ).run();

      expect(
        db.prepare('SELECT digitized_at, provenance_confidence_notes FROM artifacts WHERE id = ?').get('artifact-1'),
      ).toEqual({ digitized_at: '2026-06-22', provenance_confidence_notes: 'Matched by clothing; not fully certain.' });

      db.prepare(
        `INSERT INTO artifact_identification_history (id, artifact_id, note) VALUES ('hist-1', 'artifact-1', 'Probably Grade 6.')`,
      ).run();

      expect(() =>
        db.prepare("UPDATE artifact_identification_history SET note = 'edited' WHERE id = 'hist-1'").run(),
      ).toThrow('Identification history entries cannot be modified');

      expect(() =>
        db.prepare("DELETE FROM artifact_identification_history WHERE id = 'hist-1'").run(),
      ).toThrow('Identification history entries cannot be deleted');

      expect(db.prepare('SELECT note FROM artifact_identification_history WHERE id = ?').get('hist-1')).toEqual({
        note: 'Probably Grade 6.',
      });

      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      db.close();
    }
  });
});
