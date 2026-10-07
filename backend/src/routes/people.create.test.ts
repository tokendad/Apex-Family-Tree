import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { peopleRouter } = await import('./people.js');

const silentLogger = {
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { userId: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/v1/people', peopleRouter);
  return app;
}

beforeEach(async () => {
  db = new Database(':memory:');
  // Built from the real migrations rather than a hand-written schema, so the
  // test cannot drift from what production actually has — this bug lived in the
  // gap between a repository signature saying `number` and a JSON body sending
  // a boolean.
  const { runMigrations } = await import('../db/migrator.js');
  runMigrations(db, migrationsDir, silentLogger as never);

  // created_by references users, and the route takes it from the session.
  db.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, role)
     VALUES ('user-1', 'test@localhost.test', 'Test', 'x', 'admin')`
  ).run();
});

afterEach(() => {
  db.close();
});

describe('POST /people', () => {
  it('accepts JSON booleans for is_living and is_private', async () => {
    // The person wizard sends real booleans. better-sqlite3 refuses to bind
    // them — "SQLite3 can only bind numbers, strings, bigints, buffers, and
    // null" — so every attempt to add a person failed with a bare 500.
    const res = await request(buildApp())
      .post('/api/v1/people')
      .send({
        given_name: 'Walter',
        surname: 'LeFort',
        display_name: 'Walter LeFort',
        sex: 'M',
        is_living: true,
        is_private: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    const row = db.prepare('SELECT is_living, is_private FROM persons WHERE id = ?').get(res.body.id) as
      { is_living: number; is_private: number };
    expect(row.is_living).toBe(1);
    expect(row.is_private).toBe(0);
  });

  it('still accepts 0/1 integers', async () => {
    const res = await request(buildApp())
      .post('/api/v1/people')
      .send({ display_name: 'Integer Flags', sex: 'F', is_living: 0, is_private: 1 });

    expect(res.status).toBe(201);
    const row = db.prepare('SELECT is_living, is_private FROM persons WHERE id = ?').get(res.body.id) as
      { is_living: number; is_private: number };
    expect(row.is_living).toBe(0);
    expect(row.is_private).toBe(1);
  });

  it('defaults the flags when they are omitted', async () => {
    const res = await request(buildApp())
      .post('/api/v1/people')
      .send({ display_name: 'No Flags', sex: 'U' });

    expect(res.status).toBe(201);
    const row = db.prepare('SELECT is_living, is_private FROM persons WHERE id = ?').get(res.body.id) as
      { is_living: number; is_private: number };
    expect(row.is_living).toBe(1);
    expect(row.is_private).toBe(0);
  });

  it('creates the matching archive object so the person can be connected', async () => {
    const res = await request(buildApp())
      .post('/api/v1/people')
      .send({ display_name: 'Connectable', sex: 'M', is_living: true });

    const obj = db.prepare("SELECT object_type, title FROM archive_objects WHERE id = ?").get(res.body.id) as
      { object_type: string; title: string } | undefined;
    expect(obj).toEqual({ object_type: 'person', title: 'Connectable' });
  });
});
