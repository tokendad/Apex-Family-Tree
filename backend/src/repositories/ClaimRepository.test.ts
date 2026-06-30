import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { ClaimRepository } = await import('./ClaimRepository.js');

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
    CREATE TABLE confidence_levels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      numeric_value INTEGER,
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
    CREATE TABLE artifacts (id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE);
    CREATE TABLE claims (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      statement TEXT NOT NULL,
      claim_type TEXT,
      subject_object_id TEXT REFERENCES archive_objects(id),
      date_text TEXT,
      date_start TEXT,
      date_end TEXT,
      confidence_level_id TEXT REFERENCES confidence_levels(id),
      confidence_score INTEGER CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'supported', 'conflicted', 'rejected', 'unknown')),
      notes TEXT
    );
    CREATE TABLE claim_subjects (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      subject_object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'subject',
      UNIQUE (claim_id, subject_object_id, role)
    );
    CREATE TABLE claim_evidence (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      evidence_object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
      evidence_role TEXT NOT NULL DEFAULT 'supports' CHECK (evidence_role IN ('supports', 'contradicts', 'mentions', 'uncertain')),
      evidence_classification_id TEXT REFERENCES evidence_classifications(id),
      excerpt TEXT,
      locator TEXT,
      weight_score INTEGER CHECK (weight_score IS NULL OR weight_score BETWEEN 0 AND 100),
      confidence_contribution INTEGER CHECK (confidence_contribution IS NULL OR confidence_contribution BETWEEN 0 AND 100),
      notes TEXT,
      UNIQUE (claim_id, evidence_object_id, evidence_role)
    );
  `);

  database.prepare('INSERT INTO confidence_levels (id, name, numeric_value, is_system, sort_order) VALUES (?, ?, ?, 1, ?)').run('confidence_unknown', 'Unknown', null, 10);
  database.prepare('INSERT INTO confidence_levels (id, name, numeric_value, is_system, sort_order) VALUES (?, ?, ?, 1, ?)').run('confidence_confirmed', 'Confirmed', 95, 20);
  database.prepare('INSERT INTO evidence_classifications (id, name, default_weight, is_system, sort_order) VALUES (?, ?, ?, 1, ?)').run('evidence_official_record', 'Official Record', 90, 10);
  database.prepare('INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, 0, datetime(\'now\'), datetime(\'now\'))')
    .run('person-1', 'person', 'Grandpa', 'family');
  database.prepare('INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, 0, datetime(\'now\'), datetime(\'now\'))')
    .run('artifact-1', 'artifact', 'Discharge Record', 'family');
  database.prepare('INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, 0, datetime(\'now\'), datetime(\'now\'))')
    .run('place-1', 'place', 'Paris', 'family');
  database.prepare('INSERT INTO artifacts (id) VALUES (?)').run('artifact-1');
}

describe('ClaimRepository', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a claim with an archive object and subject', () => {
    const repo = new ClaimRepository();

    const claim = repo.create({
      statement: 'Grandpa served in World War II.',
      subject_object_id: 'person-1',
      confidence_level_id: 'confidence_confirmed',
      status: 'supported',
      created_by: 'user-1',
    });

    expect(claim).toMatchObject({
      object_type: 'claim',
      title: 'Grandpa served in World War II.',
      statement: 'Grandpa served in World War II.',
      subject_title: 'Grandpa',
      confidence_level_name: 'Confirmed',
      status: 'supported',
      evidence_count: 0,
    });
    expect(repo.findSubjects(claim.id).map(subject => subject.title)).toEqual(['Grandpa']);
  });

  it('adds supporting and contradicting artifact evidence and rejects duplicates', () => {
    const repo = new ClaimRepository();
    const claim = repo.create({ statement: 'Grandpa served in World War II.', subject_object_id: 'person-1' });

    const evidence = repo.addEvidence(claim.id, {
      evidence_object_id: 'artifact-1',
      evidence_role: 'supports',
      evidence_classification_id: 'evidence_official_record',
      weight_score: 90,
    });

    expect(evidence).toMatchObject({
      evidence_role: 'supports',
      title: 'Discharge Record',
      evidence_classification_name: 'Official Record',
      weight_score: 90,
    });
    expect(() => repo.addEvidence(claim.id, { evidence_object_id: 'artifact-1', evidence_role: 'supports' })).toThrow();
    expect(repo.addEvidence(claim.id, { evidence_object_id: 'artifact-1', evidence_role: 'contradicts' }).evidence_role).toBe('contradicts');
  });

  it('rejects non-artifact evidence in this phase', () => {
    const repo = new ClaimRepository();
    const claim = repo.create({ statement: 'Grandpa lived in Paris.', subject_object_id: 'person-1' });

    expect(() => repo.addEvidence(claim.id, { evidence_object_id: 'place-1' })).toThrow('Claim evidence must be an artifact');
  });

  it('finds claims supported by an artifact and soft deletes claims', () => {
    const repo = new ClaimRepository();
    const claim = repo.create({ statement: 'Grandpa served in World War II.', subject_object_id: 'person-1' });
    repo.addEvidence(claim.id, { evidence_object_id: 'artifact-1', evidence_role: 'supports' });

    expect(repo.findClaimsForEvidence('artifact-1').map(row => row.statement)).toEqual(['Grandpa served in World War II.']);
    expect(repo.delete(claim.id, 'user-2')).toBe(true);
    expect(repo.findById(claim.id)).toBeUndefined();
  });
});
