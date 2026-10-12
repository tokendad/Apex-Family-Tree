import Database from 'better-sqlite3';
import express from 'express';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../db/connection.js');
const { runMigrations } = await import('../db/migrator.js');
const { eventsRouter } = await import('./events.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'admin' };
    next();
  });
  app.use('/api/v1/events', eventsRouter);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.prepare(
    "INSERT INTO persons (id, sex, is_living, is_private, created_at, updated_at) VALUES ('p-1', 'F', 0, 0, datetime('now'), datetime('now'))",
  ).run();
});

afterEach(() => db.close());

const OBIT = 'https://www.valadefuneralhome.com/obituaries/Jane-Conti?obId=27457330';

const createEvent = (body: Record<string, unknown> = {}) =>
  request(buildApp())
    .post('/api/v1/events')
    .send({ person_id: 'p-1', event_type: 'death', ...body });

describe('events — an event records where it was read (#41)', () => {
  it('stores a source URL and its last-checked date', async () => {
    const res = await createEvent({ source_url: OBIT, source_url_checked_at: '2026-10-11' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      source_url: OBIT,
      source_url_checked_at: '2026-10-11',
    });
  });

  // What every form actually sends when its URL box is empty: an explicit
  // null, not an absent key. validate() runs before the route's own cleaning,
  // so a null reaching a typed rule must not be treated as a wrong type.
  it('accepts an explicit null, which is what an empty form field sends', async () => {
    const res = await createEvent({ source_url: null, source_url_checked_at: null });

    expect(res.status).toBe(201);
    expect(res.body.source_url).toBeNull();
  });

  it('accepts an event with no source at all, as before', async () => {
    const res = await createEvent({ event_date: '7 AUG 2018' });

    expect(res.status).toBe(201);
    expect(res.body.source_url).toBeNull();
    expect(res.body.source_url_checked_at).toBeNull();
  });

  it('updates the checked date without disturbing the URL', async () => {
    const created = await createEvent({ source_url: OBIT, source_url_checked_at: '2025-01-01' });

    const res = await request(buildApp())
      .put(`/api/v1/events/${created.body.id}`)
      .send({ source_url_checked_at: '2026-10-11' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      source_url: OBIT,
      source_url_checked_at: '2026-10-11',
    });
  });

  it('clears the URL when it is sent empty', async () => {
    const created = await createEvent({ source_url: OBIT });

    const res = await request(buildApp())
      .put(`/api/v1/events/${created.body.id}`)
      .send({ source_url: '' });

    expect(res.status).toBe(200);
    expect(res.body.source_url).toBeNull();
  });

  // The value is rendered as an href, so a scheme that executes must never be
  // storable -- it would run in the next viewer's session.
  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['file:///etc/passwd'],
  ])('refuses the scheme in %s', async (url) => {
    const res = await createEvent({ source_url: url });

    expect(res.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) c FROM events').get()).toEqual({ c: 0 });
  });

  it('refuses something that is not a URL rather than silently blanking it', async () => {
    const res = await createEvent({ source_url: 'valadefuneralhome.com/obituaries' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/http or https/);
  });

  it('refuses a URL past the column limit', async () => {
    const res = await createEvent({ source_url: `https://example.com/${'a'.repeat(2049)}` });

    expect(res.status).toBe(400);
  });

  it('refuses a last-checked date that is not a plain calendar date', async () => {
    const res = await createEvent({ source_url: OBIT, source_url_checked_at: 'ABT 2026' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/YYYY-MM-DD/);
  });
});
