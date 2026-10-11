import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { adminRouter } = await import('./admin.js');
const { normalizeCode } = await import('../repositories/InviteCodeRepository.js');

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function buildApp(role: 'admin' | 'editor' = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'admin-1', email: 'wes@example.test', role };
    next();
  });
  app.use('/api/v1/admin', adminRouter);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE COLLATE NOCASE, display_name TEXT,
      password_hash TEXT, role TEXT, status TEXT, home_person_id TEXT, last_login_at TEXT,
      created_at TEXT, updated_at TEXT);
    CREATE TABLE refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT, expires_at TEXT, created_at TEXT);
    CREATE TABLE invite_tokens (id TEXT PRIMARY KEY, token TEXT, email TEXT, role TEXT,
      invited_by TEXT, message TEXT, expires_at TEXT, used_at TEXT, created_at TEXT);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  for (const file of ['026-audit-log.sql', '064-audit-log-bulk-actions.sql', '065-invite-codes.sql']) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
  }
});

afterEach(() => db.close());

describe('POST /admin/invite-codes', () => {
  it('returns a readable code and stores the normalised form', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/invite-codes').send({ note: "Rachel's cousin" });

    expect(res.status).toBe(201);
    const { code, role, uses_left } = res.body.invite_code;

    // Grouped for reading, from an alphabet with no look-alike characters.
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(role).toBe('editor');  // the default from #39
    expect(uses_left).toBe(1);

    const stored = db.prepare('SELECT code, note FROM invite_codes').get() as { code: string; note: string };
    expect(stored.code).toBe(normalizeCode(code));
    expect(stored.note).toBe("Rachel's cousin");
  });

  it('expires in 24 hours by default', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/invite-codes').send({});

    const expiresAt = new Date(String(res.body.invite_code.expires_at).replace(' ', 'T') + 'Z').getTime();
    const hours = (expiresAt - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThan(25);
  });

  it('accepts a different role, expiry and use count', async () => {
    const res = await request(buildApp())
      .post('/api/v1/admin/invite-codes')
      .send({ role: 'viewer', expires_in_hours: 72, max_uses: 5 });

    expect(res.body.invite_code).toMatchObject({ role: 'viewer', uses_left: 5 });
  });

  it('refuses a role that is not a role', async () => {
    const res = await request(buildApp()).post('/api/v1/admin/invite-codes').send({ role: 'superuser' });
    expect(res.status).toBe(400);
  });

  it('refuses an absurd expiry or use count', async () => {
    const app = buildApp();
    expect((await request(app).post('/api/v1/admin/invite-codes').send({ expires_in_hours: 0 })).status).toBe(400);
    expect((await request(app).post('/api/v1/admin/invite-codes').send({ max_uses: 0 })).status).toBe(400);
    expect((await request(app).post('/api/v1/admin/invite-codes').send({ max_uses: 1.5 })).status).toBe(400);
  });

  it('records the code in the audit log', async () => {
    await request(buildApp()).post('/api/v1/admin/invite-codes').send({ note: 'For Rachel' });

    const rows = db.prepare('SELECT * FROM audit_log').all() as { action: string; entity_type: string; new_values: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'create', entity_type: 'invite_code' });
    expect(JSON.parse(rows[0].new_values)._meta).toMatchObject({ label: 'For Rachel' });
  });
});

describe('GET /admin/invite-codes', () => {
  it('lists only codes that can still be used', async () => {
    const app = buildApp();
    const live = (await request(app).post('/api/v1/admin/invite-codes').send({ note: 'live' })).body.invite_code;
    const expired = (await request(app).post('/api/v1/admin/invite-codes').send({ note: 'expired' })).body.invite_code;
    const spent = (await request(app).post('/api/v1/admin/invite-codes').send({ note: 'spent' })).body.invite_code;

    db.prepare("UPDATE invite_codes SET expires_at = '2020-01-01 00:00:00' WHERE id = ?").run(expired.id);
    db.prepare('UPDATE invite_codes SET use_count = max_uses WHERE id = ?').run(spent.id);

    const res = await request(app).get('/api/v1/admin/invite-codes');

    expect(res.body.invite_codes.map((c: { note: string }) => c.note)).toEqual(['live']);
    // The admin has to be able to read the code back to pass it on again.
    expect(res.body.invite_codes[0].code).toBe(live.code);
  });
});

describe('DELETE /admin/invite-codes/:id', () => {
  it('revokes a code so it disappears from the list', async () => {
    const app = buildApp();
    const created = (await request(app).post('/api/v1/admin/invite-codes').send({})).body.invite_code;

    const res = await request(app).delete(`/api/v1/admin/invite-codes/${created.id}`);

    expect(res.status).toBe(200);
    expect((await request(app).get('/api/v1/admin/invite-codes')).body.invite_codes).toHaveLength(0);
  });

  it('404s for a code that is already revoked', async () => {
    const app = buildApp();
    const created = (await request(app).post('/api/v1/admin/invite-codes').send({})).body.invite_code;
    await request(app).delete(`/api/v1/admin/invite-codes/${created.id}`);

    expect((await request(app).delete(`/api/v1/admin/invite-codes/${created.id}`)).status).toBe(404);
  });

  it('404s for a code that never existed', async () => {
    expect((await request(buildApp()).delete('/api/v1/admin/invite-codes/nope')).status).toBe(404);
  });
});

describe('access', () => {
  it('is refused to an editor', async () => {
    expect((await request(buildApp('editor')).get('/api/v1/admin/invite-codes')).status).toBe(403);
    expect((await request(buildApp('editor')).post('/api/v1/admin/invite-codes').send({})).status).toBe(403);
  });
});
