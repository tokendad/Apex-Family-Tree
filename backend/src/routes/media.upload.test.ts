import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

/* The upload writes into MEDIA_PATH and the thumbnailer into DATA_DIR, and
   init.ts reads both once when it loads, so they are redirected before the
   router is imported rather than in a hook. Vitest gives each test file its
   own process, so this does not reach the rest of the suite. */
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-upload-media-'));
const thumbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-upload-data-'));
process.env.MEDIA_PATH = uploadDir;
process.env.DATA_DIR = thumbDir;

const { mediaRouter } = await import('./media.js');

type Role = 'admin' | 'editor' | 'limited_editor' | 'viewer';

function buildApp(role: Role = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role };
    next();
  });
  app.use('/api/v1/media', mediaRouter);
  return app;
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
    /* An upload is catalogued as an artifact as well as a media item, so the
       archive tables have to be here or create() half-succeeds. */
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY, object_type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT,
      privacy_level TEXT NOT NULL DEFAULT 'family', is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY, artifact_type_id TEXT NOT NULL,
      original_date_text TEXT, original_format TEXT
    );
    CREATE TABLE artifact_files (
      id TEXT PRIMARY KEY, artifact_id TEXT NOT NULL, file_role TEXT NOT NULL,
      storage_provider TEXT NOT NULL, storage_path TEXT NOT NULL, original_filename TEXT,
      mime_type TEXT, size_bytes INTEGER, created_at TEXT NOT NULL
    );
  `);
});

afterEach(() => db.close());

afterAll(() => {
  for (const dir of [uploadDir, thumbDir]) fs.rmSync(dir, { recursive: true, force: true });
});

/* Nothing drove a real multipart request through multer before this, which
   left the one production dependency with a published denial-of-service
   advisory (GHSA-q7qp-rjg7-q26m, fixed in 2.5.0) covered only by the fact that
   the app started. These post actual bodies. */
describe('POST /media/upload', () => {
  it('accepts an allowed file, stores it, and records it', async () => {
    const res = await request(buildApp())
      .post('/api/v1/media/upload')
      .field('title', 'A photograph')
      .attach('file', Buffer.from('not really a jpeg'), {
        filename: 'portrait.jpg',
        contentType: 'image/jpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      original_filename: 'portrait.jpg',
      mime_type: 'image/jpeg',
      title: 'A photograph',
      file_size: 17,
    });

    /* The stored name is random and the extension is kept, so two uploads of
       the same filename cannot overwrite each other. */
    expect(res.body.filename).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(fs.existsSync(res.body.file_path)).toBe(true);
    expect(fs.readFileSync(res.body.file_path, 'utf8')).toBe('not really a jpeg');

    expect(db.prepare('SELECT COUNT(*) AS n FROM media_items').get()).toEqual({ n: 1 });
    /* And catalogued, typed from the MIME type the upload declared. */
    expect(db.prepare('SELECT object_type, title FROM archive_objects WHERE id = ?').get(res.body.id))
      .toEqual({ object_type: 'artifact', title: 'A photograph' });
    expect(db.prepare('SELECT artifact_type_id FROM artifacts WHERE id = ?').get(res.body.id))
      .toEqual({ artifact_type_id: 'artifact_type_photo' });
  });

  it('refuses a type that is not on the allow list, and writes nothing', async () => {
    const before = fs.readdirSync(path.join(uploadDir, 'photos')).length;

    const res = await request(buildApp())
      .post('/api/v1/media/upload')
      .attach('file', Buffer.from('#!/bin/sh\necho hello'), {
        filename: 'payload.sh',
        contentType: 'application/x-sh',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
    /* fileFilter rejecting is only half of it: the point is that nothing
       reached disk and nothing reached the database. */
    expect(fs.readdirSync(path.join(uploadDir, 'photos')).length).toBe(before);
    expect(db.prepare('SELECT COUNT(*) AS n FROM media_items').get()).toEqual({ n: 0 });
  });

  it('rejects a file over the size limit with the limit named', async () => {
    const res = await request(buildApp())
      .post('/api/v1/media/upload')
      .attach('file', Buffer.alloc(11 * 1024 * 1024, 0x41), {
        filename: 'huge.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maximum size is 10MB/i);
    expect(db.prepare('SELECT COUNT(*) AS n FROM media_items').get()).toEqual({ n: 0 });
  });

  it('says so when the request carries no file at all', async () => {
    const res = await request(buildApp())
      .post('/api/v1/media/upload')
      .field('title', 'No file attached');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file uploaded/i);
  });

  it('refuses an upload from a viewer', async () => {
    const res = await request(buildApp('viewer'))
      .post('/api/v1/media/upload')
      .attach('file', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
  });
});
