import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { AiJobRepository } = await import('./AiJobRepository.js');

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE ai_jobs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('transcribe', 'extract')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
      requested_by TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_ref TEXT,
      result_json TEXT,
      error_message TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );
  `);
  db.prepare("INSERT INTO users (id) VALUES ('user-1')").run();
});

afterEach(() => db.close());

describe('AiJobRepository', () => {
  it('creates a pending job and reads it back', () => {
    const repo = new AiJobRepository();
    const job = repo.create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'claude-opus-5-5', input_ref: 'artifact-1' });

    expect(job.status).toBe('pending');
    expect(job.input_ref).toBe('artifact-1');
    expect(repo.findById(job.id)).toMatchObject({ id: job.id, status: 'pending' });
  });

  it('moves a job through running to completed, recording tokens and timestamps', () => {
    const repo = new AiJobRepository();
    const job = repo.create({ kind: 'extract', requested_by: 'user-1', provider: 'anthropic', model: 'claude-opus-5-5' });

    repo.markRunning(job.id);
    let row = repo.findById(job.id)!;
    expect(row.status).toBe('running');
    expect(row.started_at).not.toBeNull();

    repo.markCompleted(job.id, { result_json: '{"text":"hi"}', input_tokens: 10, output_tokens: 20 });
    row = repo.findById(job.id)!;
    expect(row.status).toBe('completed');
    expect(row.result_json).toBe('{"text":"hi"}');
    expect(row.input_tokens).toBe(10);
    expect(row.output_tokens).toBe(20);
    expect(row.completed_at).not.toBeNull();
  });

  it('records a failure with its message', () => {
    const repo = new AiJobRepository();
    const job = repo.create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'claude-opus-5-5' });

    repo.markFailed(job.id, 'provider exploded');
    const row = repo.findById(job.id)!;
    expect(row.status).toBe('failed');
    expect(row.error_message).toBe('provider exploded');
  });

  it('fails jobs left pending or running, leaving completed/failed alone', () => {
    const repo = new AiJobRepository();
    const running = repo.create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });
    const pending = repo.create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });
    const completed = repo.create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });
    repo.markRunning(running.id);
    repo.markCompleted(completed.id, { result_json: '{}' });

    const changed = repo.failOrphanedJobs();

    // pending *and* running: a job still queued behind runAiJob's in-memory
    // concurrency cap when the process died is just as stuck as one already
    // calling the provider -- neither has anywhere left to resume from.
    expect(changed).toBe(2);
    expect(repo.findById(running.id)!.status).toBe('failed');
    expect(repo.findById(running.id)!.error_message).toMatch(/restart/i);
    expect(repo.findById(pending.id)!.status).toBe('failed');
    expect(repo.findById(completed.id)!.status).toBe('completed');
  });
});
