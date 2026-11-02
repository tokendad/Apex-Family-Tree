import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});
vi.mock('../middleware/auth.js', () => ({
  requireRole: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user?: unknown }).user = { userId: 'user-1', email: 'test@example.com', role: 'admin' };
    next();
  },
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

const { registerCustomFunctions } = await import('../db/connection.js');
const { runMigrations } = await import('../db/migrator.js');
const { placesRouter } = await import('./places.js');
const { PlaceRepository } = await import('../repositories/PlaceRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let app: express.Express;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
  app = express();
  app.use(express.json());
  app.use('/places', placesRouter);

  const repo = new PlaceRepository();
  const state = repo.create({ title: 'Massachusetts, United States', region: 'Massachusetts', country: 'United States' }).id;
  repo.create({ title: 'Worcester, Massachusetts', locality: 'Worcester', region: 'Massachusetts', parent_place_id: state });
});

afterEach(() => db.close());

describe('GET /places/suggest', () => {
  /* Issue #35. The route is declared before /:id; registered after it,
     "suggest" is read as a place id and the typeahead 404s. */
  it('is not swallowed by the place-by-id route', async () => {
    const res = await request(app).get('/places/suggest?q=worce');

    expect(res.status).toBe(200);
    expect(res.body.data.map((row: { title: string }) => row.title)).toEqual(['Worcester, Massachusetts']);
  });

  it('carries the enclosing place so two places of the same name can be told apart', async () => {
    const res = await request(app).get('/places/suggest?q=worcester');

    expect(res.body.data[0].parent_title).toBe('Massachusetts, United States');
  });

  it('answers an empty term with an empty list', async () => {
    const res = await request(app).get('/places/suggest');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('caps the limit', async () => {
    const res = await request(app).get('/places/suggest?q=massachusetts&limit=999');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(25);
  });
});
