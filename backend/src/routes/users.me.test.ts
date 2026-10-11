import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { usersRouter } = await import('./users.js');
const { hashPassword, hashToken } = await import('../services/auth.js');

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'u1', email: 'wes@example.test', role: 'admin' };
    next();
  });
  app.use('/api/v1/users', usersRouter);
  return app;
}

function refreshTokenIds() {
  return (db.prepare('SELECT id FROM refresh_tokens WHERE user_id = ?').all('u1') as { id: string }[])
    .map((r) => r.id);
}

beforeEach(async () => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE COLLATE NOCASE, display_name TEXT,
      password_hash TEXT, role TEXT, status TEXT DEFAULT 'active', home_person_id TEXT,
      last_login_at TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT,
      expires_at TEXT, created_at TEXT);
  `);
  for (const file of ['026-audit-log.sql', '064-audit-log-bulk-actions.sql', '066-user-settings.sql']) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
  }

  db.prepare(
    "INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at) VALUES ('u1', 'wes@example.test', 'Wes', ?, 'admin', 'active', '2026-01-01', '2026-01-01')",
  ).run(await hashPassword('currentpass1'));

  // Two other devices signed in.
  for (const id of ['t-phone', 't-laptop']) {
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, 'u1', ?, '2099-01-01', '2026-01-01')")
      .run(id, hashToken(id));
  }
});

afterEach(() => db.close());

describe('PATCH /users/me', () => {
  it('changes the display name without asking for a password', async () => {
    const res = await request(buildApp()).patch('/api/v1/users/me').send({ display_name: 'Walter LeFort' });

    expect(res.status).toBe(200);
    expect(res.body.user.display_name).toBe('Walter LeFort');
  });

  it('refuses an empty display name', async () => {
    const res = await request(buildApp()).patch('/api/v1/users/me').send({ display_name: '   ' });
    expect(res.status).toBe(400);
  });

  /* The email is the login, so changing it on a borrowed session would hand
     over the account. */
  it('will not change the email without the current password', async () => {
    const res = await request(buildApp()).patch('/api/v1/users/me').send({ email: 'new@example.test' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/current password/i);
  });

  it('refuses the wrong password', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/users/me').send({ email: 'new@example.test', current_password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('changes the email with the right password', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/users/me').send({ email: 'new@example.test', current_password: 'currentpass1' });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('new@example.test');
  });

  it('refuses an email another account already uses', async () => {
    db.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status) VALUES ('u2', 'taken@example.test', 'X', 'h', 'viewer', 'active')").run();

    const res = await request(buildApp())
      .patch('/api/v1/users/me').send({ email: 'taken@example.test', current_password: 'currentpass1' });

    expect(res.status).toBe(409);
  });

  it('never returns the password hash', async () => {
    const res = await request(buildApp()).patch('/api/v1/users/me').send({ display_name: 'Wes' });
    expect(JSON.stringify(res.body)).not.toContain('argon2');
    expect(res.body.user.password_hash).toBeUndefined();
  });
});

describe('POST /users/me/password', () => {
  it('refuses the wrong current password', async () => {
    const res = await request(buildApp())
      .post('/api/v1/users/me/password').send({ current_password: 'nope', new_password: 'brandnew1' });

    expect(res.status).toBe(401);
    expect(refreshTokenIds()).toHaveLength(2);
  });

  it('applies the password rules to the new password', async () => {
    const res = await request(buildApp())
      .post('/api/v1/users/me/password').send({ current_password: 'currentpass1', new_password: 'abcdefgh' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/number/i);
  });

  /* Someone changing their password is often responding to thinking the
     account is compromised. Leaving other sessions alive defeats the point. */
  it('signs other devices out and keeps this one signed in', async () => {
    const res = await request(buildApp())
      .post('/api/v1/users/me/password').send({ current_password: 'currentpass1', new_password: 'brandnew1' });

    expect(res.status).toBe(200);

    const remaining = refreshTokenIds();
    expect(remaining).toHaveLength(1);
    expect(remaining).not.toContain('t-phone');
    expect(remaining).not.toContain('t-laptop');

    const cookies = String(res.headers['set-cookie']);
    expect(cookies).toContain('access_token');
    expect(cookies).toContain('refresh_token');
  });

  it('records that the password changed, never the password', async () => {
    await request(buildApp())
      .post('/api/v1/users/me/password').send({ current_password: 'currentpass1', new_password: 'brandnew1' });

    const rows = db.prepare('SELECT * FROM audit_log').all() as { new_values: string; old_values: string }[];
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].new_values)).toMatchObject({ password_changed: true });
    expect(JSON.stringify(rows[0])).not.toContain('brandnew1');
    expect(JSON.stringify(rows[0])).not.toContain('currentpass1');
  });

  it('leaves the old password unusable', async () => {
    await request(buildApp())
      .post('/api/v1/users/me/password').send({ current_password: 'currentpass1', new_password: 'brandnew1' });

    const again = await request(buildApp())
      .post('/api/v1/users/me/password').send({ current_password: 'currentpass1', new_password: 'another1' });

    expect(again.status).toBe(401);
  });
});

describe('user settings', () => {
  it('starts empty', async () => {
    const res = await request(buildApp()).get('/api/v1/users/me/settings');
    expect(res.body.settings).toEqual({});
  });

  it('round-trips values with their types', async () => {
    await request(buildApp()).patch('/api/v1/users/me/settings')
      .send({ theme: 'dark', chart_depth: 4, compact: true });

    const res = await request(buildApp()).get('/api/v1/users/me/settings');

    expect(res.body.settings).toEqual({ theme: 'dark', chart_depth: 4, compact: true });
  });

  it('leaves keys it was not given alone', async () => {
    const app = buildApp();
    await request(app).patch('/api/v1/users/me/settings').send({ theme: 'dark', chart_depth: 3 });
    await request(app).patch('/api/v1/users/me/settings').send({ chart_depth: 5 });

    const res = await request(app).get('/api/v1/users/me/settings');

    expect(res.body.settings).toEqual({ theme: 'dark', chart_depth: 5 });
  });

  it('refuses a value it cannot store', async () => {
    const res = await request(buildApp()).patch('/api/v1/users/me/settings').send({ nested: { a: 1 } });
    expect(res.status).toBe(400);
  });

  /* Instance-wide settings live elsewhere; these must never leak across users. */
  it('keeps one person’s preferences to themselves', async () => {
    await request(buildApp()).patch('/api/v1/users/me/settings').send({ theme: 'dark' });

    db.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status) VALUES ('u2', 'other@example.test', 'Other', 'h', 'viewer', 'active')").run();
    const other = express();
    other.use(express.json());
    other.use((req, _res, next) => { req.user = { userId: 'u2', email: 'other@example.test', role: 'viewer' }; next(); });
    other.use('/api/v1/users', usersRouter);

    const res = await request(other).get('/api/v1/users/me/settings');

    expect(res.body.settings).toEqual({});
  });
});
