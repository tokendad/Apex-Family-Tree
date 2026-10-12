import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../db/connection.js');
const { runMigrations } = await import('../db/migrator.js');
const { EventRepository } = await import('./EventRepository.js');
const { PersonRepository } = await import('./PersonRepository.js');
const { PlaceRepository } = await import('./PlaceRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let personId: string;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
  personId = new PersonRepository().create({ display_name: 'Test Subject' }).id;
});

afterEach(() => db.close());

describe('PlaceRepository — county and postal code', () => {
  /* Issue #35: three of the 72 places ended their name with a ZIP and one
     named a county, and places had nowhere to put either. */
  it('stores and returns both components', () => {
    const repo = new PlaceRepository();
    const place = repo.create({
      title: '714 Main St., Worcester, Massachusetts',
      locality: 'Worcester',
      county: 'Worcester',
      region: 'Massachusetts',
      country: 'United States',
      postal_code: '01610',
    });

    expect(repo.findById(place.id)).toMatchObject({
      county: 'Worcester',
      postal_code: '01610',
    });
  });

  /* A string column, not an integer one. "01610" as a number is 1610, which is
     a different ZIP in a different state. */
  it('keeps a leading zero', () => {
    const repo = new PlaceRepository();
    const place = repo.create({ title: 'Vernon, Vermont', postal_code: '05354' });

    expect(repo.findById(place.id)?.postal_code).toBe('05354');
  });

  it('updates each component on its own without clearing the other', () => {
    const repo = new PlaceRepository();
    const place = repo.create({ title: 'Vernon, Vermont', county: 'Windham', postal_code: '05354' });

    repo.update(place.id, { postal_code: '05354-1234' });

    expect(repo.findById(place.id)).toMatchObject({
      county: 'Windham',
      postal_code: '05354-1234',
    });
  });

  it('clears a component when asked to', () => {
    const repo = new PlaceRepository();
    const place = repo.create({ title: 'Vernon, Vermont', county: 'Windham' });

    repo.update(place.id, { county: null });

    expect(repo.findById(place.id)?.county).toBeNull();
  });

  it('finds a place by its postal code and by its county', () => {
    const repo = new PlaceRepository();
    repo.create({ title: 'Vernon, Vermont', county: 'Windham', postal_code: '05354' });
    repo.create({ title: 'Worcester, Massachusetts' });

    expect(repo.findAll({ search: '05354' }).data.map(p => p.title)).toEqual(['Vernon, Vermont']);
    expect(repo.findAll({ search: 'Windham' }).data.map(p => p.title)).toEqual(['Vernon, Vermont']);
  });
});

/* Migration 070 runs as part of the fixture above, where it finds nothing to
   do -- a fresh database has no "French Canada". So the fold is exercised by
   building the two rows the live archive has and re-executing the file, which
   is what the 068 fallback test does. */
const foldSql = fs.readFileSync(
  path.join(migrationsDir, '070-places-french-canada-fold.sql'),
  'utf-8',
);

const runFold = () => {
  // The migrator turns FK enforcement off for a migration run; match it, or
  // the hard deletes behave differently here than in production.
  db.pragma('foreign_keys = OFF');
  db.exec(foldSql);
  db.pragma('foreign_keys = ON');
};

const placeOf = (eventId: string) =>
  db.prepare(
    `SELECT ao.title AS title
     FROM relationship_members m
     INNER JOIN archive_objects ao ON ao.id = m.object_id
     WHERE m.relationship_id = ? AND m.role = 'place'`,
  ).get(`rel_event_place_${eventId}`) as { title: string } | undefined;

const named = (name: string) =>
  db.prepare('SELECT id FROM places WHERE normalized_name = ?').get(name) as { id: string } | undefined;

describe('migration 070 — folding "French Canada" into Canada', () => {
  let frenchEvent: string;
  let canadaEvent: string;

  beforeEach(() => {
    const events = new EventRepository();
    frenchEvent = events.create({ person_id: personId, event_type: 'birth', event_place: 'French Canada' }).id;
    canadaEvent = events.create({ person_id: personId, event_type: 'death', event_place: 'Canada' }).id;
  });

  it('removes the place', () => {
    runFold();

    expect(named('french canada')).toBeUndefined();
    expect(named('canada')).toBeDefined();
  });

  it('keeps the wording as an alias on Canada', () => {
    const canadaId = named('canada')!.id;
    runFold();

    const aliases = new PlaceRepository().findAliases(canadaId).map(a => a.alias);
    expect(aliases).toContain('French Canada');
    expect(aliases).toContain('Canada');
  });

  it('hands the event to Canada', () => {
    runFold();

    expect(placeOf(frenchEvent)?.title).toBe('Canada');
    expect(placeOf(canadaEvent)?.title).toBe('Canada');
  });

  /* The source said "French Canada" and the event goes on saying so. Only the
     place behind it changes, which is the whole argument for an alias over a
     rename. */
  it('leaves the event text alone', () => {
    runFold();

    const row = db.prepare('SELECT event_place FROM events WHERE id = ?').get(frenchEvent) as { event_place: string };
    expect(row.event_place).toBe('French Canada');
  });

  /* The point of the alias: a later event typed with the old wording must land
     on Canada rather than recreating the row the fold just removed. */
  it('resolves the old wording to Canada afterwards', () => {
    runFold();
    const before = (db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number }).n;

    const resolved = new PlaceRepository().resolveOrCreate('French Canada');

    expect(resolved?.title).toBe('Canada');
    expect((db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number }).n).toBe(before);
  });

  it('leaves no orphaned rows behind', () => {
    runFold();

    const orphans = db.prepare(
      `SELECT COUNT(*) AS n FROM relationship_members m
       WHERE NOT EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = m.object_id)`,
    ).get() as { n: number };
    const strayAliases = db.prepare(
      `SELECT COUNT(*) AS n FROM place_aliases pa
       WHERE NOT EXISTS (SELECT 1 FROM places p WHERE p.id = pa.place_id)`,
    ).get() as { n: number };

    expect(orphans.n).toBe(0);
    expect(strayAliases.n).toBe(0);
  });

  it('does nothing the second time', () => {
    runFold();
    const snapshot = () => JSON.stringify({
      places: db.prepare('SELECT id, normalized_name FROM places ORDER BY id').all(),
      aliases: db.prepare('SELECT place_id, alias FROM place_aliases ORDER BY place_id, alias').all(),
      members: db.prepare('SELECT relationship_id, object_id, role FROM relationship_members ORDER BY relationship_id, role').all(),
    });
    const after = snapshot();

    runFold();

    expect(snapshot()).toBe(after);
  });
});

describe('migration 070 — when there is nothing to fold', () => {
  /* The normal case on a fresh install, and the reason every statement is
     written against normalized_name rather than against the positional
     place_backfill_000000NN ids 068 generated. */
  it('leaves an archive without the row untouched', () => {
    new EventRepository().create({ person_id: personId, event_type: 'birth', event_place: 'Canada' });
    const before = db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number };

    expect(() => runFold()).not.toThrow();

    expect(db.prepare('SELECT COUNT(*) AS n FROM places').get()).toEqual(before);
    expect(named('canada')).toBeDefined();
  });

  it('does not invent a Canada to fold into', () => {
    new EventRepository().create({ person_id: personId, event_type: 'birth', event_place: 'French Canada' });

    runFold();

    // Nothing to merge with, so the row stays rather than being deleted.
    expect(named('french canada')).toBeDefined();
    expect(named('canada')).toBeUndefined();
  });
});

/* Nothing in the app runs a -down file, so without this they are only ever
   read by a human under pressure. */
describe('the rollbacks', () => {
  const down = (file: string) => {
    db.pragma('foreign_keys = OFF');
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
    db.pragma('foreign_keys = ON');
  };

  it('puts "French Canada" back, with its event', () => {
    const events = new EventRepository();
    const frenchEvent = events.create({ person_id: personId, event_type: 'birth', event_place: 'French Canada' }).id;
    events.create({ person_id: personId, event_type: 'death', event_place: 'Canada' });
    runFold();

    down('070-places-french-canada-fold-down.sql');

    expect(named('french canada')).toBeDefined();
    expect(placeOf(frenchEvent)?.title).toBe('French Canada');
    expect(new PlaceRepository().findAliases(named('canada')!.id).map(a => a.alias))
      .not.toContain('French Canada');
  });

  it('drops the two columns', () => {
    down('069-places-postal-code-and-county-down.sql');

    const columns = (db.prepare('PRAGMA table_info(places)').all() as { name: string }[]).map(c => c.name);
    expect(columns).not.toContain('postal_code');
    expect(columns).not.toContain('county');
    expect(columns).toContain('locality');
  });
});
