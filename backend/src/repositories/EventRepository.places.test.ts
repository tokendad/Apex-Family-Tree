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

const birth = (place: string | null) =>
  new EventRepository().create({ person_id: personId, event_type: 'birth', event_place: place });

/** The place an event's "occurred at" edge points at, read the way a map or a
    place page would read it rather than from the event's own text. */
const linkedPlace = (eventId: string) =>
  db.prepare(
    `SELECT ao.title AS title, p.id AS id
     FROM relationship_members m
     INNER JOIN places p ON p.id = m.object_id
     INNER JOIN archive_objects ao ON ao.id = p.id
     WHERE m.relationship_id = ? AND m.role = 'place'`,
  ).get(`rel_event_place_${eventId}`) as { title: string; id: string } | undefined;

const placeCount = () =>
  (db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number }).n;

describe('EventRepository — the place behind an event', () => {
  /* Issue #34: 182 events carried a location and the places table held nothing,
     because only a migration had ever written to it. */
  it('creates the place an event names', () => {
    const event = birth('Leominster, Massachusetts');

    expect(placeCount()).toBe(1);
    expect(linkedPlace(event.id)?.title).toBe('Leominster, Massachusetts');
  });

  it('reuses the place when a second event names it again', () => {
    const first = birth('Leominster, Massachusetts');
    const second = birth('Leominster, Massachusetts');

    expect(placeCount()).toBe(1);
    expect(linkedPlace(first.id)?.id).toBe(linkedPlace(second.id)?.id);
  });

  it('matches regardless of case and spacing', () => {
    birth('Leominster, Massachusetts');
    const loose = birth('  leominster,   MASSACHUSETTS  ');

    expect(placeCount()).toBe(1);
    expect(linkedPlace(loose.id)?.title).toBe('Leominster, Massachusetts');
  });

  /* The reason the backfill keeps every folded spelling as an alias. Without
     this, the next event typed the old way recreates the duplicate. */
  it('resolves a spelling that is only recorded as an alias', () => {
    const places = new PlaceRepository();
    const worcester = places.create({
      title: 'Worcester, Massachusetts',
      aliases: ['Worcester, Worcester, Massachusetts', 'Worcester, MA'],
    });

    const event = birth('Worcester, Worcester, Massachusetts');

    expect(placeCount()).toBe(1);
    expect(linkedPlace(event.id)?.id).toBe(worcester.id);
  });

  it('gives an unfamiliar spelling its own place rather than guessing', () => {
    birth('Worcester, Massachusetts');
    birth('Oxford, Massachusetts');

    expect(placeCount()).toBe(2);
  });

  it('links nothing for an event with no place', () => {
    const event = birth(null);

    expect(placeCount()).toBe(0);
    expect(linkedPlace(event.id)).toBeUndefined();
  });

  describe('when the place is edited', () => {
    it('re-points the edge and leaves the old place alone', () => {
      const event = birth('Leominster, Massachusetts');
      const original = linkedPlace(event.id)!.id;

      new EventRepository().update(event.id, { event_place: 'Oxford, Massachusetts' });

      expect(linkedPlace(event.id)?.title).toBe('Oxford, Massachusetts');
      // One edge, not two: the event is in one place at a time.
      expect(
        (db.prepare(
          "SELECT COUNT(*) AS n FROM relationship_members WHERE relationship_id = ? AND role = 'place'",
        ).get(`rel_event_place_${event.id}`) as { n: number }).n,
      ).toBe(1);
      // The place itself survives -- another event may still point at it.
      expect(db.prepare('SELECT id FROM places WHERE id = ?').get(original)).toBeTruthy();
    });

    it('drops the edge when the place is cleared', () => {
      const event = birth('Leominster, Massachusetts');

      new EventRepository().update(event.id, { event_place: null });

      expect(linkedPlace(event.id)).toBeUndefined();
      expect(placeCount()).toBe(1);
    });

    it('leaves the edge untouched when only the date changes', () => {
      const event = birth('Leominster, Massachusetts');
      const before = linkedPlace(event.id)!.id;

      new EventRepository().update(event.id, { event_date: '12 MAR 1931' });

      expect(linkedPlace(event.id)?.id).toBe(before);
    });
  });

  it('takes the edge with the event when the event is deleted', () => {
    const event = birth('Leominster, Massachusetts');

    new EventRepository().delete(event.id);

    // No half-edge left pointing from nothing to the place.
    expect(
      db.prepare('SELECT id FROM relationships WHERE id = ?').get(`rel_event_place_${event.id}`),
    ).toBeUndefined();
    expect(
      db.prepare('SELECT id FROM archive_objects WHERE id = ?').get(`rel_event_place_${event.id}`),
    ).toBeUndefined();
    expect(
      (db.prepare('SELECT COUNT(*) AS n FROM relationship_members WHERE relationship_id = ?')
        .get(`rel_event_place_${event.id}`) as { n: number }).n,
    ).toBe(0);
    expect(placeCount()).toBe(1);
  });
});

describe('PlaceRepository — renaming a place', () => {
  /* The backfill folded four spellings of Worcester into one place. A rename
     that sent no alias list used to replace them all with the new title. */
  it('keeps the spellings it was merged from', () => {
    const places = new PlaceRepository();
    const place = places.create({
      title: 'Worcester, Massachusetts',
      aliases: ['Worcester, Worcester, Massachusetts', 'Worcester, MA'],
    });

    places.update(place.id, { title: 'Worcester, Mass.' });

    const aliases = places.findAliases(place.id).map(alias => alias.alias);
    expect(aliases).toContain('Worcester, Mass.');
    expect(aliases).toContain('Worcester, MA');
    expect(aliases).toContain('Worcester, Worcester, Massachusetts');

    // And the old spelling still finds it rather than making a second row.
    const event = birth('Worcester, MA');
    expect(linkedPlace(event.id)?.id).toBe(place.id);
    expect(placeCount()).toBe(1);
  });
});

describe('migration 068 — a place the reviewed list does not name', () => {
  /* The list was drawn up from a snapshot. An event recorded between that
     snapshot and the deploy must still get a place, under its own spelling,
     rather than being passed over. The fixture database migrates with no
     events at all, so the backfill has nothing to do until one is inserted and
     the migration is replayed against it. */
  it('gives it its own place rather than skipping the event', () => {
    const eventId = 'evt-unmapped';
    db.prepare(
      `INSERT INTO events (id, person_id, event_type, event_place, created_at, updated_at)
       VALUES (?, ?, 'birth', ?, datetime('now'), datetime('now'))`,
    ).run(eventId, personId, 'Narragansett, Rhode Island');
    // Every real event has one, and the place edge is a relationship between
    // archive objects, so the migration's members would have nothing to hold.
    db.prepare(
      `INSERT INTO archive_objects (id, object_type, title, privacy_level)
       VALUES (?, 'event', 'Birth', 'family')`,
    ).run(eventId);

    db.exec(fs.readFileSync(path.join(migrationsDir, '068-places-from-events.sql'), 'utf8'));

    const place = db.prepare(
      `SELECT ao.title AS title, p.id AS id
       FROM places p INNER JOIN archive_objects ao ON ao.id = p.id`,
    ).get() as { title: string; id: string };

    expect(place.title).toBe('Narragansett, Rhode Island');
    expect(linkedPlace(eventId)?.id).toBe(place.id);
  });
});
