import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { ArtifactRepository } = await import('./ArtifactRepository.js');

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
    CREATE TABLE artifact_types (
      id TEXT PRIMARY KEY,
      parent_type_id TEXT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE evidence_classifications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      default_weight INTEGER,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      artifact_type_id TEXT NOT NULL REFERENCES artifact_types(id),
      evidence_classification_id TEXT REFERENCES evidence_classifications(id),
      original_date_text TEXT,
      original_date_start TEXT,
      original_date_end TEXT,
      date_precision TEXT,
      date_qualifier TEXT,
      creator_text TEXT,
      physical_location TEXT,
      original_format TEXT,
      condition_notes TEXT,
      language TEXT,
      transcription TEXT,
      notes TEXT,
      digitized_at TEXT,
      provenance_confidence_notes TEXT
    );
    CREATE TABLE confidence_levels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      numeric_value INTEGER,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE artifact_identification_history (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      identified_person_id TEXT REFERENCES archive_objects(id) ON DELETE SET NULL,
      identifier_person_id TEXT REFERENCES archive_objects(id) ON DELETE SET NULL,
      confidence_level_id TEXT REFERENCES confidence_levels(id),
      note TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TRIGGER artifact_identification_history_no_update
    BEFORE UPDATE ON artifact_identification_history
    WHEN NEW.note IS NOT OLD.note
      OR NEW.artifact_id IS NOT OLD.artifact_id
      OR NEW.confidence_level_id IS NOT OLD.confidence_level_id
      OR NEW.created_by IS NOT OLD.created_by
      OR NEW.created_at IS NOT OLD.created_at
    BEGIN
      SELECT RAISE(ABORT, 'Identification history entries cannot be modified');
    END;
  `);

  database.prepare('INSERT INTO artifact_types (id, name, is_system, sort_order) VALUES (?, ?, 1, ?)').run('artifact_type_uncategorized', 'Uncategorized', 0);
  database.prepare('INSERT INTO artifact_types (id, name, is_system, sort_order) VALUES (?, ?, 1, ?)').run('artifact_type_photo', 'Photo', 10);
  database.prepare('INSERT INTO artifact_types (id, name, is_system, sort_order) VALUES (?, ?, 1, ?)').run('artifact_type_letter', 'Letter', 20);
  database.prepare('INSERT INTO evidence_classifications (id, name, default_weight, is_system, sort_order) VALUES (?, ?, ?, 1, ?)')
    .run('evidence_personal_artifact', 'Personal Artifact', 45, 10);
  database.prepare('INSERT INTO confidence_levels (id, name, numeric_value, is_system, sort_order) VALUES (?, ?, ?, 1, ?)')
    .run('confidence_probable', 'Probable', 70, 10);
}

describe('ArtifactRepository', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates an artifact and matching archive object transactionally', () => {
    const repo = new ArtifactRepository();

    const artifact = repo.create({
      title: '  Christmas Morning 1989  ',
      summary: 'Family photo by the tree',
      artifact_type_id: 'artifact_type_photo',
      evidence_classification_id: 'evidence_personal_artifact',
      original_date_text: '25 DEC 1989',
      creator_text: 'Aunt Susan',
      physical_location: 'Family album',
      notes: 'First metadata-only artifact',
      created_by: 'user-1',
    });

    expect(artifact).toMatchObject({
      object_type: 'artifact',
      title: 'Christmas Morning 1989',
      summary: 'Family photo by the tree',
      artifact_type_id: 'artifact_type_photo',
      artifact_type_name: 'Photo',
      evidence_classification_name: 'Personal Artifact',
      original_date_text: '25 DEC 1989',
      creator_text: 'Aunt Susan',
      physical_location: 'Family album',
      notes: 'First metadata-only artifact',
      created_by: 'user-1',
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM archive_objects WHERE id = ?').get(artifact.id)).toEqual({ count: 1 });
  });

  it('lists, searches, updates, and soft deletes artifacts', () => {
    const repo = new ArtifactRepository();

    const photo = repo.create({ title: 'Christmas Photo', artifact_type_id: 'artifact_type_photo', summary: 'Holiday image' });
    repo.create({ title: 'Draft Letter', artifact_type_id: 'artifact_type_letter', creator_text: 'Walter' });

    expect(repo.findAll({ search: 'letter' }).data.map(row => row.title)).toEqual(['Draft Letter']);

    const updated = repo.update(photo.id, {
      title: 'Christmas Morning Photo',
      artifact_type_id: 'artifact_type_photo',
      evidence_classification_id: 'evidence_personal_artifact',
      privacy_level: 'private',
      updated_by: 'user-2',
    });

    expect(updated).toMatchObject({
      title: 'Christmas Morning Photo',
      privacy_level: 'private',
      evidence_classification_name: 'Personal Artifact',
      updated_by: 'user-2',
    });

    expect(repo.delete(photo.id, 'user-3')).toBe(true);
    expect(repo.findById(photo.id)).toBeUndefined();
    expect(repo.findAll().data.map(row => row.title)).toEqual(['Draft Letter']);
  });

  it('returns lookup values in display order', () => {
    const repo = new ArtifactRepository();

    expect(repo.findArtifactTypes().map(type => type.name)).toEqual(['Uncategorized', 'Photo', 'Letter']);
    expect(repo.findEvidenceClassifications().map(classification => classification.name)).toEqual(['Personal Artifact']);
  });

  it('filters by artifact type', () => {
    const repo = new ArtifactRepository();
    const photo = repo.create({ title: 'A Photo', artifact_type_id: 'artifact_type_photo', created_by: 'user-1' });
    repo.create({ title: 'A Letter', artifact_type_id: 'artifact_type_letter', created_by: 'user-1' });

    const photos = repo.findAll({ typeId: 'artifact_type_photo' });

    expect(photos.data.map(row => row.id)).toEqual([photo.id]);
    // total_count reflects the filtered set, not the whole table — the UI shows
    // this number beside the active type.
    expect(photos.total_count).toBe(1);
  });

  it('counts every type, including those with no artifacts', () => {
    const repo = new ArtifactRepository();
    repo.create({ title: 'A Photo', artifact_type_id: 'artifact_type_photo', created_by: 'user-1' });

    const counts = repo.countsByType();

    // Empty types must still appear so the filter UI can show a zero rather
    // than silently dropping them.
    expect(counts.map(row => [row.name, row.count])).toEqual([
      ['Uncategorized', 0],
      ['Photo', 1],
      ['Letter', 0],
    ]);
  });

  it('bulk re-types artifacts and reports how many changed', () => {
    const repo = new ArtifactRepository();
    const a = repo.create({ title: 'Scan One', artifact_type_id: 'artifact_type_uncategorized', created_by: 'user-1' });
    const b = repo.create({ title: 'Scan Two', artifact_type_id: 'artifact_type_uncategorized', created_by: 'user-1' });

    const changed = repo.bulkUpdateType([a.id, b.id], 'artifact_type_letter', 'user-9');

    expect(changed).toBe(2);
    expect(repo.findById(a.id)?.artifact_type_name).toBe('Letter');
    expect(repo.findById(b.id)?.artifact_type_name).toBe('Letter');
    expect(repo.findById(a.id)?.updated_by).toBe('user-9');
  });

  it('skips ids that do not exist rather than failing the whole batch', () => {
    const repo = new ArtifactRepository();
    const real = repo.create({ title: 'Real', artifact_type_id: 'artifact_type_uncategorized', created_by: 'user-1' });

    const changed = repo.bulkUpdateType([real.id, 'does-not-exist'], 'artifact_type_photo', 'user-9');

    expect(changed).toBe(1);
    expect(repo.findById(real.id)?.artifact_type_name).toBe('Photo');
  });

  it('treats an empty id list as a no-op', () => {
    const repo = new ArtifactRepository();
    expect(repo.bulkUpdateType([], 'artifact_type_photo', 'user-9')).toBe(0);
  });

  it('records digitisation date and provenance confidence notes via update', () => {
    const repo = new ArtifactRepository();
    const photo = repo.create({ title: 'Studio Portrait', artifact_type_id: 'artifact_type_photo' });

    const updated = repo.update(photo.id, {
      digitized_at: '2026-06-22',
      provenance_confidence_notes: 'Matched by clothing to the class photo; not fully certain.',
    });

    expect(updated).toMatchObject({
      digitized_at: '2026-06-22',
      provenance_confidence_notes: 'Matched by clothing to the class photo; not fully certain.',
    });
  });

  describe('identification history', () => {
    function seedPerson(database: Database.Database, id: string, title: string) {
      database.prepare(
        `INSERT INTO archive_objects (id, object_type, title) VALUES (?, 'person', ?)`,
      ).run(id, title);
    }

    it('appends an entry and lists it newest first with joined names', () => {
      const repo = new ArtifactRepository();
      const photo = repo.create({ title: 'Class Photo', artifact_type_id: 'artifact_type_photo' });
      seedPerson(db, 'person-subject', 'Walter LeFort');
      seedPerson(db, 'person-identifier', 'Jen LeFort');

      const first = repo.addIdentification(photo.id, {
        note: 'Probably Grade 6, by the classroom decor.',
        confidence_level_id: 'confidence_probable',
      });
      const second = repo.addIdentification(photo.id, {
        note: 'Confirmed as Walter by matching his shirt to the studio portrait.',
        identified_person_id: 'person-subject',
        identifier_person_id: 'person-identifier',
      });

      expect(first.confidence_level_name).toBe('Probable');
      expect(first.identified_person_name).toBeNull();

      // created_at has only second resolution, so two entries made in the
      // same test can tie -- assert both are present rather than depending
      // on which one sorts first when that happens.
      const entries = repo.listIdentifications(photo.id);
      expect(entries.map((e) => e.id).sort()).toEqual([first.id, second.id].sort());
      expect(entries.find((e) => e.id === second.id)).toMatchObject({
        identified_person_name: 'Walter LeFort',
        identifier_person_name: 'Jen LeFort',
        note: 'Confirmed as Walter by matching his shirt to the studio portrait.',
      });
    });

    it('rejects a blank note', () => {
      const repo = new ArtifactRepository();
      const photo = repo.create({ title: 'Class Photo', artifact_type_id: 'artifact_type_photo' });

      expect(() => repo.addIdentification(photo.id, { note: '   ' })).toThrow('note is required');
    });

    it('rejects a reference to a person that does not exist', () => {
      const repo = new ArtifactRepository();
      const photo = repo.create({ title: 'Class Photo', artifact_type_id: 'artifact_type_photo' });

      expect(() => repo.addIdentification(photo.id, { note: 'A guess', identified_person_id: 'nobody' }))
        .toThrow('identified_person_id does not exist');
    });

    it('rejects an unknown confidence level', () => {
      const repo = new ArtifactRepository();
      const photo = repo.create({ title: 'Class Photo', artifact_type_id: 'artifact_type_photo' });

      expect(() => repo.addIdentification(photo.id, { note: 'A guess', confidence_level_id: 'nope' }))
        .toThrow('confidence_level_id does not exist');
    });

    it('rejects an artifact that does not exist', () => {
      const repo = new ArtifactRepository();
      expect(() => repo.addIdentification('does-not-exist', { note: 'A guess' })).toThrow('Artifact not found');
    });

    it('never allows the content of an entry to be edited, enforced by the table itself', () => {
      const repo = new ArtifactRepository();
      const photo = repo.create({ title: 'Class Photo', artifact_type_id: 'artifact_type_photo' });
      const entry = repo.addIdentification(photo.id, { note: 'First guess.' });

      expect(() => db.prepare("UPDATE artifact_identification_history SET note = 'edited' WHERE id = ?").run(entry.id))
        .toThrow('Identification history entries cannot be modified');
      expect(() => db.prepare("UPDATE artifact_identification_history SET created_by = 'someone-else' WHERE id = ?").run(entry.id))
        .toThrow('Identification history entries cannot be modified');
    });

    // The database's own ON DELETE SET NULL (person deleted/merged away) and
    // ON DELETE CASCADE (parent artifact removed) must still go through —
    // see PR #66 review, where a blanket trigger blocked both.
    it('still lets the database null out a person reference, e.g. when that person is deleted', () => {
      const repo = new ArtifactRepository();
      const photo = repo.create({ title: 'Class Photo', artifact_type_id: 'artifact_type_photo' });
      seedPerson(db, 'person-gone', 'Soon Deleted');
      const entry = repo.addIdentification(photo.id, { note: 'A guess.', identified_person_id: 'person-gone' });

      expect(() =>
        db.prepare('UPDATE artifact_identification_history SET identified_person_id = NULL WHERE id = ?').run(entry.id),
      ).not.toThrow();
      expect(repo.listIdentifications(photo.id)[0].identified_person_id).toBeNull();
    });
  });

  describe('findWithTranscription (#73 Phase 3)', () => {
    it('returns only artifacts with a non-empty transcription', () => {
      const repo = new ArtifactRepository();
      const withText = repo.create({ title: 'Letter', artifact_type_id: 'artifact_type_letter', transcription: 'Dear Sir,' });
      repo.create({ title: 'No transcript', artifact_type_id: 'artifact_type_photo' });
      repo.create({ title: 'Blank transcript', artifact_type_id: 'artifact_type_letter', transcription: '   ' });

      const candidates = repo.findWithTranscription([], 10);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].id).toBe(withText.id);
    });

    it('excludes the given ids', () => {
      const repo = new ArtifactRepository();
      const a = repo.create({ title: 'A', artifact_type_id: 'artifact_type_letter', transcription: 'text a' });
      const b = repo.create({ title: 'B', artifact_type_id: 'artifact_type_letter', transcription: 'text b' });

      const candidates = repo.findWithTranscription([a.id], 10);

      expect(candidates.map((c) => c.id)).toEqual([b.id]);
    });

    it('respects the limit', () => {
      const repo = new ArtifactRepository();
      repo.create({ title: 'A', artifact_type_id: 'artifact_type_letter', transcription: 'text a' });
      repo.create({ title: 'B', artifact_type_id: 'artifact_type_letter', transcription: 'text b' });

      expect(repo.findWithTranscription([], 1)).toHaveLength(1);
    });
  });
});
