import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

/* Same reasoning as media.upload.test.ts: the storage destination is read
   from MEDIA_PATH once at import time, so it has to be redirected before the
   router is imported. Also redirects DATA_DIR, since attaching a file runs
   the thumbnail generator the same way an upload does. */
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-upload-artifact-'));
const thumbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-upload-artifact-data-'));
process.env.MEDIA_PATH = uploadDir;
process.env.DATA_DIR = thumbDir;

const { artifactsRouter } = await import('./artifacts.js');
const { MediaRepository } = await import('../repositories/MediaRepository.js');

type Role = 'admin' | 'editor' | 'limited_editor' | 'viewer';

function buildApp(role: Role = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role };
    next();
  });
  app.use('/api/v1/artifacts', artifactsRouter);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY, object_type TEXT, title TEXT, summary TEXT,
      privacy_level TEXT, is_deleted INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE artifact_types (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE evidence_classifications (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY, artifact_type_id TEXT, evidence_classification_id TEXT,
      original_date_text TEXT, original_date_start TEXT, original_date_end TEXT,
      date_precision TEXT, date_qualifier TEXT, creator_text TEXT,
      physical_location TEXT, original_format TEXT, condition_notes TEXT,
      language TEXT, transcription TEXT, notes TEXT
    );
    CREATE TABLE artifact_files (
      id TEXT PRIMARY KEY, artifact_id TEXT, file_role TEXT,
      storage_provider TEXT DEFAULT 'local', storage_path TEXT,
      original_filename TEXT, mime_type TEXT, size_bytes INTEGER,
      checksum_sha256 TEXT, width INTEGER, height INTEGER,
      duration_seconds REAL, created_at TEXT
    );
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL, file_size INTEGER NOT NULL, file_path TEXT NOT NULL,
      thumbnail_path TEXT, title TEXT, description TEXT, date_taken TEXT, uploaded_by TEXT,
      is_external INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO artifact_types (id, name) VALUES ('t_document', 'Document');
  `);
});

afterEach(() => {
  for (const file of fs.readdirSync(path.join(uploadDir, 'photos'))) {
    fs.rmSync(path.join(uploadDir, 'photos', file));
  }
});

function seedArtifact(id: string, title: string) {
  db.prepare(
    `INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
     VALUES (?, 'artifact', ?, 'family', 0, datetime('now'), datetime('now'))`,
  ).run(id, title);
  db.prepare("INSERT INTO artifacts (id, artifact_type_id) VALUES (?, 't_document')").run(id);
}

describe('POST /artifacts/:id/file', () => {
  it('attaches an uploaded file as the artifact\'s primary file', async () => {
    seedArtifact('a1', 'Draft registration card');

    const res = await request(buildApp())
      .post('/api/v1/artifacts/a1/file')
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'card.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'artifact_file_media_a1',
      artifact_id: 'a1',
      file_role: 'primary',
      storage_provider: 'local',
      original_filename: 'card.pdf',
      mime_type: 'application/pdf',
    });
    expect(fs.existsSync(res.body.storage_path)).toBe(true);

    // The bridge convention (artifact id == media id), not a fresh id: this
    // is what keeps a scan of MEDIA_PATH from re-importing the same file as
    // an unrelated second artifact (#46 follow-up). The title is left alone,
    // not overwritten with the filename.
    const mediaRow = db.prepare('SELECT id, file_path, title FROM media_items WHERE id = ?').get('a1');
    expect(mediaRow).toMatchObject({ id: 'a1', file_path: res.body.storage_path });
    expect(db.prepare('SELECT title FROM archive_objects WHERE id = ?').get('a1')).toEqual({
      title: 'Draft registration card',
    });

    const fileRes = await request(buildApp()).get('/api/v1/artifacts/a1/file');
    expect(fileRes.status).toBe(200);
    expect(fileRes.body.toString()).toBe('%PDF-1.4 fake');
  });

  it('does not get re-imported as a second artifact by a directory scan', async () => {
    seedArtifact('a6', 'Scan safety check');

    const res = await request(buildApp())
      .post('/api/v1/artifacts/a6/file')
      .attach('file', Buffer.from('scan-safety'), { filename: 'scan.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);

    const mediaRepo = new MediaRepository();
    const result = mediaRepo.scanDirectory(uploadDir);

    expect(result.added).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM artifacts').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM media_items').get()).toEqual({ n: 1 });
  });

  it('404s for an artifact that does not exist, and writes nothing to disk', async () => {
    const before = fs.readdirSync(path.join(uploadDir, 'photos')).length;

    const res = await request(buildApp())
      .post('/api/v1/artifacts/nope/file')
      .attach('file', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/artifact not found/i);
    // Checked before multer runs, so a 404 never leaves an orphan file in the
    // user's photo library with no media_items row to go with it.
    expect(fs.readdirSync(path.join(uploadDir, 'photos')).length).toBe(before);
  });

  it('refuses a second file once one is already attached, and writes nothing to disk', async () => {
    seedArtifact('a2', 'Already scanned');
    db.prepare(
      `INSERT INTO artifact_files (id, artifact_id, file_role, storage_provider, storage_path, created_at)
       VALUES ('existing', 'a2', 'primary', 'local', '/already/there.jpg', datetime('now'))`,
    ).run();

    const before = fs.readdirSync(path.join(uploadDir, 'photos')).length;

    const res = await request(buildApp())
      .post('/api/v1/artifacts/a2/file')
      .attach('file', Buffer.from('x'), { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already has a file/i);
    expect(fs.readdirSync(path.join(uploadDir, 'photos')).length).toBe(before);
  });

  it('says so when the request carries no file at all', async () => {
    seedArtifact('a3', 'No file sent');
    const res = await request(buildApp()).post('/api/v1/artifacts/a3/file');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file uploaded/i);
  });

  it('refuses a type that is not on the allow list', async () => {
    seedArtifact('a4', 'Bad type');
    const res = await request(buildApp())
      .post('/api/v1/artifacts/a4/file')
      .attach('file', Buffer.from('#!/bin/sh\necho hi'), {
        filename: 'payload.sh',
        contentType: 'application/x-sh',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
    expect(db.prepare('SELECT COUNT(*) AS n FROM artifact_files').get()).toEqual({ n: 0 });
  });

  it('refuses an upload from a viewer', async () => {
    seedArtifact('a5', 'Locked down');
    const res = await request(buildApp('viewer'))
      .post('/api/v1/artifacts/a5/file')
      .attach('file', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
  });
});
