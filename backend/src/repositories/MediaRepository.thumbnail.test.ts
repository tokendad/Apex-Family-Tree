import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { MediaRepository } = await import('./MediaRepository.js');

const tempDirs: string[] = [];

function tempFile(name: string, contents = 'bytes'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-media-thumb-'));
  tempDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function seed(id: string, overrides: Record<string, unknown> = {}) {
  db.prepare(
    `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path,
                              thumbnail_path, is_external, created_at, updated_at)
     VALUES (@id, @filename, @original_filename, @mime_type, @file_size, @file_path,
             @thumbnail_path, @is_external, @created_at, @updated_at)`,
  ).run({
    id,
    filename: `${id}.jpg`,
    original_filename: `${id}-original.jpg`,
    mime_type: 'image/jpeg',
    file_size: 10,
    file_path: `/media/${id}.jpg`,
    thumbnail_path: null,
    is_external: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL, file_size INTEGER NOT NULL, file_path TEXT NOT NULL,
      thumbnail_path TEXT, title TEXT, description TEXT, date_taken TEXT, uploaded_by TEXT,
      is_external INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY, object_type TEXT, title TEXT, summary TEXT, privacy_level TEXT,
      is_deleted INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE artifact_files (
      id TEXT PRIMARY KEY, artifact_id TEXT, file_role TEXT,
      storage_provider TEXT DEFAULT 'local', storage_path TEXT, original_filename TEXT,
      mime_type TEXT, size_bytes INTEGER, checksum_sha256 TEXT, width INTEGER, height INTEGER,
      duration_seconds REAL, created_at TEXT
    );
  `);
});

afterEach(() => {
  db.close();
  while (tempDirs.length) fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

describe('findWithoutThumbnail', () => {
  it('returns only the rows with no thumbnail recorded, oldest first', () => {
    seed('m2', { created_at: '2026-02-01T00:00:00.000Z' });
    seed('m1', { created_at: '2026-01-01T00:00:00.000Z' });
    seed('m3', { thumbnail_path: '/media/thumbnails/m3.webp' });
    // An empty string is as good as absent; the bridge migrations guarded on
    // TRIM for exactly this reason.
    seed('m4', { thumbnail_path: '   ', created_at: '2026-03-01T00:00:00.000Z' });

    expect(new MediaRepository().findWithoutThumbnail().map((m) => m.id)).toEqual(['m1', 'm2', 'm4']);
  });
});

describe('setThumbnail', () => {
  it('records the thumbnail in media_items and in artifact_files', () => {
    const thumb = tempFile('m1.webp', 'small');
    seed('m1');

    new MediaRepository().setThumbnail('m1', thumb, 'image/webp');

    const media = db.prepare('SELECT thumbnail_path, updated_at FROM media_items WHERE id = ?').get('m1') as {
      thumbnail_path: string; updated_at: string;
    };
    expect(media.thumbnail_path).toBe(thumb);
    expect(media.updated_at).not.toBe('2026-01-01T00:00:00.000Z');

    const file = db.prepare("SELECT * FROM artifact_files WHERE file_role = 'thumbnail'").get() as {
      id: string; artifact_id: string; mime_type: string; size_bytes: number; original_filename: string;
    };
    expect(file.id).toBe('artifact_file_thumb_m1');
    expect(file.artifact_id).toBe('m1');
    // The thumbnail's own type, not the original's -- the bridge migrations
    // copied the source mime into this row, which was wrong whenever the
    // formats differed.
    expect(file.mime_type).toBe('image/webp');
    expect(file.size_bytes).toBe('small'.length);
    expect(file.original_filename).toBe('m1-original.jpg');
  });

  it('replaces an earlier thumbnail row rather than failing on its id', () => {
    seed('m1');
    const first = tempFile('old.webp', 'old');
    const second = tempFile('new.webp', 'newer bytes');
    const repo = new MediaRepository();

    repo.setThumbnail('m1', first, 'image/webp');
    repo.setThumbnail('m1', second, 'image/webp');

    const rows = db.prepare("SELECT storage_path, size_bytes FROM artifact_files WHERE file_role = 'thumbnail'").all() as {
      storage_path: string; size_bytes: number;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].storage_path).toBe(second);
    expect(rows[0].size_bytes).toBe('newer bytes'.length);
  });

  /* The hand-built fixtures in other repository tests omit artifact_files;
     querying it unguarded is how MediaRepository.test.ts broke before. */
  it('still updates the media row when artifact_files does not exist', () => {
    db.exec('DROP TABLE artifact_files');
    const thumb = tempFile('m1.webp');
    seed('m1');

    expect(() => new MediaRepository().setThumbnail('m1', thumb, 'image/webp')).not.toThrow();
    expect(
      (db.prepare('SELECT thumbnail_path FROM media_items WHERE id = ?').get('m1') as { thumbnail_path: string })
        .thumbnail_path,
    ).toBe(thumb);
  });
});

describe('delete', () => {
  /* is_external protects the user's own originals -- a scanned file AFT must
     not touch. The thumbnail beside it was generated by AFT, so it is ours to
     remove; leaving it behind orphans a file in the volume forever. */
  it('removes a generated thumbnail even for an external original', () => {
    const original = tempFile('scan.jpg', 'original');
    const thumb = tempFile('scan.webp', 'small');
    seed('m1', { file_path: original, thumbnail_path: thumb, is_external: 1 });

    const result = new MediaRepository().delete('m1');

    expect(result.deleted).toBe(true);
    // The original is left alone, as before.
    expect(result.fileDeleted).toBe(false);
    expect(fs.existsSync(original)).toBe(true);
    expect(fs.existsSync(thumb)).toBe(false);
  });

  it('removes both for an app-managed upload', () => {
    const original = tempFile('upload.jpg', 'original');
    const thumb = tempFile('upload.webp', 'small');
    seed('m2', { file_path: original, thumbnail_path: thumb });

    const result = new MediaRepository().delete('m2');

    expect(result.fileDeleted).toBe(true);
    expect(fs.existsSync(original)).toBe(false);
    expect(fs.existsSync(thumb)).toBe(false);
  });
});

describe('scanDirectory', () => {
  /* Generated thumbnails live under DATA_DIR to stay out of the scan, but
     DATA_DIR and MEDIA_PATH are separate settings and nothing stops them
     overlapping. .webp is scannable and the walk recurses, so without the
     guard such a setup would re-import every thumbnail as a new external
     media item -- each appearing on the Artifacts page as its own artifact. */
  it('does not import generated thumbnails as new media', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-scan-'));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, 'photos'));
    fs.mkdirSync(path.join(root, 'thumbnails'));
    fs.writeFileSync(path.join(root, 'photos', 'class-photo.jpg'), 'original');
    fs.writeFileSync(path.join(root, 'thumbnails', 'class-photo.webp'), 'derived');

    const result = new MediaRepository().scanDirectory(root);

    expect(result.added).toBe(1);
    const paths = db.prepare('SELECT file_path FROM media_items').all() as { file_path: string }[];
    expect(paths.map((p) => path.basename(p.file_path))).toEqual(['class-photo.jpg']);
  });

  /* A "thumbnails" folder nested deeper is the user's own, not AFT's, so it
     is still scanned -- the guard is scoped to the scan root. */
  it('still scans a thumbnails folder that is not the generated one', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-scan-'));
    tempDirs.push(root);
    fs.mkdirSync(path.join(root, 'grandma', 'thumbnails'), { recursive: true });
    fs.writeFileSync(path.join(root, 'grandma', 'thumbnails', 'contact-sheet.jpg'), 'theirs');

    expect(new MediaRepository().scanDirectory(root).added).toBe(1);
  });
});
