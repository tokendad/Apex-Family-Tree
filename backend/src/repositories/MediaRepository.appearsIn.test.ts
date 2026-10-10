import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../db/connection.js');
const { runMigrations } = await import('../db/migrator.js');
const { MediaRepository } = await import('./MediaRepository.js');
const { RelationshipRepository } = await import('./RelationshipRepository.js');
const { PersonRepository } = await import('./PersonRepository.js');

// Resolved from this file rather than the working directory, so the suite runs
// the same whether vitest is started from the repo root or from backend/.
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let mediaCounter = 0;

function makeMedia(repo: InstanceType<typeof MediaRepository>) {
  mediaCounter += 1;
  return repo.create({
    filename: `photo-${mediaCounter}.jpg`,
    original_filename: `photo-${mediaCounter}.jpg`,
    mime_type: 'image/jpeg',
    file_size: 1024,
    // file_path is UNIQUE, so each fixture needs its own.
    file_path: `/media/photo-${mediaCounter}.jpg`,
    title: `School photograph ${mediaCounter}`,
  });
}

describe('person_media links mirror into the archive model', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    registerCustomFunctions(db);
    runMigrations(db, migrationsDir, logger);
  });

  afterEach(() => db.close());

  it('shows a newly tagged photo on the person page as a connected artifact', () => {
    const media = new MediaRepository();
    const people = new PersonRepository();
    const relationships = new RelationshipRepository();

    const walter = people.create({ display_name: 'Walter Earl LeFort', sex: 'M' });
    const photo = makeMedia(media);

    // Before: the summary card's source of truth knows nothing about it.
    expect(relationships.findConnectedObjects(walter.id)).toEqual([]);

    media.linkToPerson(photo.id, walter.id);

    const connected = relationships.findConnectedObjects(walter.id);
    expect(connected).toHaveLength(1);
    expect(connected[0].object_id).toBe(photo.id);
    expect(connected[0].object_type).toBe('artifact');
    expect(connected[0].relationship_type_code).toBe('appears_in');
  });

  it('puts everyone in a class photograph into one relationship', () => {
    const media = new MediaRepository();
    const people = new PersonRepository();
    const relationships = new RelationshipRepository();

    const photo = makeMedia(media);
    const classmates = ['Matthew', 'Rachel', 'Walter'].map((name) =>
      people.create({ display_name: name, sex: 'U' }),
    );
    for (const person of classmates) media.linkToPerson(photo.id, person.id);

    // The appears_in contract allows one artifact and many subjects, so three
    // children in one photograph is one relationship, not three.
    const relationshipIds = new Set(
      classmates.flatMap((p) =>
        relationships.findConnectedObjects(p.id).map((o) => o.relationship_id),
      ),
    );
    expect(relationshipIds.size).toBe(1);

    const members = db
      .prepare("SELECT role, COUNT(*) AS n FROM relationship_members GROUP BY role ORDER BY role")
      .all();
    expect(members).toEqual([
      { role: 'artifact', n: 1 },
      { role: 'subject', n: 3 },
    ]);
  });

  it('removes only the unlinked person, keeping the rest of the photograph', () => {
    const media = new MediaRepository();
    const people = new PersonRepository();
    const relationships = new RelationshipRepository();

    const photo = makeMedia(media);
    const matthew = people.create({ display_name: 'Matthew', sex: 'M' });
    const rachel = people.create({ display_name: 'Rachel', sex: 'F' });
    media.linkToPerson(photo.id, matthew.id);
    media.linkToPerson(photo.id, rachel.id);

    media.unlinkFromPerson(photo.id, matthew.id);

    expect(relationships.findConnectedObjects(matthew.id)).toEqual([]);
    expect(relationships.findConnectedObjects(rachel.id)).toHaveLength(1);
  });

  it('clears the relationship away once the last subject is unlinked', () => {
    const media = new MediaRepository();
    const people = new PersonRepository();

    const photo = makeMedia(media);
    const walter = people.create({ display_name: 'Walter', sex: 'M' });
    media.linkToPerson(photo.id, walter.id);
    media.unlinkFromPerson(photo.id, walter.id);

    // An appears_in holding an artifact and nobody is the half-emptied state
    // migration 063 had to clean up elsewhere.
    const relationshipId = `rel_appears_in_media_${photo.id}`;
    expect(db.prepare('SELECT 1 FROM relationships WHERE id = ?').get(relationshipId)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM archive_objects WHERE id = ?').get(relationshipId)).toBeUndefined();
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM relationship_members WHERE relationship_id = ?').get(relationshipId),
    ).toEqual({ n: 0 });
    // The photograph itself survives being untagged.
    expect(db.prepare('SELECT 1 FROM media_items WHERE id = ?').get(photo.id)).toBeTruthy();
  });

  it('leaves nothing dangling when the person is deleted', () => {
    const media = new MediaRepository();
    const people = new PersonRepository();

    const photo = makeMedia(media);
    const walter = people.create({ display_name: 'Walter', sex: 'M' });
    media.linkToPerson(photo.id, walter.id);

    db.prepare('DELETE FROM persons WHERE id = ?').run(walter.id);

    // The 063 trigger covers paths the repository never sees.
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM relationship_members WHERE object_id = ?').get(walter.id),
    ).toEqual({ n: 0 });
    expect(db.prepare('SELECT 1 FROM archive_objects WHERE id = ?').get(walter.id)).toBeUndefined();
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
