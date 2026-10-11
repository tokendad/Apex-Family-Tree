import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { authRouter } = await import('./auth.js');
const { InviteCodeRepository, formatCode } = await import('../repositories/InviteCodeRepository.js');
const { hashToken } = await import('../services/auth.js');

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

/* The limiter is module-scoped, so a fresh app does not give a fresh bucket.
   Each test calls from its own address instead, which also exercises the
   cf-connecting-ip path the deployment actually uses -- everything arrives
   through the tunnel, so req.ip alone would put every visitor in one bucket. */
let addressCounter = 0;
function signup(app: express.Express, body: Record<string, unknown>, from?: string) {
  const address = from ?? `203.0.113.${(addressCounter += 1) % 250}`;
  return request(app).post('/api/auth/register').set('cf-connecting-ip', address).send(body);
}

function activeCode(overrides: Partial<{ role: string; maxUses: number; expiresInHours: number }> = {}) {
  return new InviteCodeRepository().create({
    role: (overrides.role ?? 'editor') as 'editor',
    maxUses: overrides.maxUses ?? 1,
    expiresInHours: overrides.expiresInHours ?? 24,
    createdBy: 'admin-1',
  });
}

const SIGNUP = { email: 'rachel@example.test', display_name: 'Rachel', password: 'goodpass1' };

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE COLLATE NOCASE, display_name TEXT,
      password_hash TEXT, role TEXT, status TEXT DEFAULT 'active', home_person_id TEXT,
      last_login_at TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT,
      expires_at TEXT, created_at TEXT);
    CREATE TABLE invite_tokens (id TEXT PRIMARY KEY, token TEXT UNIQUE, email TEXT, role TEXT,
      invited_by TEXT, message TEXT, expires_at TEXT, used_at TEXT, created_at TEXT);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  // The real invite_codes and audit_log schemas, not a looser stand-in.
  for (const file of ['026-audit-log.sql', '064-audit-log-bulk-actions.sql', '065-invite-codes.sql']) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
  }
});

afterEach(() => db.close());

function users() {
  return db.prepare('SELECT * FROM users').all() as { id: string; email: string; role: string; status: string }[];
}

describe('POST /auth/register with an invite code', () => {
  it('creates the account with the role the code carries, and signs them in', async () => {
    const code = activeCode({ role: 'editor' });

    const res = await signup(buildApp(), { ...SIGNUP, code: code.code });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: SIGNUP.email, role: 'editor' });
    expect(res.body.user.password_hash).toBeUndefined();

    const [user] = users();
    expect(user.status).toBe('active');

    // Signed in, not left at the login screen.
    const cookies = String(res.headers['set-cookie']);
    expect(cookies).toContain('access_token');
    expect(cookies).toContain('refresh_token');
  });

  /* The code is read off a screen and typed on a phone. */
  it('accepts the code however it was typed', async () => {
    const code = activeCode();

    const res = await signup(buildApp(), { ...SIGNUP, code: `  ${formatCode(code.code).toLowerCase()}  ` });

    expect(res.status).toBe(201);
  });

  it('spends the code, so it cannot be used twice', async () => {
    const code = activeCode({ maxUses: 1 });

    const first = await signup(buildApp(), { ...SIGNUP, code: code.code });
    expect(first.status).toBe(201);

    const second = await signup(buildApp(), { ...SIGNUP, email: 'someone@example.test', code: code.code });

    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already been used/i);
    expect(users()).toHaveLength(1);
  });

  it('honours a code issued for more than one person', async () => {
    const code = activeCode({ maxUses: 2 });
    const app = buildApp();

    await signup(app, { ...SIGNUP, code: code.code });
    const second = await signup(app, { ...SIGNUP, email: 'two@example.test', code: code.code });

    expect(second.status).toBe(201);
    expect(users()).toHaveLength(2);
  });

  it('refuses an expired code', async () => {
    const code = activeCode();
    db.prepare("UPDATE invite_codes SET expires_at = '2020-01-01 00:00:00' WHERE id = ?").run(code.id);

    const res = await signup(buildApp(), { ...SIGNUP, code: code.code });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
    expect(users()).toHaveLength(0);
  });

  it('refuses a revoked code', async () => {
    const code = activeCode();
    new InviteCodeRepository().revoke(code.id);

    const res = await signup(buildApp(), { ...SIGNUP, code: code.code });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/revoked/i);
  });

  it('refuses an unknown code', async () => {
    const res = await signup(buildApp(), { ...SIGNUP, code: 'AAAA-BBBB' });

    expect(res.status).toBe(400);
    expect(users()).toHaveLength(0);
  });

  it('refuses a sign-up with no code at all', async () => {
    const res = await signup(buildApp(), SIGNUP);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invite code is required/i);
  });

  it('applies the password rules', async () => {
    const code = activeCode();

    const noDigit = await signup(buildApp(), { ...SIGNUP, password: 'abcdefgh', code: code.code });

    expect(noDigit.status).toBe(400);
    expect(noDigit.body.error).toMatch(/number/i);
    // A rejected sign-up must not burn the invitation.
    expect(new InviteCodeRepository().findById(code.id)!.use_count).toBe(0);
  });

  it('refuses an email that already has an account', async () => {
    db.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status) VALUES ('u1', ?, 'X', 'h', 'viewer', 'active')")
      .run(SIGNUP.email);
    const code = activeCode();

    const res = await signup(buildApp(), { ...SIGNUP, code: code.code });

    expect(res.status).toBe(409);
    expect(new InviteCodeRepository().findById(code.id)!.use_count).toBe(0);
  });

  /* Spending the invitation and creating the account are one write. If they
     were not, a failure between them would either consume a code without
     producing an account, or leave a single-use code spendable twice. */
  it('does not spend the code when the account cannot be created', async () => {
    const code = activeCode();
    db.exec("CREATE TRIGGER block_users BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'nope'); END;");

    const res = await signup(buildApp(), { ...SIGNUP, code: code.code });

    expect(res.status).toBe(500);
    expect(users()).toHaveLength(0);
    expect(new InviteCodeRepository().findById(code.id)!.use_count).toBe(0);
  });

  it('records the new account in the audit log', async () => {
    const code = activeCode();

    await signup(buildApp(), { ...SIGNUP, code: code.code });

    const rows = db.prepare('SELECT * FROM audit_log').all() as { action: string; entity_type: string; new_values: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'create', entity_type: 'user' });
    expect(JSON.parse(rows[0].new_values)._meta).toMatchObject({ label: SIGNUP.email, via: 'invite_code' });
  });
});

/* The emailed-invitation path was broken outright: RegisterPage has always
   posted to this endpoint and the endpoint did not exist. */
describe('POST /auth/register with an emailed invitation', () => {
  function seedInvite(email: string, role = 'editor', overrides: { used?: boolean; expired?: boolean } = {}) {
    const raw = 'raw-invitation-token';
    const expires = overrides.expired ? '2020-01-01 00:00:00' : '2099-01-01 00:00:00';
    db.prepare(
      "INSERT INTO invite_tokens (id, token, email, role, invited_by, expires_at, used_at, created_at) VALUES ('i1', ?, ?, ?, 'admin-1', ?, ?, '2026-01-01')",
    ).run(hashToken(raw), email, role, expires, overrides.used ? '2026-01-01' : null);
    return raw;
  }

  it('creates the account from the emailed token', async () => {
    const token = seedInvite(SIGNUP.email, 'limited_editor');

    const res = await signup(buildApp(), { ...SIGNUP, token });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('limited_editor');
    expect(db.prepare('SELECT used_at FROM invite_tokens WHERE id = ?').get('i1')).not.toEqual({ used_at: null });
  });

  /* An invitation names an address; it is not a transferable pass. */
  it('refuses to let an invitation be used by a different address', async () => {
    const token = seedInvite('someone.else@example.test');

    const res = await signup(buildApp(), { ...SIGNUP, token });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/different email/i);
    expect(users()).toHaveLength(0);
  });

  it('refuses an already-used invitation', async () => {
    const token = seedInvite(SIGNUP.email, 'editor', { used: true });

    const res = await signup(buildApp(), { ...SIGNUP, token });

    expect(res.status).toBe(400);
  });

  it('refuses an expired invitation', async () => {
    const token = seedInvite(SIGNUP.email, 'editor', { expired: true });

    const res = await signup(buildApp(), { ...SIGNUP, token });

    expect(res.status).toBe(400);
  });
});

/* The real users.email is UNIQUE COLLATE NOCASE, so these are one account. */
describe('email casing', () => {
  it('treats a differently-cased email as the same account', async () => {
    db.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status) VALUES ('u1', 'Rachel@Example.test', 'X', 'h', 'viewer', 'active')").run();
    const code = activeCode();

    const res = await signup(buildApp(), { ...SIGNUP, email: 'rachel@example.test', code: code.code });

    expect(res.status).toBe(409);
  });
});

/* The login handler gained a rate limiter argument; make sure the handler is
   still wired to the route and did not get re-parented by the edit. */
describe('login still works alongside the new limiter', () => {
  it('rejects bad credentials with 401, not 404', async () => {
    const res = await request(buildApp())
      .post('/api/auth/login')
      .set('cf-connecting-ip', '198.51.100.90')
      .send({ email: 'nobody@example.test', password: 'whatever1' });

    expect(res.status).toBe(401);
  });

  it('signs in an account created through registration', async () => {
    const code = activeCode();
    await signup(buildApp(), { ...SIGNUP, code: code.code });

    const res = await request(buildApp())
      .post('/api/auth/login')
      .set('cf-connecting-ip', '198.51.100.91')
      .send({ email: SIGNUP.email, password: SIGNUP.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(SIGNUP.email);
  });
});

describe('sign-up rate limiting', () => {
  /* Guessing codes is the attack on self-registration. */
  it('stops a run of attempts from one address', async () => {
    const app = buildApp();

    const from = '198.51.100.21';
    for (let i = 0; i < 5; i++) {
      const res = await signup(app, { ...SIGNUP, code: 'ZZZZ-ZZZZ' }, from);
      expect(res.status).toBe(400);
    }

    const blocked = await signup(app, { ...SIGNUP, code: 'ZZZZ-ZZZZ' }, from);

    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('counts a successful sign-up against the limit too', async () => {
    const app = buildApp();
    const code = activeCode({ maxUses: 10 });

    const from = '198.51.100.22';
    for (let i = 0; i < 5; i++) {
      await signup(app, { ...SIGNUP, email: `u${i}@example.test`, code: code.code }, from);
    }

    const blocked = await signup(app, { ...SIGNUP, email: 'u9@example.test', code: code.code }, from);

    expect(blocked.status).toBe(429);
  });
});
