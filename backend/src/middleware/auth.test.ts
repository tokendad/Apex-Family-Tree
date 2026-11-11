import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { requireFlag } = await import('./auth.js');

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE feature_flags (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0);
  `);
});

afterEach(() => db.close());

function buildApp(flagKey: string) {
  const app = express();
  app.get('/gated', requireFlag(flagKey), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requireFlag', () => {
  it('403s when the flag is off', async () => {
    db.prepare("INSERT INTO feature_flags (key, enabled) VALUES ('ai_intake', 0)").run();

    const res = await request(buildApp('ai_intake')).get('/gated');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });

  it('403s when the flag has never been seeded', async () => {
    const res = await request(buildApp('nonexistent_flag')).get('/gated');
    expect(res.status).toBe(403);
  });

  it('calls next() when the flag is on', async () => {
    db.prepare("INSERT INTO feature_flags (key, enabled) VALUES ('ai_intake', 1)").run();

    const res = await request(buildApp('ai_intake')).get('/gated');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
