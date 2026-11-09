import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const createLLMProviderMock = vi.fn();
vi.mock('../providers/llm/factory.js', () => ({
  createLLMProvider: () => createLLMProviderMock(),
}));

const { artifactsRouter } = await import('./artifacts.js');
const { LLMProviderError } = await import('../providers/llm/LLMProvider.js');

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

let tmpFile: string;

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
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, value_type TEXT NOT NULL DEFAULT 'string');
    CREATE TABLE feature_flags (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE ai_jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL, model TEXT NOT NULL,
      input_ref TEXT, result_json TEXT, error_message TEXT, input_tokens INTEGER, output_tokens INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), started_at TEXT, completed_at TEXT
    );
    INSERT INTO artifact_types (id, name) VALUES ('t_document', 'Document');
    INSERT INTO feature_flags (key, enabled) VALUES ('ai_transcription', 1);
    INSERT INTO users (id) VALUES ('user-1');
  `);
  createLLMProviderMock.mockReset();

  tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aft-transcribe-')), 'scan.jpg');
  fs.writeFileSync(tmpFile, 'jpeg-bytes');
});

afterEach(() => {
  fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
});

function seedArtifact(id: string, title: string) {
  db.prepare(
    `INSERT INTO archive_objects (id, object_type, title, privacy_level, is_deleted, created_at, updated_at)
     VALUES (?, 'artifact', ?, 'family', 0, datetime('now'), datetime('now'))`,
  ).run(id, title);
  db.prepare("INSERT INTO artifacts (id, artifact_type_id) VALUES (?, 't_document')").run(id);
}

function seedFile(artifactId: string, opts: { storagePath: string; mime?: string | null }) {
  db.prepare(
    `INSERT INTO artifact_files (id, artifact_id, file_role, storage_provider, storage_path, mime_type, created_at)
     VALUES (?, ?, 'primary', 'local', ?, ?, datetime('now'))`,
  ).run(`af_${artifactId}`, artifactId, opts.storagePath, opts.mime ?? null);
}

describe('POST /artifacts/:id/transcribe', () => {
  it('202s with a job id when the flag is on and a provider is configured', async () => {
    seedArtifact('a1', 'Draft card');
    seedFile('a1', { storagePath: tmpFile, mime: 'image/jpeg' });
    createLLMProviderMock.mockResolvedValue({
      transcribe: vi.fn().mockResolvedValue({ text: 'transcribed', truncated: false, inputTokens: 1, outputTokens: 2 }),
    });

    const res = await request(buildApp('editor')).post('/api/v1/artifacts/a1/transcribe');

    expect(res.status).toBe(202);
    expect(res.body.jobId).toBeTruthy();

    // The mocked provider resolves instantly, so by the time we check, the
    // setImmediate-deferred work may already have completed -- the point of
    // this assertion is that the response came back before waiting on it.
    await new Promise((resolve) => setImmediate(resolve));
    const row = db.prepare('SELECT status, result_json FROM ai_jobs WHERE id = ?').get(res.body.jobId) as
      { status: string; result_json: string | null };
    expect(row.status).toBe('completed');
    expect(JSON.parse(row.result_json!)).toEqual({ text: 'transcribed', truncated: false });
  });

  it('403s for a viewer', async () => {
    seedArtifact('a2', 'Locked down');
    seedFile('a2', { storagePath: tmpFile, mime: 'image/jpeg' });

    const res = await request(buildApp('viewer')).post('/api/v1/artifacts/a2/transcribe');
    expect(res.status).toBe(403);
  });

  it('403s when the ai_transcription flag is off', async () => {
    db.prepare("UPDATE feature_flags SET enabled = 0 WHERE key = 'ai_transcription'").run();
    seedArtifact('a3', 'Flag off');
    seedFile('a3', { storagePath: tmpFile, mime: 'image/jpeg' });

    const res = await request(buildApp('editor')).post('/api/v1/artifacts/a3/transcribe');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });

  it('404s for an artifact that does not exist', async () => {
    const res = await request(buildApp('editor')).post('/api/v1/artifacts/nope/transcribe');
    expect(res.status).toBe(404);
  });

  it('404s for an artifact with no primary file', async () => {
    seedArtifact('a4', 'No file yet');
    const res = await request(buildApp('editor')).post('/api/v1/artifacts/a4/transcribe');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no primary file/i);
  });

  it('400s with a clear message when no API key is configured', async () => {
    seedArtifact('a5', 'No key yet');
    seedFile('a5', { storagePath: tmpFile, mime: 'image/jpeg' });
    createLLMProviderMock.mockRejectedValue(new LLMProviderError('auth', 'No LLM API key is configured.'));

    const res = await request(buildApp('editor')).post('/api/v1/artifacts/a5/transcribe');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/api key/i);
  });
});
