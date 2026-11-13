import Database from 'better-sqlite3';
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
const { FamilyRepository } = await import('./FamilyRepository.js');
const { PersonRepository } = await import('./PersonRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
});

afterEach(() => db.close());

/** PersonRepository.create only sets persons.display_name -- the name search
    reads the names table, so a test person needs a row there too. */
function addPrimaryName(personId: string, given: string, surname: string): void {
  db.prepare(
    "INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at) VALUES (?, ?, 'birth', ?, ?, 1, 0, '2026-01-01', '2026-01-01')",
  ).run(`name_${personId}`, personId, given, surname);
}

function createPerson(displayName: string, given: string, surname: string): string {
  const id = new PersonRepository().create({ display_name: displayName }).id;
  addPrimaryName(id, given, surname);
  return id;
}

describe('EventRepository.findAll — search', () => {
  it('finds an event by its own type, place or description', () => {
    const person = createPerson('Raymond LeFort', 'Raymond', 'LeFort');
    const events = new EventRepository();
    const wake = events.create({ person_id: person, event_type: 'wake', event_place: 'Lefort Funeral Home' });
    events.create({ person_id: person, event_type: 'birth', event_place: 'Woonsocket' });

    const byPlace = events.findAll({ search: 'funeral' });
    expect(byPlace.data.map((e) => e.id)).toEqual([wake.id]);

    const byType = events.findAll({ search: 'wake' });
    expect(byType.data.map((e) => e.id)).toEqual([wake.id]);
  });

  it('finds a person event by the person\'s name', () => {
    const person = createPerson('Raymond LeFort', 'Raymond', 'LeFort');
    const other = createPerson('Eunice Corey', 'Eunice', 'Corey');
    const events = new EventRepository();
    const birth = events.create({ person_id: person, event_type: 'birth' });
    events.create({ person_id: other, event_type: 'birth' });

    const result = events.findAll({ search: 'lefort' });
    expect(result.data.map((e) => e.id)).toEqual([birth.id]);
  });

  it('matches multiple words against type and name together', () => {
    const person = createPerson('Raymond LeFort', 'Raymond', 'LeFort');
    const events = new EventRepository();
    const wake = events.create({ person_id: person, event_type: 'wake' });

    expect(events.findAll({ search: 'raymond wake' }).data.map((e) => e.id)).toEqual([wake.id]);
    expect(events.findAll({ search: 'eunice wake' }).data).toEqual([]);
  });

  it('finds a family event by either spouse\'s name', () => {
    const spouse1 = createPerson('Raymond LeFort', 'Raymond', 'LeFort');
    const spouse2 = createPerson('Eunice Corey', 'Eunice', 'Corey');
    const family = new FamilyRepository().create({ spouse1_id: spouse1, spouse2_id: spouse2 });
    const marriage = new EventRepository().create({ family_id: family.id, event_type: 'marriage' });

    expect(new EventRepository().findAll({ search: 'corey' }).data.map((e) => e.id)).toEqual([marriage.id]);
  });
});
