import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { RelationshipRepository } = await import('./RelationshipRepository.js');
const { RelationshipService, RelationshipValidationError } = await import('../services/relationship.js');

function seedDB(database: Database.Database) {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY,
      object_type TEXT NOT NULL CHECK (object_type IN ('person', 'artifact', 'event', 'place', 'story', 'collection', 'claim', 'relationship')),
      title TEXT NOT NULL,
      summary TEXT,
      privacy_level TEXT NOT NULL DEFAULT 'family',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      updated_by TEXT
    );
    CREATE TABLE artifact_types (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE artifacts (id TEXT PRIMARY KEY REFERENCES archive_objects(id), artifact_type_id TEXT NOT NULL REFERENCES artifact_types(id));
    CREATE TABLE confidence_levels (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE relationship_types (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      inverse_name TEXT,
      category TEXT,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 1,
      is_directional INTEGER NOT NULL DEFAULT 1,
      is_tree_relevant INTEGER NOT NULL DEFAULT 0,
      default_confidence_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE relationship_type_roles (
      id TEXT PRIMARY KEY,
      relationship_type_id TEXT NOT NULL REFERENCES relationship_types(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      allowed_object_type TEXT NOT NULL,
      min_count INTEGER NOT NULL DEFAULT 0,
      max_count INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_required INTEGER NOT NULL DEFAULT 0,
      UNIQUE (relationship_type_id, role, allowed_object_type)
    );
    CREATE TABLE relationships (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      relationship_type_id TEXT NOT NULL REFERENCES relationship_types(id),
      label TEXT,
      description TEXT,
      date_text TEXT,
      date_start TEXT,
      date_end TEXT,
      date_precision TEXT,
      date_qualifier TEXT,
      confidence_level_id TEXT,
      confidence_score INTEGER,
      notes TEXT
    );
    CREATE TABLE relationship_members (
      id TEXT PRIMARY KEY,
      relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
      object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      UNIQUE (relationship_id, object_id, role)
    );
  `);

  database.prepare('INSERT INTO artifact_types (id, name) VALUES (?, ?)').run('artifact_type_photo', 'Photo');
  database.prepare('INSERT INTO archive_objects (id, object_type, title) VALUES (?, ?, ?)').run('person-1', 'person', 'Ruth Apex');
  database.prepare('INSERT INTO archive_objects (id, object_type, title) VALUES (?, ?, ?)').run('person-2', 'person', 'Aunt Susan');
  database.prepare('INSERT INTO archive_objects (id, object_type, title) VALUES (?, ?, ?)').run('artifact-1', 'artifact', 'Christmas Photo');
  database.prepare('INSERT INTO artifacts (id, artifact_type_id) VALUES (?, ?)').run('artifact-1', 'artifact_type_photo');
  database.prepare('INSERT INTO relationship_types (id, code, name) VALUES (?, ?, ?)').run('rel_type_appears_in', 'appears_in', 'Appears In');
  database.prepare('INSERT INTO relationship_types (id, code, name) VALUES (?, ?, ?)').run('rel_type_identified_by', 'identified_by', 'Identified By');
  database.prepare(`
    INSERT INTO relationship_type_roles (id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('role-subject', 'rel_type_appears_in', 'subject', 'person', 1, null, 10, 1);
  database.prepare(`
    INSERT INTO relationship_type_roles (id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('role-artifact', 'rel_type_appears_in', 'artifact', 'artifact', 1, 1, 20, 1);
  database.prepare(`
    INSERT INTO relationship_type_roles (id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('role-identified-subject-person', 'rel_type_identified_by', 'subject', 'person', 1, null, 10, 1);
  database.prepare(`
    INSERT INTO relationship_type_roles (id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('role-identified-subject-artifact', 'rel_type_identified_by', 'subject', 'artifact', 1, null, 11, 1);
  database.prepare(`
    INSERT INTO relationship_type_roles (id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('role-identified-identifier', 'rel_type_identified_by', 'identifier', 'person', 1, null, 20, 1);
}

describe('RelationshipRepository and RelationshipService', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a validated appears_in relationship as an archive object', () => {
    const service = new RelationshipService();
    const relationship = service.create({
      relationship_type_code: 'appears_in',
      label: 'Ruth appears in Christmas Photo',
      members: [
        { object_id: 'person-1', role: 'subject' },
        { object_id: 'artifact-1', role: 'artifact' },
      ],
    });

    expect(relationship).toMatchObject({
      object_type: 'relationship',
      relationship_type_code: 'appears_in',
      title: 'Ruth appears in Christmas Photo',
    });
    expect(relationship.members.map(member => [member.role, member.object_type])).toEqual([
      ['subject', 'person'],
      ['artifact', 'artifact'],
    ]);
  });

  it('accepts required roles that allow one of several object types', () => {
    const service = new RelationshipService();
    const relationship = service.create({
      relationship_type_code: 'identified_by',
      label: 'Aunt Susan identified Christmas Photo',
      members: [
        { object_id: 'artifact-1', role: 'subject' },
        { object_id: 'person-2', role: 'identifier' },
      ],
    });

    expect(relationship.members.map(member => [member.role, member.object_type])).toEqual([
      ['subject', 'artifact'],
      ['identifier', 'person'],
    ]);
  });

  it('rejects invalid member object types and missing required roles', () => {
    const service = new RelationshipService();

    expect(() => service.create({
      relationship_type_code: 'appears_in',
      members: [
        { object_id: 'artifact-1', role: 'subject' },
        { object_id: 'person-1', role: 'artifact' },
      ],
    })).toThrow(RelationshipValidationError);

    expect(() => service.create({
      relationship_type_code: 'appears_in',
      members: [{ object_id: 'person-1', role: 'subject' }],
    })).toThrow(RelationshipValidationError);

    expect(() => service.create({
      relationship_type_code: 'identified_by',
      members: [{ object_id: 'person-2', role: 'identifier' }],
    })).toThrow(RelationshipValidationError);
  });

  it('returns connected objects for an archive object', () => {
    const service = new RelationshipService();
    service.create({
      relationship_type_code: 'appears_in',
      members: [
        { object_id: 'person-1', role: 'subject' },
        { object_id: 'artifact-1', role: 'artifact' },
      ],
    });

    const repo = new RelationshipRepository();
    expect(repo.findConnectedObjects('artifact-1', 'appears_in')).toMatchObject([
      {
        object_id: 'person-1',
        object_type: 'person',
        title: 'Ruth Apex',
        role: 'subject',
      },
    ]);
    expect(repo.findConnectedObjects('person-1', 'appears_in')).toMatchObject([
      {
        object_id: 'artifact-1',
        object_type: 'artifact',
        title: 'Christmas Photo',
        artifact_type_name: 'Photo',
      },
    ]);
  });
});
