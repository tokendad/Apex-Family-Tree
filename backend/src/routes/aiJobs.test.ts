import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { aiJobsRouter } = await import('./aiJobs.js');
const { AiJobRepository } = await import('../repositories/AiJobRepository.js');

type Role = 'admin' | 'editor' | 'limited_editor' | 'viewer';

function buildApp(userId: string, role: Role) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { userId, email: 'test@example.com', role };
    next();
  });
  app.use('/api/v1/ai', aiJobsRouter);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE ai_jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL, model TEXT NOT NULL,
      input_ref TEXT, result_json TEXT, error_message TEXT, input_tokens INTEGER, output_tokens INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), started_at TEXT, completed_at TEXT
    );
  `);
  db.prepare("INSERT INTO users (id) VALUES ('user-1'), ('user-2')").run();
});

afterEach(() => db.close());

describe('GET /ai/jobs/:id', () => {
  it('404s for a job that does not exist', async () => {
    const res = await request(buildApp('user-1', 'editor')).get('/api/v1/ai/jobs/nope');
    expect(res.status).toBe(404);
  });

  it('lets the requester read their own job', async () => {
    const job = new AiJobRepository().create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });

    const res = await request(buildApp('user-1', 'editor')).get(`/api/v1/ai/jobs/${job.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(job.id);
  });

  it('lets an admin read someone else\'s job', async () => {
    const job = new AiJobRepository().create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });

    const res = await request(buildApp('user-2', 'admin')).get(`/api/v1/ai/jobs/${job.id}`);

    expect(res.status).toBe(200);
  });

  it('refuses a non-admin reading someone else\'s job', async () => {
    const job = new AiJobRepository().create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });

    const res = await request(buildApp('user-2', 'editor')).get(`/api/v1/ai/jobs/${job.id}`);

    expect(res.status).toBe(403);
  });
});
