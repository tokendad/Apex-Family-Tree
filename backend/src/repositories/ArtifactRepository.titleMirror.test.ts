import Database from 'better-sqlite3';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../db/connection.js');
const { runMigrations } = await import('../db/migrator.js');
const { MediaRepository } = await import('./MediaRepository.js');
const { ArtifactRepository } = await import('./ArtifactRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

beforeEach(() => {
  seq = 0;
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
});

afterEach(() => db.close());

/**
 * A freshly scanned file: on disk, catalogued, and carrying no title of its
 * own. scanDirectory inserts exactly this, and it is the state #42 needs.
 */
let seq = 0;
const scan = (over: Record<string, unknown> = {}) => {
  seq += 1;
  return new MediaRepository().create({
    filename: `scan000${seq}.jpg`,
    original_filename: `scan000${seq}.jpg`,
    mime_type: 'image/jpeg',
    file_size: 2048,
    file_path: `/media/scan000${seq}.jpg`,
    is_external: 1,
    ...over,
  });
};

const catalogueTitle = (id: string) =>
  (db.prepare('SELECT title, summary FROM archive_objects WHERE id = ?').get(id) as
    | { title: string; summary: string | null }
    | undefined);

describe('ArtifactRepository — a curated title survives a media edit (#42)', () => {
  it('keeps the renamed title when an unrelated media field is written', () => {
    const media = scan();
    // The scan is catalogued under its filename, with no title of its own.
    expect(catalogueTitle(media.id)?.title).toBe('scan0001.jpg');
    expect(new MediaRepository().findById(media.id)?.title).toBeNull();

    new ArtifactRepository().update(media.id, { title: "Grandpa's funeral, 1962" });

    // The media dialog writes one field at a time and never mentions the title.
    new MediaRepository().update(media.id, { date_taken: '1962-04-11' });

    expect(catalogueTitle(media.id)?.title).toBe("Grandpa's funeral, 1962");
  });

  it('mirrors the title onto the media row, so both pages read the same name', () => {
    const media = scan();
    new ArtifactRepository().update(media.id, { title: "Grandpa's funeral, 1962" });

    // The assertion that distinguishes mirroring from merely COALESCE-ing the
    // sync: the Media gallery reads this column, and showed "No title" before.
    expect(new MediaRepository().findById(media.id)?.title).toBe("Grandpa's funeral, 1962");
  });

  it('mirrors the summary onto the media description', () => {
    const media = scan();
    new ArtifactRepository().update(media.id, { summary: 'Sacred Heart, Worcester' });

    expect(new MediaRepository().findById(media.id)?.description).toBe('Sacred Heart, Worcester');
    // And it survives the same clobber the title does.
    new MediaRepository().update(media.id, { date_taken: '1962-04-11' });
    expect(catalogueTitle(media.id)?.summary).toBe('Sacred Heart, Worcester');
  });

  it('trims the mirrored title, so the two copies are identical', () => {
    const media = scan();
    new ArtifactRepository().update(media.id, { title: '  Spaced out  ' });

    expect(new MediaRepository().findById(media.id)?.title).toBe('Spaced out');
    expect(catalogueTitle(media.id)?.title).toBe('Spaced out');
  });

  it('leaves the media row alone when the update does not mention either field', () => {
    const media = scan({ title: 'As catalogued' });
    new ArtifactRepository().update(media.id, { artifact_type_id: 'artifact_type_document' });

    expect(new MediaRepository().findById(media.id)?.title).toBe('As catalogued');
  });

  it('retitles an artifact that has no media row at all', () => {
    // Created through the artifact API alone, so nothing bridges it to media.
    const artifact = new ArtifactRepository().create({
      title: 'Deed of sale',
      artifact_type_id: 'artifact_type_document',
    });

    expect(() =>
      new ArtifactRepository().update(artifact.id, { title: 'Deed of sale, 1884' }),
    ).not.toThrow();
    expect(catalogueTitle(artifact.id)?.title).toBe('Deed of sale, 1884');
    expect(db.prepare('SELECT COUNT(*) c FROM media_items').get()).toEqual({ c: 0 });
  });
});
