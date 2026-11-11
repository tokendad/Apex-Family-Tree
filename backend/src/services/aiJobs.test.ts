import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { runAiJob, sweepOrphanedAiJobs } = await import('./aiJobs.js');
const { AiJobRepository } = await import('../repositories/AiJobRepository.js');

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

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

describe('runAiJob', () => {
  it('returns a pending job immediately, without waiting for work() to resolve', () => {
    const work = vi.fn(() => new Promise<{ data: unknown; inputTokens: number; outputTokens: number }>(() => {
      // deliberately never resolves -- this test only checks the synchronous return
    }));

    const job = runAiJob('transcribe', 'user-1', 'anthropic', 'claude-opus-5-5', 'artifact-1', work);

    expect(job.status).toBe('pending');
    expect(work).not.toHaveBeenCalled(); // deferred via setImmediate, not called synchronously
  });

  it('marks the job completed with the work result once it resolves', async () => {
    const job = runAiJob('transcribe', 'user-1', 'anthropic', 'claude-opus-5-5', undefined, async () => ({
      data: { text: 'hello' },
      inputTokens: 5,
      outputTokens: 7,
    }));

    await flushMicrotasks();
    await flushMicrotasks();

    const row = new AiJobRepository().findById(job.id)!;
    expect(row.status).toBe('completed');
    expect(JSON.parse(row.result_json!)).toEqual({ text: 'hello' });
    expect(row.input_tokens).toBe(5);
    expect(row.output_tokens).toBe(7);
  });

  it('marks the job failed with the error message when work() rejects', async () => {
    const job = runAiJob('extract', 'user-1', 'anthropic', 'claude-opus-5-5', undefined, async () => {
      throw new Error('provider unavailable');
    });

    await flushMicrotasks();
    await flushMicrotasks();

    const row = new AiJobRepository().findById(job.id)!;
    expect(row.status).toBe('failed');
    expect(row.error_message).toBe('provider unavailable');
  });
});

describe('sweepOrphanedAiJobs', () => {
  it('fails jobs left pending or running, leaving completed/failed alone', () => {
    const repo = new AiJobRepository();
    const running = repo.create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });
    const pending = repo.create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });
    const completed = repo.create({ kind: 'transcribe', requested_by: 'user-1', provider: 'anthropic', model: 'm' });
    repo.markRunning(running.id);
    repo.markCompleted(completed.id, { result_json: '{}' });

    sweepOrphanedAiJobs();

    expect(repo.findById(running.id)!.status).toBe('failed');
    expect(repo.findById(pending.id)!.status).toBe('failed');
    expect(repo.findById(completed.id)!.status).toBe('completed');
  });
});
