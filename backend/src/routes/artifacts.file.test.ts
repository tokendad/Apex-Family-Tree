import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { artifactsRouter } = await import('./artifacts.js');

const tempDirs: string[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'admin' };
    next();
  });
  app.use('/api/v1/artifacts', artifactsRouter);
  return app;
}

/** A real file on disk, since the route streams it rather than reading the row. */
function writeFixtureFile(name: string, contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-artifact-'));
  tempDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
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
    INSERT INTO artifact_types (id, name) VALUES ('t_photo', 'Photo');
  `);
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function seedArtifact(id: string, title: string) {
  db.prepare(
    `INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
     VALUES (?, 'artifact', ?, 'family', 0, datetime('now'), datetime('now'))`,
  ).run(id, title);
  db.prepare("INSERT INTO artifacts (id, artifact_type_id) VALUES (?, 't_photo')").run(id);
}

function seedFile(artifactId: string, opts: {
  role?: string; storagePath: string; mime?: string | null; filename?: string | null;
  provider?: string;
}) {
  db.prepare(
    `INSERT INTO artifact_files (id, artifact_id, file_role, storage_provider, storage_path,
                                 original_filename, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    `af_${artifactId}_${opts.role ?? 'primary'}`,
    artifactId,
    opts.role ?? 'primary',
    opts.provider ?? 'local',
    opts.storagePath,
    opts.filename ?? null,
    opts.mime ?? null,
    12,
  );
}

describe('GET /artifacts/:id/file', () => {
  it('serves the primary file inline for an image', async () => {
    const file = writeFixtureFile('scan.jpg', 'jpeg-bytes');
    seedArtifact('a1', 'Grade 1 class photograph');
    seedFile('a1', { storagePath: file, mime: 'image/jpeg', filename: 'scan.jpg' });

    const res = await request(buildApp()).get('/api/v1/artifacts/a1/file');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.headers['content-disposition']).toContain('scan.jpg');
  });

  it('offers a non-image as a download rather than rendering it', async () => {
    const file = writeFixtureFile('will.pdf', '%PDF-1.4');
    seedArtifact('a2', 'Last will');
    seedFile('a2', { storagePath: file, mime: 'application/pdf', filename: 'will.pdf' });

    const res = await request(buildApp()).get('/api/v1/artifacts/a2/file');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('404s for an artifact that does not exist', async () => {
    const res = await request(buildApp()).get('/api/v1/artifacts/nope/file');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/artifact not found/i);
  });

  it('distinguishes an artifact with no primary file from a missing artifact', async () => {
    seedArtifact('a3', 'Catalogued but unscanned');
    // A thumbnail but no primary: the case the media endpoint could never
    // express, since it keys off a media row existing at all.
    seedFile('a3', { role: 'thumbnail', storagePath: '/nowhere/thumb.jpg', mime: 'image/jpeg' });

    const res = await request(buildApp()).get('/api/v1/artifacts/a3/file');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no primary file/i);
  });

  it('404s when the row points at a file that is not on disk', async () => {
    seedArtifact('a4', 'Moved scan');
    seedFile('a4', { storagePath: '/definitely/not/here.jpg', mime: 'image/jpeg' });

    const res = await request(buildApp()).get('/api/v1/artifacts/a4/file');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found on disk/i);
  });

  it('refuses a storage provider it cannot read', async () => {
    seedArtifact('a5', 'Remote scan');
    seedFile('a5', { storagePath: 's3://bucket/key.jpg', mime: 'image/jpeg', provider: 's3' });

    const res = await request(buildApp()).get('/api/v1/artifacts/a5/file');

    expect(res.status).toBe(501);
  });

  it('falls back to a generic content type when the row records none', async () => {
    const file = writeFixtureFile('mystery.bin', 'bytes');
    seedArtifact('a6', 'Unknown format');
    seedFile('a6', { storagePath: file, mime: null });

    const res = await request(buildApp()).get('/api/v1/artifacts/a6/file');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    expect(res.headers['content-disposition']).toContain('attachment');
  });
});

describe('GET /artifacts/:id includes its files', () => {
  it('returns the files, primary first', async () => {
    seedArtifact('a7', 'Photograph with a thumbnail');
    seedFile('a7', { role: 'thumbnail', storagePath: '/x/thumb.jpg', mime: 'image/jpeg' });
    seedFile('a7', { role: 'primary', storagePath: '/x/full.jpg', mime: 'image/jpeg' });

    const res = await request(buildApp()).get('/api/v1/artifacts/a7');

    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(2);
    expect(res.body.files[0].file_role).toBe('primary');
  });

  it('returns an empty list rather than omitting the field', async () => {
    seedArtifact('a8', 'Nothing attached');
    const res = await request(buildApp()).get('/api/v1/artifacts/a8');
    expect(res.body.files).toEqual([]);
  });
});
