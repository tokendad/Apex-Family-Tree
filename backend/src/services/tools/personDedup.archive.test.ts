import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../../db/connection.js');
const { runMigrations } = await import('../../db/migrator.js');
const { applyPeopleMerge } = await import('./personDedup.js');
const { MediaRepository } = await import('../../repositories/MediaRepository.js');
const { PersonRepository } = await import('../../repositories/PersonRepository.js');
const { RelationshipRepository } = await import('../../repositories/RelationshipRepository.js');

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const groupIdFor = (ids: string[]) => [...ids].sort().join('__');

let counter = 0;
function makePhoto(repo: InstanceType<typeof MediaRepository>) {
  counter += 1;
  return repo.create({
    filename: `p-${counter}.jpg`,
    original_filename: `p-${counter}.jpg`,
    mime_type: 'image/jpeg',
    file_size: 10,
    file_path: `/media/p-${counter}.jpg`,
    title: `Photo ${counter}`,
  });
}

/**
 * Merging used to delete the duplicate's persons row and nothing else, leaving
 * its archive object and every membership that pointed at it behind. One such
 * ghost was found in this tree -- "Alta Lefort", still a child of a union long
 * after the person had gone.
 */
describe('merging a duplicate carries its archive identity across', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    registerCustomFunctions(db);
    runMigrations(db, migrationsDir, logger);
  });

  afterEach(() => db.close());

  it('moves the duplicate\'s photo connections onto the surviving person', () => {
    const media = new MediaRepository();
    const people = new PersonRepository();
    const relationships = new RelationshipRepository();

    const canonical = people.create({ display_name: 'Walter Earl LeFort', sex: 'M' });
    const duplicate = people.create({ display_name: 'Walter E LeFort', sex: 'M' });
    const photo = makePhoto(media);
    media.linkToPerson(photo.id, duplicate.id);

    expect(relationships.findConnectedObjects(canonical.id)).toEqual([]);

    applyPeopleMerge({
      groupId: groupIdFor([canonical.id, duplicate.id]),
      canonicalPersonId: canonical.id,
      duplicatePersonIds: [duplicate.id],
    });

    const connected = relationships.findConnectedObjects(canonical.id);
    expect(connected).toHaveLength(1);
    expect(connected[0].object_id).toBe(photo.id);
  });

  it('leaves no trace of the duplicate behind', () => {
    const media = new MediaRepository();
    const people = new PersonRepository();

    const canonical = people.create({ display_name: 'Walter Earl LeFort', sex: 'M' });
    const duplicate = people.create({ display_name: 'Walter E LeFort', sex: 'M' });
    media.linkToPerson(makePhoto(media).id, duplicate.id);

    applyPeopleMerge({
      groupId: groupIdFor([canonical.id, duplicate.id]),
      canonicalPersonId: canonical.id,
      duplicatePersonIds: [duplicate.id],
    });

    expect(db.prepare('SELECT 1 FROM archive_objects WHERE id = ?').get(duplicate.id)).toBeUndefined();
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM relationship_members WHERE object_id = ?').get(duplicate.id),
    ).toEqual({ n: 0 });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('does not collide when both people are in the same photograph', () => {
    const media = new MediaRepository();
    const people = new PersonRepository();
    const relationships = new RelationshipRepository();

    const canonical = people.create({ display_name: 'Rachel LeFort', sex: 'F' });
    const duplicate = people.create({ display_name: 'Rachel A LeFort', sex: 'F' });
    const photo = makePhoto(media);
    // relationship_members is UNIQUE on (relationship_id, object_id, role), so
    // a straight UPDATE of the duplicate's row onto the canonical would fail.
    media.linkToPerson(photo.id, canonical.id);
    media.linkToPerson(photo.id, duplicate.id);

    expect(() =>
      applyPeopleMerge({
        groupId: groupIdFor([canonical.id, duplicate.id]),
        canonicalPersonId: canonical.id,
        duplicatePersonIds: [duplicate.id],
      }),
    ).not.toThrow();

    expect(relationships.findConnectedObjects(canonical.id)).toHaveLength(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
