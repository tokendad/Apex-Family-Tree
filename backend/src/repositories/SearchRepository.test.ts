import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { SearchRepository } = await import('./SearchRepository.js');

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
    CREATE TABLE persons (id TEXT PRIMARY KEY, notes TEXT);
    CREATE TABLE names (id TEXT PRIMARY KEY, person_id TEXT NOT NULL, prefix TEXT, given_name TEXT, surname TEXT, suffix TEXT);
    CREATE TABLE artifacts (id TEXT PRIMARY KEY, notes TEXT, transcription TEXT, creator_text TEXT, physical_location TEXT);
    CREATE TABLE stories (id TEXT PRIMARY KEY, body_markdown TEXT, notes TEXT);
    CREATE TABLE places (id TEXT PRIMARY KEY, address_text TEXT, locality TEXT, region TEXT, country TEXT, notes TEXT);
    CREATE TABLE place_aliases (id TEXT PRIMARY KEY, place_id TEXT NOT NULL, alias TEXT NOT NULL);
    CREATE TABLE collections (id TEXT PRIMARY KEY, description TEXT);
    CREATE TABLE claims (id TEXT PRIMARY KEY, statement TEXT, notes TEXT, status TEXT);
    CREATE TABLE events (id TEXT PRIMARY KEY, event_type TEXT, event_date TEXT, event_place TEXT, description TEXT);
    CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE object_tags (id TEXT PRIMARY KEY, object_id TEXT NOT NULL, tag_id TEXT NOT NULL);
    CREATE VIRTUAL TABLE archive_search USING fts5(
      object_id UNINDEXED,
      object_type UNINDEXED,
      title,
      summary,
      body,
      tags,
      names,
      tokenize = 'porter'
    );
  `);

  database.prepare('INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))')
    .run('person-1', 'person', 'Ada Lovelace', 'Mathematician', 'family', 0);
  database.prepare('INSERT INTO persons (id, notes) VALUES (?, ?)').run('person-1', 'early computing pioneer');
  database.prepare('INSERT INTO names (id, person_id, given_name, surname) VALUES (?, ?, ?, ?)').run('name-1', 'person-1', 'Augusta Ada', 'Byron');

  database.prepare('INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))')
    .run('artifact-1', 'artifact', 'Family Letter', 'Old correspondence', 'family', 0);
  database.prepare('INSERT INTO artifacts (id, notes, transcription, creator_text, physical_location) VALUES (?, ?, ?, ?, ?)')
    .run('artifact-1', 'mentions analytical engine', 'The engine calculation is complete', 'Ada', 'Archive box');

  database.prepare('INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))')
    .run('story-1', 'story', 'Farm Memory', 'Grandma story', 'private', 0);
  database.prepare('INSERT INTO stories (id, body_markdown, notes) VALUES (?, ?, ?)').run('story-1', 'Grandma remembered apple trees', null);

  database.prepare('INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))')
    .run('claim-1', 'claim', 'Ada wrote the letter', null, 'family', 1);
  database.prepare('INSERT INTO claims (id, statement, notes, status) VALUES (?, ?, ?, ?)').run('claim-1', 'Ada wrote the letter', null, 'supported');

  database.prepare('INSERT INTO tags (id, name) VALUES (?, ?)').run('tag-1', 'archivemath');
  database.prepare('INSERT INTO object_tags (id, object_id, tag_id) VALUES (?, ?, ?)').run('ot-1', 'artifact-1', 'tag-1');
}

describe('SearchRepository', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterEach(() => {
    db.close();
  });

  it('searches across people names, artifact transcriptions, and tags', () => {
    const repo = new SearchRepository();
    repo.rebuildIndex();

    expect(repo.search('Byron').data.map(row => row.id)).toEqual(['person-1']);
    expect(repo.search('calculation').data.map(row => row.id)).toEqual(['artifact-1']);
    expect(repo.search('archivemath').data.map(row => row.id)).toEqual(['artifact-1']);
  });

  it('excludes soft-deleted objects and enforces privacy filters', () => {
    const repo = new SearchRepository();
    repo.rebuildIndex();

    expect(repo.search('Ada wrote').data.map(row => row.id)).toEqual([]);
    expect(repo.search('apple', { allowedPrivacyLevels: ['public', 'family'] }).data.map(row => row.id)).toEqual([]);
    expect(repo.search('apple', { allowedPrivacyLevels: ['private'] }).data.map(row => row.id)).toEqual(['story-1']);
  });

  it('reflects updates after rebuild', () => {
    const repo = new SearchRepository();
    repo.rebuildIndex();
    expect(repo.search('fortran').data).toEqual([]);

    db.prepare('UPDATE artifacts SET transcription = ? WHERE id = ?').run('FORTRAN note', 'artifact-1');
    repo.rebuildIndex();

    expect(repo.search('fortran').data.map(row => row.id)).toEqual(['artifact-1']);
  });
});
