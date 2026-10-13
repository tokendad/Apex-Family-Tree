import Database from 'better-sqlite3';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('./connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('./connection.js');
const { runMigrations } = await import('./migrator.js');
const { backfillFamilyLifecycleEvents } = await import('./backfill.js');
const { EventRepository } = await import('../repositories/EventRepository.js');
const { FamilyRepository } = await import('../repositories/FamilyRepository.js');
const { PersonRepository } = await import('../repositories/PersonRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let walter: string;
let rita: string;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
  const people = new PersonRepository();
  walter = people.create({ display_name: 'Walter Higgins Sr', sex: 'M' }).id;
  rita = people.create({ display_name: 'Rita Cyr', sex: 'F' }).id;
});

afterEach(() => db.close());

/** A family as an import leaves it: the date on the row, and no event. */
const importedFamily = (fields: Record<string, string>) => {
  const id = 'fam-imported';
  const columns = Object.keys(fields);
  db.prepare(
    `INSERT INTO families (id, spouse1_id, spouse2_id, ${columns.join(', ')}, created_at, updated_at)
     VALUES (?, ?, ?, ${columns.map(() => '?').join(', ')}, datetime('now'), datetime('now'))`,
  ).run(id, walter, rita, ...columns.map((column) => fields[column]));
  return id;
};

const familyEvents = (familyId: string) =>
  db.prepare('SELECT event_type, event_date, event_place, event_date_sort_key FROM events WHERE family_id = ?')
    .all(familyId) as { event_type: string; event_date: string; event_place: string | null; event_date_sort_key: number }[];

/* A marriage date on a family row and nowhere else is on the family page and
   invisible everywhere a life is listed: the Events page is built from
   events, and so is each spouse's timeline. */
describe('backfilling a family lifecycle event', () => {
  it('gives an imported marriage an event of its own', () => {
    const family = importedFamily({ marriage_date: '1945-06-02', marriage_place: 'Worcester, Massachusetts' });

    backfillFamilyLifecycleEvents(db, logger);

    expect(familyEvents(family)).toEqual([
      expect.objectContaining({
        event_type: 'marriage',
        event_date: '1945-06-02',
        event_place: 'Worcester, Massachusetts',
        event_date_sort_key: 19450602,
      }),
    ]);
  });

  it('puts it on both spouses’ timelines, which is the point', () => {
    importedFamily({ marriage_date: '1945-06-02' });

    backfillFamilyLifecycleEvents(db, logger);

    const events = new EventRepository();
    expect(events.findTimelineByPerson(walter).map((event) => event.event_type)).toContain('marriage');
    expect(events.findTimelineByPerson(rita).map((event) => event.event_type)).toContain('marriage');
  });

  it('covers a divorce the same way', () => {
    const family = importedFamily({ marriage_date: '1945-06-02', divorce_date: '1960-03-01' });

    backfillFamilyLifecycleEvents(db, logger);

    expect(familyEvents(family).map((event) => event.event_type).sort()).toEqual(['divorce', 'marriage']);
  });

  it('leaves a family that already has its event alone', () => {
    const families = new FamilyRepository();
    const family = families.create({
      spouse1_id: walter,
      spouse2_id: rita,
      marriage_date: '1945-06-02',
    });
    new EventRepository().create({
      family_id: family.id,
      event_type: 'marriage',
      event_date: '1945-06-02',
      description: 'entered by hand',
    });

    backfillFamilyLifecycleEvents(db, logger);

    const events = familyEvents(family.id);
    expect(events).toHaveLength(1);
    expect(events[0].event_date).toBe('1945-06-02');
  });

  it('does nothing twice', () => {
    const family = importedFamily({ marriage_date: '1945-06-02' });
    backfillFamilyLifecycleEvents(db, logger);

    backfillFamilyLifecycleEvents(db, logger);

    expect(familyEvents(family)).toHaveLength(1);
  });

  it('leaves a family with no dates alone', () => {
    const family = new FamilyRepository().create({ spouse1_id: walter, spouse2_id: rita }).id;

    backfillFamilyLifecycleEvents(db, logger);

    expect(familyEvents(family)).toHaveLength(0);
  });
});
