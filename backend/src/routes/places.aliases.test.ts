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
});

afterEach(() => db.close());

const worcester = () =>
  new PlaceRepository().create({
    title: 'Worcester, Massachusetts',
    aliases: ['Worcester, Worcester, Massachusetts', 'Worcester, MA'],
  });

const aliasesOf = (id: string) =>
  new PlaceRepository().findAliases(id).map(alias => alias.alias);

/* The backfill folded four spellings of Worcester into one place, and those
   aliases are the only thing stopping the duplicates coming back. A rename
   must not be able to drop them by accident. */
describe('PUT /places/:id — the spellings a place was merged from', () => {
  it('keeps them when the request says nothing about aliases', async () => {
    const place = worcester();

    await request(app).put(`/places/${place.id}`).send({ title: 'Worcester, Mass.' }).expect(200);

    expect(aliasesOf(place.id)).toContain('Worcester, MA');
    expect(aliasesOf(place.id)).toContain('Worcester, Mass.');
  });

  it('keeps them when the request sends aliases as null', async () => {
    const place = worcester();

    await request(app)
      .put(`/places/${place.id}`)
      .send({ title: 'Worcester, Mass.', aliases: null })
      .expect(200);

    expect(aliasesOf(place.id)).toContain('Worcester, MA');
  });

  /* An explicit empty list is still a decision the caller is allowed to make. */
  it('clears them when the request sends an empty list', async () => {
    const place = worcester();

    await request(app)
      .put(`/places/${place.id}`)
      .send({ title: 'Worcester, Massachusetts', aliases: [] })
      .expect(200);

    expect(aliasesOf(place.id)).toEqual(['Worcester, Massachusetts']);
  });
});
