import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { instanceRouter } = await import('./instance.js');

let app: express.Express;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)');
  const insert = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)');
  insert.run('instance_name', 'The Lefort Archive');
  insert.run('instance_timezone', 'America/New_York');
  insert.run('gedcom_default_version', '5.5.1');
  insert.run('smtp_pass', 'hunter2');
  insert.run('smtp_host', 'smtp.example.com');
  insert.run('allow_registration', 'false');

  app = express();
  app.use('/instance', instanceRouter);
});

afterEach(() => db.close());

describe('GET /instance', () => {
  it('describes the instance', async () => {
    const res = await request(app).get('/instance').expect(200);

    expect(res.body.instance_name).toBe('The Lefort Archive');
    expect(res.body.instance_timezone).toBe('America/New_York');
    expect(res.body.gedcom_default_version).toBe('5.5.1');
  });

  /* The settings table holds SMTP credentials. This route is the only one that
     reads it without requiring an admin, so it answers with a fixed list of
     keys rather than filtering the table -- and this is the test that would
     fail if someone ever changed it to a filter. */
  it('returns those three keys and nothing else', async () => {
    const res = await request(app).get('/instance').expect(200);

    expect(Object.keys(res.body).sort()).toEqual([
      'gedcom_default_version',
      'instance_name',
      'instance_timezone',
    ]);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(JSON.stringify(res.body)).not.toContain('smtp.example.com');
  });

  it('falls back to defaults when a setting is missing or blank', async () => {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run('instance_timezone');
    db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run('   ', 'instance_name');

    const res = await request(app).get('/instance').expect(200);

    expect(res.body.instance_name).toBe('Apex Family Tree');
    expect(res.body.instance_timezone).toBe('UTC');
  });
});
