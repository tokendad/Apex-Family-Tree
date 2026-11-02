import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { claimsRouter } = await import('./claims.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role: 'admin' };
    next();
  });
  app.use('/api/v1/claims', claimsRouter);
  return app;
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY,
      object_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      privacy_level TEXT NOT NULL DEFAULT 'family',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      updated_by TEXT
    );
    CREATE TABLE confidence_levels (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
      numeric_value INTEGER, is_system INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE evidence_classifications (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT,
      default_weight INTEGER, is_system INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE claims (
      id TEXT PRIMARY KEY REFERENCES archive_objects(id) ON DELETE CASCADE,
      statement TEXT NOT NULL, claim_type TEXT,
      subject_object_id TEXT REFERENCES archive_objects(id),
      date_text TEXT, date_start TEXT, date_end TEXT,
      confidence_level_id TEXT REFERENCES confidence_levels(id),
      confidence_score INTEGER, status TEXT NOT NULL DEFAULT 'open',
      notes TEXT, research_section TEXT
    );
    CREATE TABLE claim_subjects (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      subject_object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'subject',
      UNIQUE (claim_id, subject_object_id, role)
    );
    CREATE TABLE claim_evidence (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      evidence_object_id TEXT NOT NULL REFERENCES archive_objects(id) ON DELETE CASCADE,
      evidence_role TEXT NOT NULL DEFAULT 'supports',
      evidence_classification_id TEXT REFERENCES evidence_classifications(id),
      excerpt TEXT, locator TEXT, weight_score INTEGER, confidence_contribution INTEGER, notes TEXT,
      UNIQUE (claim_id, evidence_object_id, evidence_role)
    );
  `);

  db.prepare('INSERT INTO confidence_levels (id, name, numeric_value, is_system, sort_order) VALUES (?, ?, ?, 1, ?)')
    .run('confidence_unknown', 'Unknown', null, 10);
  const object = (id: string, type: string, title: string) =>
    db.prepare('INSERT INTO archive_objects (id, object_type, title) VALUES (?, ?, ?)').run(id, type, title);
  object('person-1', 'person', 'Alfred Marlow');
  object('event-1', 'event', 'Birth of Alfred Marlow');
  object('event-2', 'event', 'Baptism of Alfred Marlow');
});

afterEach(() => db.close());

/* Issue #52. The person page used to guess which event a date claim was about
   by matching years. The claim can now say so, and the API has to carry it. */
describe('claims API — the fact a claim governs', () => {
  it('stores it on create and hands it back on read', async () => {
    const app = buildApp();

    const created = await request(app).post('/api/v1/claims').send({
      statement: 'He was born in 1904, not 1906.',
      subject_object_id: 'person-1',
      claim_type: 'date',
      date_text: '20 July 1904',
      governs_object_id: 'event-1',
    });
    expect(created.status).toBe(201);

    const read = await request(app).get(`/api/v1/claims/${created.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body.governs_object_id).toBe('event-1');
    /* The governed event is where the answer is read, not a subject of the
       claim, so it must not appear in the subject list the page renders. */
    expect(read.body.subjects.map((subject: { subject_object_id: string }) => subject.subject_object_id))
      .toEqual(['person-1']);
  });

  it('moves the link, and an empty string clears it', async () => {
    const app = buildApp();
    const created = await request(app).post('/api/v1/claims').send({
      statement: 'He was born in 1904.',
      subject_object_id: 'person-1',
      claim_type: 'date',
      governs_object_id: 'event-1',
    });
    const id = created.body.id as string;

    expect((await request(app).put(`/api/v1/claims/${id}`).send({ governs_object_id: 'event-2' })).status).toBe(200);
    expect((await request(app).get(`/api/v1/claims/${id}`)).body.governs_object_id).toBe('event-2');

    /* '' is what the drawer sends for "match it by year instead", and it has to
       mean cleared rather than unchanged. */
    expect((await request(app).put(`/api/v1/claims/${id}`).send({ governs_object_id: '' })).status).toBe(200);
    expect((await request(app).get(`/api/v1/claims/${id}`)).body.governs_object_id).toBeNull();
  });

  it('leaves the link alone when the field is absent', async () => {
    const app = buildApp();
    const created = await request(app).post('/api/v1/claims').send({
      statement: 'He was born in 1904.',
      subject_object_id: 'person-1',
      governs_object_id: 'event-1',
    });
    const id = created.body.id as string;

    await request(app).put(`/api/v1/claims/${id}`).send({ statement: 'He was born on 20 July 1904.' });
    expect((await request(app).get(`/api/v1/claims/${id}`)).body.governs_object_id).toBe('event-1');
  });

  it('refuses to govern something that is not an event', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/v1/claims').send({
      statement: 'He was born in 1904.',
      subject_object_id: 'person-1',
      governs_object_id: 'person-1',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/can only govern an event/);
    /* And nothing half-written is left behind. */
    expect(db.prepare('SELECT COUNT(*) AS n FROM claims').get()).toEqual({ n: 0 });
  });
});
