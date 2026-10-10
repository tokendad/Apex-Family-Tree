import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
let mediaDir: string;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));
vi.mock('./init.js', () => ({
  THUMBNAIL_DIR_NAME: 'thumbnails',
  getMediaPath: (...segments: string[]) => path.join(mediaDir, ...segments),
  getThumbnailPath: (...segments: string[]) => path.join(mediaDir, 'thumbnails', ...segments),
}));

const { ensureThumbnail, backfillThumbnails, canThumbnail, THUMBNAIL_MIME } = await import('./thumbnails.js');
const sharp = (await import('sharp')).default;

const tempDirs: string[] = [];
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

/** A real JPEG on disk: the generator decodes the file, not the row. */
async function writeImage(name: string, width = 1200, height = 900): Promise<string> {
  const file = path.join(mediaDir, 'photos', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } },
  })
    .jpeg()
    .toFile(file);
  return file;
}

function seedMedia(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  const row = {
    id,
    filename: `${id}.jpg`,
    original_filename: `${id}.jpg`,
    mime_type: 'image/jpeg',
    file_size: 100,
    file_path: '',
    thumbnail_path: null,
    title: null,
    description: null,
    date_taken: null,
    uploaded_by: 'user-1',
    is_external: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path,
                              thumbnail_path, title, description, date_taken, uploaded_by,
                              is_external, created_at, updated_at)
     VALUES (@id, @filename, @original_filename, @mime_type, @file_size, @file_path,
             @thumbnail_path, @title, @description, @date_taken, @uploaded_by,
             @is_external, @created_at, @updated_at)`,
  ).run(row);
  return row as never;
}

beforeEach(() => {
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-thumbs-'));
  tempDirs.push(mediaDir);
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY, filename TEXT, original_filename TEXT, mime_type TEXT,
      file_size INTEGER, file_path TEXT, thumbnail_path TEXT, title TEXT, description TEXT,
      date_taken TEXT, uploaded_by TEXT, is_external INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE artifact_files (
      id TEXT PRIMARY KEY, artifact_id TEXT, file_role TEXT,
      storage_provider TEXT DEFAULT 'local', storage_path TEXT, original_filename TEXT,
      mime_type TEXT, size_bytes INTEGER, checksum_sha256 TEXT, width INTEGER, height INTEGER,
      duration_seconds REAL, created_at TEXT
    );
  `);
  logger.info.mockClear();
  logger.error.mockClear();
});

afterEach(() => {
  db.close();
  while (tempDirs.length) fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

describe('canThumbnail', () => {
  it('accepts the image types libvips decodes', () => {
    expect(canThumbnail('image/jpeg')).toBe(true);
    expect(canThumbnail('image/png')).toBe(true);
  });

  /* The prebuilt libvips carries no poppler, so a PDF must be excluded rather
     than retried on every pass of the backfill. */
  it('rejects PDFs and missing types', () => {
    expect(canThumbnail('application/pdf')).toBe(false);
    expect(canThumbnail(null)).toBe(false);
  });
});

describe('ensureThumbnail', () => {
  it('writes a smaller file and records it in both tables', async () => {
    const source = await writeImage('wide.jpg');
    const media = seedMedia('m1', { file_path: source });

    expect(await ensureThumbnail(media)).toBe('generated');

    const row = db.prepare('SELECT thumbnail_path FROM media_items WHERE id = ?').get('m1') as {
      thumbnail_path: string;
    };
    expect(row.thumbnail_path).toBeTruthy();
    expect(fs.existsSync(row.thumbnail_path)).toBe(true);
    // The point of the whole exercise: the card must not load 3.7MB.
    expect(fs.statSync(row.thumbnail_path).size).toBeLessThan(fs.statSync(source).size);

    const meta = await sharp(row.thumbnail_path).metadata();
    expect(meta.width).toBe(640);
    expect(meta.format).toBe('webp');

    /* Without the artifact_files row, GET /artifacts/:id/thumbnail reads that
       table, finds nothing, and silently serves the original forever. */
    const file = db
      .prepare("SELECT storage_path, mime_type FROM artifact_files WHERE artifact_id = ? AND file_role = 'thumbnail'")
      .get('m1') as { storage_path: string; mime_type: string };
    expect(file.storage_path).toBe(row.thumbnail_path);
    expect(file.mime_type).toBe(THUMBNAIL_MIME);
  });

  it('does not enlarge an image that is already smaller than the target', async () => {
    const source = await writeImage('small.jpg', 300, 200);
    const media = seedMedia('m2', { file_path: source });

    expect(await ensureThumbnail(media)).toBe('generated');
    const row = db.prepare('SELECT thumbnail_path FROM media_items WHERE id = ?').get('m2') as {
      thumbnail_path: string;
    };
    expect((await sharp(row.thumbnail_path).metadata()).width).toBe(300);
  });

  it('skips an item that already has a thumbnail on disk', async () => {
    const source = await writeImage('done.jpg');
    const existing = path.join(mediaDir, 'thumbnails', 'already.webp');
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, 'not really an image');
    const media = seedMedia('m3', { file_path: source, thumbnail_path: existing });

    expect(await ensureThumbnail(media)).toBe('exists');
    expect(fs.readFileSync(existing, 'utf8')).toBe('not really an image');
  });

  /* A recorded thumbnail whose file has vanished must be regenerated, not
     treated as done -- otherwise one lost file leaves that card on the
     full-size original permanently. */
  it('regenerates when the recorded thumbnail has gone missing', async () => {
    const source = await writeImage('lost.jpg');
    const media = seedMedia('m4', {
      file_path: source,
      thumbnail_path: path.join(mediaDir, 'thumbnails', 'gone.webp'),
    });

    expect(await ensureThumbnail(media)).toBe('generated');
  });

  it('reports an unsupported type without touching the row', async () => {
    const media = seedMedia('m5', { file_path: await writeImage('doc.jpg'), mime_type: 'application/pdf' });
    expect(await ensureThumbnail(media)).toBe('unsupported');
    expect(
      (db.prepare('SELECT thumbnail_path FROM media_items WHERE id = ?').get('m5') as { thumbnail_path: null })
        .thumbnail_path,
    ).toBeNull();
  });

  it('reports a source that is not on disk', async () => {
    const media = seedMedia('m6', { file_path: path.join(mediaDir, 'photos', 'nope.jpg') });
    expect(await ensureThumbnail(media)).toBe('source-missing');
  });

  it('fails without throwing when the file is not a decodable image', async () => {
    const broken = path.join(mediaDir, 'photos', 'broken.jpg');
    fs.mkdirSync(path.dirname(broken), { recursive: true });
    fs.writeFileSync(broken, 'these are not image bytes');
    const media = seedMedia('m7', { file_path: broken });

    expect(await ensureThumbnail(media)).toBe('failed');
  });
});

describe('backfillThumbnails', () => {
  it('generates the missing ones and counts the rest', async () => {
    seedMedia('b1', { file_path: await writeImage('b1.jpg') });
    seedMedia('b2', { file_path: await writeImage('b2.jpg'), mime_type: 'application/pdf' });
    seedMedia('b3', { file_path: path.join(mediaDir, 'photos', 'absent.jpg') });

    expect(await backfillThumbnails(logger as never)).toEqual({ generated: 1, skipped: 2, failed: 0 });
  });

  /* Idempotence is what lets this run on every single startup. */
  it('does nothing on a second pass', async () => {
    seedMedia('b4', { file_path: await writeImage('b4.jpg') });

    expect((await backfillThumbnails(logger as never)).generated).toBe(1);
    expect(await backfillThumbnails(logger as never)).toEqual({ generated: 0, skipped: 0, failed: 0 });
  });
});
