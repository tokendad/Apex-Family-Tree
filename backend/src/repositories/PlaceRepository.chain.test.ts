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

const componentsSql = fs.readFileSync(
  path.join(migrationsDir, '074-places-structured-components.sql'),
  'utf-8',
);
const revertSql = fs.readFileSync(
  path.join(migrationsDir, '074-places-structured-components-down.sql'),
  'utf-8',
);
const dropColumnSql = fs.readFileSync(
  path.join(migrationsDir, '073-places-parent-down.sql'),
  'utf-8',
);

/* The migrator turns FK enforcement off for a migration run; match it, so the
   hand-ordered deletes in the down file behave here as they do in production. */
const runSql = (sql: string) => {
  db.pragma('foreign_keys = OFF');
  db.exec(sql);
  db.pragma('foreign_keys = ON');
};

let personId: string;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
  personId = new PersonRepository().create({ display_name: 'Test Subject' }).id;
});

afterEach(() => db.close());

const place = (normalized: string) =>
  db.prepare(
    `SELECT ao.title AS title, p.*
     FROM places p INNER JOIN archive_objects ao ON ao.id = p.id
     WHERE p.normalized_name = ?`,
  ).get(normalized) as (Record<string, unknown> & { id: string; title: string }) | undefined;

const placeCount = () =>
  (db.prepare('SELECT COUNT(*) AS n FROM places').get() as { n: number }).n;

/** The archive as migration 068 left it: a place per event spelling, with
    address_text standing in for the structured columns it could not fill. */
const seedLegacyPlaces = (names: string[]) => {
  const events = new EventRepository();
  for (const name of names) {
    events.create({ person_id: personId, event_type: 'birth', event_place: name });
  }
  db.prepare(
    'UPDATE places SET address_text = (SELECT ao.title FROM archive_objects ao WHERE ao.id = places.id)',
  ).run();
};

describe('migration 074 — components and the chain above a place', () => {
  /* The live archive: every one of these was recorded on an event, so 068 made
     a place of it. Enough of them to reach three levels up. */
  beforeEach(() => {
    seedLegacyPlaces([
      'Worcester, Massachusetts',
      'Massachusetts',
      '714 Main St., Worcester, Massachusetts 01610',
      'Cambridge Cemetery, Cambridge, Massachusetts',
      'Camp Devens, Massachusetts',
      'Fort Jay, Governors Island, New York',
      'Montréal, Québec, Canada',
      'Canada',
    ]);
    runSql(componentsSql);
  });

  it('splits a locality into its components', () => {
    expect(place('worcester, massachusetts')).toMatchObject({
      place_type: 'locality',
      locality: 'Worcester',
      region: 'Massachusetts',
      country: 'United States',
    });
  });

  /* The correction 074 exists for: 068 wrote the place's own name here for
     want of anything better, and a town is not a street address. */
  it('stops a place being its own address', () => {
    expect(place('worcester, massachusetts')?.address_text).toBeNull();
    expect(place('massachusetts')?.address_text).toBeNull();
  });

  it('keeps a street line, and the ZIP that was stuck on the end of the name', () => {
    expect(place('714 main st., worcester, massachusetts 01610')).toMatchObject({
      place_type: 'address',
      address_text: '714 Main St.',
      postal_code: '01610',
      locality: 'Worcester',
    });
  });

  /* Given by the archive's owner. The name stays in the title, where it is. */
  it('gives a cemetery the street address it was supplied', () => {
    expect(place('cambridge cemetery, cambridge, massachusetts')).toMatchObject({
      place_type: 'cemetery',
      address_text: '76 Coolidge Ave',
      postal_code: '02138',
      locality: 'Cambridge',
    });
  });

  /* An installation spread across three towns has no street address to hold,
     and a guess here would be worse than nothing. */
  it('leaves an unknown address null', () => {
    expect(place('camp devens, massachusetts')).toMatchObject({
      place_type: 'military',
      address_text: null,
      locality: null,
      region: 'Massachusetts',
    });
  });

  it('creates the town a cemetery is in, which no event ever named', () => {
    expect(place('cambridge, massachusetts')).toMatchObject({
      place_type: 'locality',
      locality: 'Cambridge',
      region: 'Massachusetts',
      address_text: null,
    });
  });

  it('hangs each place under the one that contains it', () => {
    const cemetery = place('cambridge cemetery, cambridge, massachusetts')!;
    const cambridge = place('cambridge, massachusetts')!;
    const massachusetts = place('massachusetts')!;

    expect(cemetery.parent_place_id).toBe(cambridge.id);
    expect(cambridge.parent_place_id).toBe(massachusetts.id);
    expect(massachusetts.parent_place_id).toBe(place('united states')!.id);
    expect(place('united states')?.parent_place_id).toBeNull();
  });

  /* Neither Governors Island nor New York was ever recorded on its own, so
     both are created, and the country above them with them. */
  it('builds the whole chain above a place, not just its parent', () => {
    const chain = new PlaceRepository()
      .findChain(place('fort jay, governors island, new york')!.id)
      .map(step => step.title);

    expect(chain).toEqual(['Governors Island, New York', 'New York', 'United States']);
  });

  /* The archive spells the province both ways and keeps both titles. The
     region column settles on one, so grouping by region shows one Quebec. */
  it('spells a province one way in the region column', () => {
    expect(place('montréal, québec, canada')).toMatchObject({
      locality: 'Montréal',
      region: 'Quebec',
      country: 'Canada',
    });
    expect(place('montréal, québec, canada')?.parent_place_id).toBe(place('quebec, canada')!.id);
    expect(place('quebec, canada')?.parent_place_id).toBe(place('canada')!.id);
  });

  it('renames nothing', () => {
    expect(place('montréal, québec, canada')?.title).toBe('Montréal, Québec, Canada');
    expect(place('714 main st., worcester, massachusetts 01610')?.title)
      .toBe('714 Main St., Worcester, Massachusetts 01610');
  });

  it('leaves every parent pointing at a place that exists', () => {
    const dangling = db.prepare(
      `SELECT COUNT(*) AS n FROM places p
       WHERE p.parent_place_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM places q WHERE q.id = p.parent_place_id)`,
    ).get() as { n: number };

    expect(dangling.n).toBe(0);
  });

  it('does nothing the second time', () => {
    const snapshot = () => JSON.stringify(
      db.prepare(
        `SELECT id, normalized_name, place_type, address_text, locality, county,
                region, country, postal_code, parent_place_id
         FROM places ORDER BY id`,
      ).all(),
    );
    const before = snapshot();

    runSql(componentsSql);

    expect(snapshot()).toBe(before);
  });

  describe('rolled back', () => {
    it('puts 068’s defaults back', () => {
      runSql(revertSql);

      expect(place('worcester, massachusetts')).toMatchObject({
        address_text: 'Worcester, Massachusetts',
        place_type: null,
        locality: null,
        region: null,
        country: null,
        postal_code: null,
        parent_place_id: null,
      });
    });

    it('removes the places it created', () => {
      runSql(revertSql);

      expect(place('cambridge, massachusetts')).toBeUndefined();
      expect(place('governors island, new york')).toBeUndefined();
      expect(place('united states')).toBeUndefined();
      // And the ones that were always here stay.
      expect(place('massachusetts')).toBeDefined();
      expect(place('canada')).toBeDefined();
    });

    it('leaves no alias or object behind for a place it removed', () => {
      runSql(revertSql);

      const strayAliases = db.prepare(
        `SELECT COUNT(*) AS n FROM place_aliases pa
         WHERE NOT EXISTS (SELECT 1 FROM places p WHERE p.id = pa.place_id)`,
      ).get() as { n: number };
      const strayObjects = db.prepare(
        "SELECT COUNT(*) AS n FROM archive_objects WHERE id LIKE 'place_chain_%'",
      ).get() as { n: number };

      expect(strayAliases.n).toBe(0);
      expect(strayObjects.n).toBe(0);
    });

    /* A created place that has since been recorded on an event is real data,
       and a rollback must not take it. */
    it('keeps a created place that an event now points at', () => {
      const cambridge = place('cambridge, massachusetts')!.id;
      new EventRepository().create({
        person_id: personId,
        event_type: 'death',
        event_place: 'Cambridge, Massachusetts',
      });

      runSql(revertSql);

      expect(place('cambridge, massachusetts')?.id).toBe(cambridge);
    });

    it('can be replayed afterwards', () => {
      runSql(revertSql);
      runSql(componentsSql);

      expect(place('cambridge cemetery, cambridge, massachusetts')?.parent_place_id)
        .toBe(place('cambridge, massachusetts')!.id);
    });
  });
});

describe('migration 073 rolled back', () => {
  beforeEach(() => {
    seedLegacyPlaces(['Worcester, Massachusetts', 'Massachusetts']);
    runSql(componentsSql);
  });

  /* The rollback rebuilds the table, because SQLite will not drop a column
     that carries a REFERENCES clause. place_aliases cascades from places, so
     the rebuild has to happen with foreign keys off -- with them on, dropping
     the old table takes every alias with it, and the aliases are what keep
     the folded spellings resolvable. */
  it('keeps the aliases the rebuild could have cascaded away', () => {
    // Counted after 074's own rollback, which removes the places it created
    // and their aliases with them. What is left is what 073 must not touch.
    runSql(revertSql);
    const before = (db.prepare('SELECT COUNT(*) AS n FROM place_aliases').get() as { n: number }).n;
    expect(before).toBeGreaterThan(0);

    // Run with enforcement on, which is the hazard: the file turns it off
    // itself, and that is what is being tested.
    db.pragma('foreign_keys = ON');
    db.exec(dropColumnSql);

    expect((db.prepare('SELECT COUNT(*) AS n FROM place_aliases').get() as { n: number }).n).toBe(before);
    expect(new PlaceRepository().findAliases(place('worcester, massachusetts')!.id).map(a => a.alias))
      .toContain('Worcester, Massachusetts');
  });

  it('takes the column away and leaves the places readable', () => {
    const worcester = place('worcester, massachusetts')!.id;

    runSql(revertSql);
    runSql(dropColumnSql);

    const columns = (db.prepare('PRAGMA table_info(places)').all() as { name: string }[])
      .map(column => column.name);
    expect(columns).not.toContain('parent_place_id');
    expect(columns).toContain('postal_code');
    expect(new PlaceRepository().findById(worcester)?.title).toBe('Worcester, Massachusetts');
  });

  it('keeps the indexes the table had', () => {
    runSql(revertSql);
    runSql(dropColumnSql);

    const indexes = (db.prepare('PRAGMA index_list(places)').all() as { name: string }[])
      .map(index => index.name);
    expect(indexes).toContain('idx_places_normalized_name');
    expect(indexes).toContain('idx_places_locality');
  });
});

describe('migration 074 on an archive with no places', () => {
  /* Driven by the data, like 068. A fresh install has no events and therefore
     no places, and must not be handed seventeen American states. */
  it('creates nothing', () => {
    runSql(componentsSql);

    expect(placeCount()).toBe(0);
  });
});

describe('PlaceRepository — a new place', () => {
  /* The other half of the same correction: the repository used to default
     address_text to the title, so the first event recorded after 074 would put
     the junk straight back. */
  it('is not its own street address', () => {
    const created = new PlaceRepository().create({ title: 'Oxford, Massachusetts' });

    expect(created.address_text).toBeNull();
  });

  it('keeps an address it is given', () => {
    const created = new PlaceRepository().create({
      title: 'Cambridge Cemetery, Cambridge, Massachusetts',
      address_text: '76 Coolidge Ave',
    });

    expect(created.address_text).toBe('76 Coolidge Ave');
  });

  it('can be created inside another place and read back out', () => {
    const repo = new PlaceRepository();
    const state = repo.create({ title: 'Massachusetts', place_type: 'region' });
    const town = repo.create({
      title: 'Oxford, Massachusetts',
      place_type: 'locality',
      parent_place_id: state.id,
    });

    expect(repo.findById(town.id)?.parent_place_id).toBe(state.id);
    expect(repo.findChain(town.id).map(step => step.title)).toEqual(['Massachusetts']);
  });
});
