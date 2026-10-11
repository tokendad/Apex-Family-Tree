import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { mediaRouter } = await import('./media.js');

const tempDirs: string[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'admin' };
    next();
  });
  app.use('/api/v1/media', mediaRouter);
  return app;
}

function tempFile(name: string, contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-media-route-'));
  tempDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function seed(id: string, filePath: string, thumbnailPath: string | null) {
  db.prepare(
    `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path,
                              thumbnail_path, is_external, created_at, updated_at)
     VALUES (?, ?, ?, 'image/jpeg', 10, ?, ?, 0, datetime('now'), datetime('now'))`,
  ).run(id, `${id}.jpg`, `${id}-original.jpg`, filePath, thumbnailPath);
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
  `);
});

afterEach(() => {
  db.close();
  while (tempDirs.length) fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

describe('GET /media/:id/thumbnail', () => {
  it('serves the thumbnail with its own type, not the original\'s', async () => {
    const original = tempFile('photo.jpg', 'the full-size original');
    const thumb = tempFile('photo.webp', 'small');
    seed('m1', original, thumb);

    const res = await request(buildApp()).get('/api/v1/media/m1/thumbnail');

    expect(res.status).toBe(200);
    // media_items has a single mime_type column, describing the original; the
    // thumbnail is WebP whatever went in, so the type comes from the extension.
    expect(res.headers['content-type']).toContain('image/webp');
    expect(res.body.toString()).toBe('small');
  });

  it('falls back to the original when none has been generated', async () => {
    const original = tempFile('photo.jpg', 'the full-size original');
    seed('m2', original, null);

    const res = await request(buildApp()).get('/api/v1/media/m2/thumbnail');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.body.toString()).toBe('the full-size original');
  });

  it('falls back to the original when the thumbnail has vanished from disk', async () => {
    const original = tempFile('photo.jpg', 'the full-size original');
    seed('m3', original, '/nowhere/gone.webp');

    const res = await request(buildApp()).get('/api/v1/media/m3/thumbnail');

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('the full-size original');
  });

  it('404s for an unknown media item', async () => {
    const res = await request(buildApp()).get('/api/v1/media/nope/thumbnail');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/media not found/i);
  });

  it('404s when neither the thumbnail nor the original is on disk', async () => {
    seed('m4', '/nowhere/photo.jpg', null);

    const res = await request(buildApp()).get('/api/v1/media/m4/thumbnail');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found on disk/i);
  });

  /* Declared before GET /:id, or Express matches "thumbnail" as an id and
     returns the media row's file instead of the thumbnail. */
  it('is matched as its own route rather than as a media id', async () => {
    const original = tempFile('photo.jpg', 'the full-size original');
    const thumb = tempFile('photo.webp', 'small');
    seed('m5', original, thumb);

    const res = await request(buildApp()).get('/api/v1/media/m5/thumbnail');

    expect(res.body.toString()).toBe('small');
  });
});
