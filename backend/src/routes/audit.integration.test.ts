import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { familiesRouter } = await import('./families.js');
const { eventsRouter } = await import('./events.js');
const { peopleRouter } = await import('./people.js');
const { adminRouter } = await import('./admin.js');
const { requestContextMiddleware } = await import('../services/requestContext.js');

const ACTOR = { userId: 'user-1', email: 'wes@example.test', role: 'admin' };

/** Mirrors api.ts: auth populates req.user, then the context middleware runs. */
function buildApp(role: 'admin' | 'editor' | 'limited_editor' | 'viewer' = 'admin') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { ...ACTOR, role };
    next();
  });
  app.use(requestContextMiddleware);
  app.use('/api/v1/families', familiesRouter);
  app.use('/api/v1/events', eventsRouter);
  app.use('/api/v1/people', peopleRouter);
  app.use('/api/v1/admin', adminRouter);
  return app;
}

function audit(entityType?: string) {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id').all() as {
    id: number; user_id: string | null; action: string; entity_type: string;
    entity_id: string | null; old_values: string | null; new_values: string | null;
  }[];
  return entityType ? rows.filter((r) => r.entity_type === entityType) : rows;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE persons (id TEXT PRIMARY KEY, sex TEXT, is_living INTEGER, is_private INTEGER,
      gedcom_id TEXT, notes TEXT, display_name TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE names (id TEXT PRIMARY KEY, person_id TEXT, name_type TEXT, prefix TEXT,
      given_name TEXT, middle_name TEXT, surname TEXT, suffix TEXT, nickname TEXT,
      is_primary INTEGER, sort_order INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE families (id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT,
      marriage_date TEXT, marriage_date_qualifier TEXT, marriage_date_sort_key INTEGER,
      marriage_place TEXT, divorce_date TEXT, divorce_place TEXT, gedcom_id TEXT,
      created_at TEXT, updated_at TEXT);
    CREATE TABLE family_members (id TEXT PRIMARY KEY, family_id TEXT, person_id TEXT,
      role TEXT, sort_order INTEGER, created_at TEXT);
    CREATE TABLE events (id TEXT PRIMARY KEY, person_id TEXT, family_id TEXT, event_type TEXT,
      event_date TEXT, event_date_qualifier TEXT, event_date_sort_key INTEGER,
      event_place TEXT, description TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT,
      entity_type TEXT, entity_id TEXT, old_values TEXT, new_values TEXT,
      ip_address TEXT, created_at TEXT);
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, display_name TEXT,
      password_hash TEXT, role TEXT, status TEXT, home_person_id TEXT,
      last_login_at TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE refresh_tokens (id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT,
      expires_at TEXT, created_at TEXT);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE archive_objects (id TEXT PRIMARY KEY, object_type TEXT, title TEXT,
      summary TEXT, privacy_level TEXT, is_deleted INTEGER DEFAULT 0,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT);
    CREATE TABLE invite_tokens (id TEXT PRIMARY KEY, email TEXT, role TEXT, token_hash TEXT,
      expires_at TEXT, used_at TEXT, created_by TEXT, created_at TEXT);
  `);

  db.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at) VALUES ('user-1','wes@example.test','Wes','hash','admin','active','2026-01-01','2026-01-01')").run();
  db.prepare("INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at) VALUES ('p1','F',0,0,'Eunice Louise Lagor','2026-01-01','2026-01-01')").run();
  db.prepare("INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at) VALUES ('n1','p1','birth','Eunice','Lagor',1,0,'2026-01-01','2026-01-01')").run();
  db.prepare("INSERT INTO events (id, person_id, event_type, event_date, event_place, created_at, updated_at) VALUES ('ev1','p1','birth','12 OCT 1926','Leominster','2026-01-01','2026-01-01')").run();
  db.prepare("INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_place, created_at, updated_at) VALUES ('f1','p1',NULL,'14 MAR 1983','Culver City','2026-01-01','2026-01-01')").run();
});

afterEach(() => db.close());

describe('audit: what changed, who changed it, what the change was', () => {
  it('records an event edit as one entry naming the actor and the field', async () => {
    const res = await request(buildApp())
      .put('/api/v1/events/ev1')
      .send({ event_place: 'Las Vegas, Clark, Nevada' });

    expect(res.status).toBe(200);

    const rows = audit();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: 'user-1', action: 'update', entity_type: 'event', entity_id: 'ev1' });
    expect(JSON.parse(rows[0].old_values!)).toEqual({ event_place: 'Leominster' });
    expect(JSON.parse(rows[0].new_values!)).toEqual({ event_place: 'Las Vegas, Clark, Nevada' });
  });

  /* The sync-suppression decision, pinned. A family edit regenerates its
     marriage and divorce events; the log must show the one edit the person
     made, not the rows it rippled into. */
  it('records a family edit once, not once per regenerated event', async () => {
    const res = await request(buildApp())
      .put('/api/v1/families/f1')
      .send({ marriage_place: 'Las Vegas, Clark, Nevada' });

    expect(res.status).toBe(200);

    expect(audit('family')).toHaveLength(1);
    expect(audit('event')).toHaveLength(0);
    expect(JSON.parse(audit('family')[0].new_values!)).toMatchObject({ marriage_place: 'Las Vegas, Clark, Nevada' });
  });

  /* An id is useless once the row it points at is gone. */
  it('keeps the person name in a delete entry, after the row no longer exists', async () => {
    const res = await request(buildApp()).delete('/api/v1/people/p1');
    expect(res.status).toBe(204);

    const rows = audit('person');
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('delete');
    expect(JSON.parse(rows[0].new_values!)).toMatchObject({ label: 'Eunice Louise Lagor' });
  });

  it('records a role change, with the old and new role', async () => {
    db.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at) VALUES ('user-2','rachel@example.test','Rachel','hash','viewer','active','2026-01-01','2026-01-01')").run();

    const res = await request(buildApp()).put('/api/v1/admin/users/user-2').send({ role: 'editor' });
    expect(res.status).toBe(200);

    const rows = audit('user');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].old_values!)).toMatchObject({ role: 'viewer' });
    expect(JSON.parse(rows[0].new_values!)).toMatchObject({ role: 'editor' });
  });

  it('never carries a password hash into the log', async () => {
    db.prepare("INSERT INTO users (id, email, display_name, password_hash, role, status, created_at, updated_at) VALUES ('user-3','x@example.test','X','$argon2id$v=19$secret','viewer','active','2026-01-01','2026-01-01')").run();

    await request(buildApp()).delete('/api/v1/admin/users/user-3');

    const rows = audit('user');
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain('argon2');
  });

  /* An audit failure must never roll back the edit it was describing. */
  it('still applies the edit when the audit write fails', async () => {
    db.exec("CREATE TRIGGER block_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'disk full'); END;");

    const res = await request(buildApp())
      .put('/api/v1/events/ev1')
      .send({ event_place: 'Las Vegas, Clark, Nevada' });

    expect(res.status).toBe(200);
    const event = db.prepare("SELECT event_place FROM events WHERE id = 'ev1'").get() as { event_place: string };
    expect(event.event_place).toBe('Las Vegas, Clark, Nevada');
  });
});

describe('GET /admin/audit', () => {
  it('returns the newest entries with the actor named', async () => {
    await request(buildApp()).put('/api/v1/events/ev1').send({ event_place: 'Las Vegas' });

    const res = await request(buildApp()).get('/api/v1/admin/audit');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ entity_type: 'event', user_email: 'wes@example.test' });
  });

  it('defaults to 20 entries and offers a cursor for the rest', async () => {
    for (let i = 0; i < 25; i++) {
      db.prepare(
        "INSERT INTO audit_log (user_id, action, entity_type, entity_id, created_at) VALUES ('user-1','update','event',?,'2026-01-01')",
      ).run(`e${i}`);
    }

    const res = await request(buildApp()).get('/api/v1/admin/audit');

    expect(res.body.data).toHaveLength(20);
    expect(res.body.next_cursor).not.toBeNull();
  });

  it('searches recorded values', async () => {
    await request(buildApp()).put('/api/v1/events/ev1').send({ event_place: 'Las Vegas' });

    const hit = await request(buildApp()).get('/api/v1/admin/audit?q=Leominster');
    const miss = await request(buildApp()).get('/api/v1/admin/audit?q=Nowhere');

    expect(hit.body.data).toHaveLength(1);
    expect(miss.body.data).toHaveLength(0);
  });

  it('is refused to an editor', async () => {
    const res = await request(buildApp('editor')).get('/api/v1/admin/audit');
    expect(res.status).toBe(403);
  });
});
