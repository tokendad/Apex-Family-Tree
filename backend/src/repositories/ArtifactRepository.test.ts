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
      notes TEXT
    );
  `);

  database.prepare('INSERT INTO artifact_types (id, name, is_system, sort_order) VALUES (?, ?, 1, ?)').run('artifact_type_photo', 'Photo', 10);
  database.prepare('INSERT INTO artifact_types (id, name, is_system, sort_order) VALUES (?, ?, 1, ?)').run('artifact_type_letter', 'Letter', 20);
  database.prepare('INSERT INTO evidence_classifications (id, name, default_weight, is_system, sort_order) VALUES (?, ?, ?, 1, ?)')
    .run('evidence_personal_artifact', 'Personal Artifact', 45, 10);
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

    expect(repo.findArtifactTypes().map(type => type.name)).toEqual(['Photo', 'Letter']);
    expect(repo.findEvidenceClassifications().map(classification => classification.name)).toEqual(['Personal Artifact']);
  });
});
