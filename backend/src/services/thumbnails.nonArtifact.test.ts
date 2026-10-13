import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
let dataDir: string;

vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../db/connection.js');
const { runMigrations } = await import('../db/migrator.js');
const { MediaRepository } = await import('../repositories/MediaRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** A photograph the scanner found: a media row and nothing else. */
const scannedPhoto = (id: string) => {
  db.prepare(
    `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, is_external)
     VALUES (?, ?, ?, 'image/jpeg', 100, ?, 1)`,
  ).run(id, `${id}.jpg`, `${id}.jpg`, `/media/photos/${id}.jpg`);
  return id;
};

const thumbnailPathOf = (id: string) =>
  (db.prepare('SELECT thumbnail_path AS p FROM media_items WHERE id = ?').get(id) as { p: string | null }).p;

/* artifact_files.artifact_id is NOT NULL REFERENCES artifacts(id). Recording a
   thumbnail for a media item that is not an artifact violated that, rolled the
   whole transaction back -- including the thumbnail_path it had just set --
   and reported the thumbnail as failed, after the file had been written. The
   same 49 orphaned .webp files were regenerated on every boot. */
describe('recording a thumbnail', () => {
  it('works for a photograph that is not an artifact', () => {
    const id = scannedPhoto('media-plain');
    const thumb = path.join(dataDir, 'media-plain.webp');
    fs.writeFileSync(thumb, 'x');

    new MediaRepository().setThumbnail(id, thumb, 'image/webp');

    expect(thumbnailPathOf(id)).toBe(thumb);
  });

  it('does not invent an artifact_files row for one', () => {
    const id = scannedPhoto('media-plain');
    const thumb = path.join(dataDir, 'media-plain.webp');
    fs.writeFileSync(thumb, 'x');

    new MediaRepository().setThumbnail(id, thumb, 'image/webp');

    const rows = db.prepare('SELECT COUNT(*) AS n FROM artifact_files WHERE artifact_id = ?')
      .get(id) as { n: number };
    expect(rows.n).toBe(0);
  });

  /* The artifact case is what the row is for, and still works. */
  it('still records the file for a media item that is an artifact', () => {
    const id = scannedPhoto('media-artifact');
    db.prepare(
      `INSERT INTO archive_objects (id, object_type, title, privacy_level)
       VALUES (?, 'artifact', 'A scanned certificate', 'family')`,
    ).run(id);
    const type = (db.prepare('SELECT id FROM artifact_types LIMIT 1').get() as { id: string }).id;
    db.prepare('INSERT INTO artifacts (id, artifact_type_id) VALUES (?, ?)').run(id, type);
    const thumb = path.join(dataDir, 'media-artifact.webp');
    fs.writeFileSync(thumb, 'xx');

    new MediaRepository().setThumbnail(id, thumb, 'image/webp');

    expect(thumbnailPathOf(id)).toBe(thumb);
    const row = db.prepare(
      "SELECT storage_path, mime_type, size_bytes FROM artifact_files WHERE artifact_id = ? AND file_role = 'thumbnail'",
    ).get(id) as { storage_path: string; mime_type: string; size_bytes: number };
    expect(row).toMatchObject({ storage_path: thumb, mime_type: 'image/webp', size_bytes: 2 });
  });

  it('can be set twice without complaining', () => {
    const id = scannedPhoto('media-plain');
    const thumb = path.join(dataDir, 'media-plain.webp');
    fs.writeFileSync(thumb, 'x');
    const media = new MediaRepository();

    media.setThumbnail(id, thumb, 'image/webp');
    media.setThumbnail(id, thumb, 'image/webp');

    expect(thumbnailPathOf(id)).toBe(thumb);
  });
});
