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

/* Rita was registered as Veda Cyr, baptised Rita Cyr, and written since as
   Rita Veda, Veda Rita and V. Rita. Every one of those is recorded, which
   makes her the person in this archive with the most names -- and the one who
   found whatever breaks when a search has to rank them. */
const seedRita = () => {
  const people = new PersonRepository();
  const rita = people.create({ sex: 'F', is_living: 0, display_name: 'Rita Cyr' });
  people.addName(rita.id, { name_type: 'birth', given_name: 'Rita', middle_name: 'Veda', surname: 'Cyr', is_primary: 1 });
  people.addName(rita.id, { name_type: 'married', given_name: 'Rita', middle_name: 'Veda', surname: 'Higgins' });
  people.addName(rita.id, { name_type: 'birth', given_name: 'Veda', surname: 'Cyr' });
  people.addName(rita.id, { name_type: 'religious', given_name: 'Rita', surname: 'Cyr' });
  people.addName(rita.id, { name_type: 'aka', given_name: 'Veda', middle_name: 'Rita', surname: 'Cyr' });
  people.addName(rita.id, { name_type: 'aka', given_name: 'V.', middle_name: 'Rita', surname: 'Cyr' });
  people.addName(rita.id, { name_type: 'married', given_name: 'Rita', middle_name: 'V.', surname: 'Higgins' });
  return rita.id;
};

describe('searching for someone with many names', () => {
  it('finds her, sorted by surname, the way the People page asks', () => {
    const ritaId = seedRita();

    const result = new PersonRepository().findAll({ search: 'Rita', sort: 'surname', limit: 50 });

    expect(result.data.map((person) => person.id)).toContain(ritaId);
  });

  it('finds her by a name that is not her primary one', () => {
    seedRita();

    expect(new PersonRepository().findAll({ search: 'Veda', sort: 'surname' }).data).toHaveLength(1);
  });

  it('counts her once, however many names match', () => {
    seedRita();

    const result = new PersonRepository().findAll({ search: 'Rita', sort: 'surname' });

    expect(result.total_count).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  /* A name recorded as an initial. The FTS query builder strips punctuation,
     and "V." must not become an empty token or an unbalanced query. */
  it('survives a name that is just an initial', () => {
    seedRita();

    expect(() => new PersonRepository().findAll({ search: 'V.', sort: 'surname' })).not.toThrow();
  });
});
