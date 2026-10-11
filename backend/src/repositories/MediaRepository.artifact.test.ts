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

// media_items.file_path is unique, so each fixture needs its own.
let seq = 0;
const add = (over: Partial<Parameters<InstanceType<typeof MediaRepository>['create']>[0]> = {}) => {
  seq += 1;
  return new MediaRepository().create({
    filename: `census-${seq}.jpg`,
    original_filename: `census-${seq}.jpg`,
    mime_type: 'image/jpeg',
    file_size: 1024,
    file_path: `/media/census-${seq}.jpg`,
    title: '1900 Census',
    is_external: 1,
    ...over,
  });
};

const artifactOf = (id: string) =>
  db.prepare(
    `SELECT ao.title, ao.summary, ao.object_type, a.artifact_type_id, a.original_format
       FROM archive_objects ao JOIN artifacts a ON a.id = ao.id WHERE ao.id = ?`,
  ).get(id) as Record<string, unknown> | undefined;

describe('MediaRepository — media and artifacts stay in step (#13)', () => {
  it('catalogues a new media item as an artifact', () => {
    const media = add();
    expect(artifactOf(media.id)).toMatchObject({
      title: '1900 Census',
      object_type: 'artifact',
      artifact_type_id: 'artifact_type_photo',
    });
  });

  it('reuses the media id, so /api/v1/media/:id still serves the artifact', () => {
    const media = add({ file_path: '/media/one-off.jpg' });
    const file = db.prepare(
      'SELECT storage_path, file_role FROM artifact_files WHERE artifact_id = ?',
    ).get(media.id);
    expect(file).toMatchObject({ storage_path: '/media/one-off.jpg', file_role: 'primary' });
  });

  it('types by MIME, the same mapping the 045 bridge used', () => {
    expect(artifactOf(add({ mime_type: 'video/mp4' }).id)).toMatchObject({
      artifact_type_id: 'artifact_type_video',
    });
    expect(artifactOf(add({ mime_type: 'audio/mpeg' }).id)).toMatchObject({
      artifact_type_id: 'artifact_type_audio_recording',
    });
    // A scanned certificate arrives as a PDF and lands under Document; the
    // Artifacts page's bulk re-type is how it becomes a Certificate.
    expect(artifactOf(add({ mime_type: 'application/pdf' }).id)).toMatchObject({
      artifact_type_id: 'artifact_type_document',
    });
  });

  it('falls back to a filename when the media has no title', () => {
    const media = add({ title: undefined, original_filename: 'scan0001.jpg' });
    expect(artifactOf(media.id)).toMatchObject({ title: 'scan0001.jpg' });
  });

  it('follows a retitled media item', () => {
    const media = add();
    new MediaRepository().update(media.id, { title: 'Cyr household, 1900', description: 'Sheet 16-A' });
    expect(artifactOf(media.id)).toMatchObject({
      title: 'Cyr household, 1900',
      summary: 'Sheet 16-A',
    });
  });

  it('does not duplicate the artifact when the media is updated repeatedly', () => {
    const media = add();
    const repo = new MediaRepository();
    repo.update(media.id, { title: 'one' });
    repo.update(media.id, { title: 'two' });
    expect(db.prepare('SELECT COUNT(*) c FROM artifacts').get()).toEqual({ c: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM artifact_files').get()).toEqual({ c: 1 });
  });

  it('removes the artifact when the media is deleted, leaving nothing orphaned', () => {
    const media = add();
    new MediaRepository().delete(media.id);
    expect(artifactOf(media.id)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) c FROM artifact_files').get()).toEqual({ c: 0 });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('records a thumbnail as its own file role when one exists', () => {
    const media = add({ thumbnail_path: '/media/thumbs/census.jpg' });
    const roles = db.prepare(
      'SELECT file_role FROM artifact_files WHERE artifact_id = ? ORDER BY file_role',
    ).all(media.id);
    expect(roles).toEqual([{ file_role: 'primary' }, { file_role: 'thumbnail' }]);
  });
});
