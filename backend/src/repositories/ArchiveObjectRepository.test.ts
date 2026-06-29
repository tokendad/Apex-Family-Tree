import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { ArchiveObjectRepository } = await import('./ArchiveObjectRepository.js');

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
  `);
}

describe('ArchiveObjectRepository', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    seedDB(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and reads an archive object with shared metadata defaults', () => {
    const repo = new ArchiveObjectRepository();

    const created = repo.create({
      id: 'artifact-1',
      object_type: 'artifact',
      title: '  Christmas Morning 1989  ',
      summary: 'Family photo',
      created_by: 'user-1',
    });

    expect(created).toMatchObject({
      id: 'artifact-1',
      object_type: 'artifact',
      title: 'Christmas Morning 1989',
      summary: 'Family photo',
      privacy_level: 'family',
      is_deleted: 0,
      created_by: 'user-1',
      updated_by: 'user-1',
    });
    expect(repo.findById('artifact-1')?.title).toBe('Christmas Morning 1989');
  });

  it('lists archive objects by type with keyset pagination and excludes deleted rows by default', () => {
    const repo = new ArchiveObjectRepository();

    repo.create({ id: 'artifact-1', object_type: 'artifact', title: 'Artifact 1' });
    repo.create({ id: 'artifact-2', object_type: 'artifact', title: 'Artifact 2' });
    repo.create({ id: 'artifact-3', object_type: 'artifact', title: 'Artifact 3' });
    repo.create({ id: 'person-1', object_type: 'person', title: 'Person 1' });
    repo.softDelete('artifact-2');

    const firstPage = repo.findByType('artifact', { limit: 1 });
    expect(firstPage.data.map(object => object.id)).toEqual(['artifact-1']);
    expect(firstPage.next_cursor).toBe('artifact-1');

    const secondPage = repo.findByType('artifact', { limit: 5, cursor: firstPage.next_cursor ?? undefined });
    expect(secondPage.data.map(object => object.id)).toEqual(['artifact-3']);
    expect(secondPage.next_cursor).toBeNull();

    const withDeleted = repo.findByType('artifact', { includeDeleted: true });
    expect(withDeleted.data.map(object => object.id)).toEqual(['artifact-1', 'artifact-2', 'artifact-3']);
  });

  it('updates shared metadata for active archive objects only', () => {
    const repo = new ArchiveObjectRepository();

    repo.create({ id: 'story-1', object_type: 'story', title: 'Original Story' });
    const updated = repo.update('story-1', {
      title: '  Updated Story  ',
      summary: null,
      privacy_level: 'private',
      updated_by: 'user-2',
    });

    expect(updated).toMatchObject({
      title: 'Updated Story',
      summary: null,
      privacy_level: 'private',
      updated_by: 'user-2',
    });

    expect(repo.softDelete('story-1', 'user-3')).toBe(true);
    expect(repo.update('story-1', { title: 'Should Not Change' })).toBeUndefined();
    expect(repo.findById('story-1', { includeDeleted: true })).toMatchObject({
      title: 'Updated Story',
      is_deleted: 1,
      updated_by: 'user-3',
    });
  });

  it('soft deletes only once and hides deleted objects from normal reads', () => {
    const repo = new ArchiveObjectRepository();

    repo.create({ id: 'claim-1', object_type: 'claim', title: 'Apex claim' });

    expect(repo.softDelete('claim-1')).toBe(true);
    expect(repo.softDelete('claim-1')).toBe(false);
    expect(repo.findById('claim-1')).toBeUndefined();
    expect(repo.findById('claim-1', { includeDeleted: true })?.is_deleted).toBe(1);
  });
});
