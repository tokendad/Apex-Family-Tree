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

const sql = (file: string) => fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

const run = (file: string) => {
  // The migrator runs with FK enforcement off; match it, or the hard deletes
  // behave differently here than in production.
  db.pragma('foreign_keys = OFF');
  db.exec(sql(file));
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

const placeCount = () =>
  (db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number }).n;

describe('events.plot', () => {
  /* A plot is not an address -- a grave does not receive mail -- so it lives
     on the burial rather than on the geography. */
  it('stores a plot alongside the place', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'burial',
      event_place: "St. John's Cemetery, Worcester, Massachusetts",
      plot: 'Lot 482 (Shrine of the Holy Family)',
    });

    expect(event.plot).toBe('Lot 482 (Shrine of the Holy Family)');
  });

  /* The plot is a property of the burial, which is what makes a reinterment
     expressible: same cemetery, different plot, two events. */
  it('lets two burials share a cemetery with different plots', () => {
    const events = new EventRepository();
    const first = events.create({
      person_id: personId, event_type: 'burial',
      event_place: "St. John's Cemetery, Worcester, Massachusetts", plot: 'Lot 1',
    });
    const second = events.create({
      person_id: personId, event_type: 'burial',
      event_place: "St. John's Cemetery, Worcester, Massachusetts", plot: 'Lot 2',
    });

    expect(placeCount()).toBe(1);
    expect(placeOf(first.id)?.title).toBe(placeOf(second.id)?.title);
    expect([first.plot, second.plot]).toEqual(['Lot 1', 'Lot 2']);
  });

  it('does not touch the place link when only the plot changes', () => {
    const repo = new EventRepository();
    const event = repo.create({
      person_id: personId, event_type: 'burial',
      event_place: "St. John's Cemetery, Worcester, Massachusetts", plot: 'Lot 1',
    });
    const placeId = named("st. john's cemetery, worcester, massachusetts")!.id;

    const updated = repo.update(event.id, { plot: 'Lot 2' });

    expect(updated?.plot).toBe('Lot 2');
    expect(named("st. john's cemetery, worcester, massachusetts")?.id).toBe(placeId);
    expect(placeCount()).toBe(1);
  });

  it('clears the plot when asked to', () => {
    const repo = new EventRepository();
    const event = repo.create({ person_id: personId, event_type: 'burial', plot: 'Lot 1' });

    expect(repo.update(event.id, { plot: null })?.plot).toBeNull();
  });
});

/* Migration 072 runs in the fixture above, where the three grave rows do not
   exist. The fold is exercised by building what the live archive has and
   re-executing the file. */
describe('migration 072 — moving the grave plots onto their burials', () => {
  const GRAVE = "St. John's Cemetery, Lot 482 (Shrine of the Holy Family), Worcester, Massachusetts";
  const CEMETERY = "St. John's Cemetery, Worcester, Massachusetts";
  const PLOT = 'Lot 482 (Shrine of the Holy Family)';

  let graveEvent: string;
  let cemeteryEvent: string;

  beforeEach(() => {
    const events = new EventRepository();
    graveEvent = events.create({ person_id: personId, event_type: 'burial', event_place: GRAVE }).id;
    cemeteryEvent = events.create({ person_id: personId, event_type: 'burial', event_place: CEMETERY }).id;
  });

  it('removes the place that was really a plot', () => {
    expect(named(GRAVE.toLowerCase())).toBeDefined();

    run('072-events-plot-from-places.sql');

    expect(named(GRAVE.toLowerCase())).toBeUndefined();
    expect(named(CEMETERY.toLowerCase())).toBeDefined();
  });

  it('hands the burial to the cemetery and the plot to the event', () => {
    run('072-events-plot-from-places.sql');

    const row = db.prepare('SELECT event_place, plot FROM events WHERE id = ?').get(graveEvent) as
      { event_place: string; plot: string };
    expect(row).toEqual({ event_place: CEMETERY, plot: PLOT });
    expect(placeOf(graveEvent)?.title).toBe(CEMETERY);
  });

  it('leaves the burial that already named the cemetery alone', () => {
    run('072-events-plot-from-places.sql');

    const row = db.prepare('SELECT event_place, plot FROM events WHERE id = ?').get(cemeteryEvent) as
      { event_place: string; plot: string | null };
    expect(row).toEqual({ event_place: CEMETERY, plot: null });
  });

  /* "Lot 482" must not become another name for the cemetery. It is a different
     kind of fact, not alternate wording -- which is what separates this from
     the "French Canada" fold in 070. */
  it('adds no alias for the plot', () => {
    run('072-events-plot-from-places.sql');

    const aliases = new PlaceRepository().findAliases(named(CEMETERY.toLowerCase())!.id).map(a => a.alias);
    expect(aliases).toContain(CEMETERY);
    expect(aliases.join(' ')).not.toContain('Lot 482');
  });

  it('leaves no orphaned rows behind', () => {
    run('072-events-plot-from-places.sql');

    const orphans = db.prepare(
      `SELECT COUNT(*) AS n FROM relationship_members m
       WHERE NOT EXISTS (SELECT 1 FROM archive_objects ao WHERE ao.id = m.object_id)`,
    ).get() as { n: number };
    expect(orphans.n).toBe(0);
  });

  it('does nothing the second time', () => {
    run('072-events-plot-from-places.sql');
    const snapshot = () => JSON.stringify({
      places: db.prepare('SELECT id, normalized_name FROM places ORDER BY id').all(),
      events: db.prepare('SELECT id, event_place, plot FROM events ORDER BY id').all(),
      members: db.prepare('SELECT relationship_id, object_id, role FROM relationship_members ORDER BY relationship_id, role').all(),
    });
    const after = snapshot();

    run('072-events-plot-from-places.sql');

    expect(snapshot()).toBe(after);
  });

  /* Two burials shared this plot in the live archive. Each gets the string;
     nothing links them, which is right for a locator. */
  it('gives every burial in the same plot the same text', () => {
    const second = new EventRepository().create({
      person_id: personId, event_type: 'burial', event_place: GRAVE,
    }).id;

    run('072-events-plot-from-places.sql');

    const plots = db.prepare('SELECT plot FROM events WHERE id IN (?, ?)').all(graveEvent, second) as { plot: string }[];
    expect(plots.map(p => p.plot)).toEqual([PLOT, PLOT]);
  });

  it('puts the plot back on rollback', () => {
    run('072-events-plot-from-places.sql');

    run('072-events-plot-from-places-down.sql');

    const row = db.prepare('SELECT event_place, plot FROM events WHERE id = ?').get(graveEvent) as
      { event_place: string; plot: string | null };
    expect(row).toEqual({ event_place: GRAVE, plot: null });
    expect(named(GRAVE.toLowerCase())).toBeDefined();
    expect(placeOf(graveEvent)?.title).toBe(GRAVE);
  });
});

describe('migration 072 — when there is nothing to fold', () => {
  it('leaves an archive without the grave rows untouched', () => {
    new EventRepository().create({
      person_id: personId, event_type: 'burial',
      event_place: "St. John's Cemetery, Worcester, Massachusetts",
    });
    const before = db.prepare('SELECT id, event_place, plot FROM events ORDER BY id').all();

    expect(() => run('072-events-plot-from-places.sql')).not.toThrow();

    expect(db.prepare('SELECT id, event_place, plot FROM events ORDER BY id').all()).toEqual(before);
    expect(placeCount()).toBe(1);
  });

  /* The cemetery has to exist for the plot to fold into. Without it the row
     stays rather than being deleted and its burial orphaned. */
  it('keeps the grave row when its cemetery is absent', () => {
    const GRAVE = "St. John's Cemetery, Lot 482 (Shrine of the Holy Family), Worcester, Massachusetts";
    const event = new EventRepository().create({
      person_id: personId, event_type: 'burial', event_place: GRAVE,
    }).id;

    run('072-events-plot-from-places.sql');

    expect(named(GRAVE.toLowerCase())).toBeDefined();
    expect(placeOf(event)?.title).toBe(GRAVE);
    expect((db.prepare('SELECT plot FROM events WHERE id = ?').get(event) as { plot: string | null }).plot).toBeNull();
  });
});
