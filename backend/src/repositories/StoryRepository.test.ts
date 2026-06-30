import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { StoryRepository } = await import('./StoryRepository.js');
const { RelationshipService } = await import('../services/relationship.js');

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
    CREATE TABLE persons (id TEXT PRIMARY KEY);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE stories (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      story_type TEXT NOT NULL DEFAULT 'story' CHECK (story_type IN ('story', 'memory', 'oral_history', 'note')),
      body_markdown TEXT NOT NULL,
      narrator_person_id TEXT REFERENCES persons(id),
      recorded_by_user_id TEXT REFERENCES users(id),
      date_text TEXT,
      date_start TEXT,
      date_end TEXT,
      notes TEXT
    );
    CREATE TABLE artifact_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      artifact_type_id TEXT REFERENCES artifact_types(id)
    );
    CREATE TABLE relationship_types (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      inverse_name TEXT,
      category TEXT,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
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
      is_required INTEGER NOT NULL DEFAULT 0
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

  database.prepare('INSERT INTO persons (id) VALUES (?)').run('person-1');
  database.prepare('INSERT INTO users (id) VALUES (?)').run('user-1');
  database.prepare('INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, 0, datetime(\'now\'), datetime(\'now\'))')
    .run('person-1', 'person', 'Grandma', 'family');
  database.prepare('INSERT INTO relationship_types (id, code, name, is_system) VALUES (?, ?, ?, 1)').run('rel_type_describes', 'describes', 'Describes');
  database.prepare('INSERT INTO relationship_type_roles (id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('rel_role_describes_story', 'rel_type_describes', 'story', 'story', 1, 1, 10, 1);
  database.prepare('INSERT INTO relationship_type_roles (id, relationship_type_id, role, allowed_object_type, min_count, max_count, sort_order, is_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('rel_role_describes_subject_person', 'rel_type_describes', 'subject', 'person', 0, null, 20, 0);
}

describe('StoryRepository', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a story and matching archive object', () => {
    const repo = new StoryRepository();

    const story = repo.create({
      title: 'Grandma remembers the farm',
      summary: 'A family memory',
      body_markdown: '# Farm story\n\nGrandma remembered **apple trees**.',
      narrator_person_id: 'person-1',
      recorded_by_user_id: 'user-1',
      created_by: 'user-1',
    });

    expect(story).toMatchObject({
      object_type: 'story',
      title: 'Grandma remembers the farm',
      narrator_person_id: 'person-1',
      narrator_title: 'Grandma',
      body_markdown: '# Farm story\n\nGrandma remembered **apple trees**.',
    });
  });

  it('updates, searches, and soft deletes stories', () => {
    const repo = new StoryRepository();
    const story = repo.create({ title: 'Farm Memory', body_markdown: 'Apple trees and barns.' });

    expect(repo.findAll({ search: 'apple' }).data.map(row => row.title)).toEqual(['Farm Memory']);
    expect(repo.update(story.id, { title: 'Updated Farm Memory', body_markdown: 'Updated body', privacy_level: 'private' })).toMatchObject({
      title: 'Updated Farm Memory',
      privacy_level: 'private',
      body_markdown: 'Updated body',
    });
    expect(repo.delete(story.id, 'user-1')).toBe(true);
    expect(repo.findById(story.id)).toBeUndefined();
  });

  it('returns connected objects through the relationship engine', () => {
    const repo = new StoryRepository();
    const story = repo.create({ title: 'Grandma Story', body_markdown: 'A memory.' });

    new RelationshipService().create({
      relationship_type_code: 'describes',
      members: [
        { object_id: story.id, role: 'story' },
        { object_id: 'person-1', role: 'subject' },
      ],
    });

    expect(repo.findDetail(story.id)?.connected_objects.map(object => [object.object_type, object.title])).toEqual([
      ['person', 'Grandma'],
    ]);
  });
});
