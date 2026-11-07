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
      db.pragma('foreign_keys = ON');

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
        `INSERT INTO archive_objects (id, object_type, title) VALUES ('person-1', 'person', 'Walter LeFort')`,
      ).run();
      db.prepare(
        `INSERT INTO artifact_identification_history (id, artifact_id, identified_person_id, note)
         VALUES ('hist-1', 'artifact-1', 'person-1', 'Probably Grade 6.')`,
      ).run();

      // A direct edit to the content is blocked.
      expect(() =>
        db.prepare("UPDATE artifact_identification_history SET note = 'edited' WHERE id = 'hist-1'").run(),
      ).toThrow('Identification history entries cannot be modified');

      // Deleting the identified person must not abort: identified_person_id
      // cascades to NULL (ON DELETE SET NULL), which the trigger has to let
      // through, or every person-delete that was ever named in a history
      // entry would fail (ref: PR #66 review).
      db.prepare(`DELETE FROM archive_objects WHERE id = 'person-1'`).run();
      expect(
        db.prepare('SELECT identified_person_id, note FROM artifact_identification_history WHERE id = ?').get('hist-1'),
      ).toEqual({ identified_person_id: null, note: 'Probably Grade 6.' });

      // Deleting the artifact must not abort either: artifact_id cascades
      // (ON DELETE CASCADE), the same lifecycle artifact_files already has.
      db.prepare(`DELETE FROM archive_objects WHERE id = 'artifact-1' AND object_type = 'artifact'`).run();
      expect(db.prepare('SELECT 1 FROM artifact_identification_history WHERE id = ?').get('hist-1')).toBeUndefined();

      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      db.close();
    }
  });
});
