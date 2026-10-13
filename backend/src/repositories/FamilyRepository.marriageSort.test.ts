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
const { FamilyRepository } = await import('./FamilyRepository.js');
const { PersonRepository } = await import('./PersonRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let husband: string;
let wife: string;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
  const people = new PersonRepository();
  husband = people.create({ display_name: 'William Elliott Higgins', sex: 'M' }).id;
  wife = people.create({ display_name: 'Alice E. Odie', sex: 'F' }).id;
});

afterEach(() => db.close());

const sortKeyOf = (id: string) =>
  (db.prepare('SELECT marriage_date_sort_key AS k FROM families WHERE id = ?').get(id) as { k: number | null }).k;

/* A startup backfill fills this in for families that are missing it, so the
   gap only showed between creating a family and next restarting the
   application -- during which its marriage date sorted as though it were not
   there, and the people search that filters on a marriage year could not see
   it. Deriving it here leaves the backfill as the safety net it reads like. */
describe('a family with a marriage date', () => {
  it('knows what it sorts by as soon as it is created', () => {
    const family = new FamilyRepository().create({
      spouse1_id: husband,
      spouse2_id: wife,
      marriage_date: '1911-01-04',
    });

    expect(sortKeyOf(family.id)).toBe(19110104);
  });

  it('reads an approximate date the way everything else does', () => {
    const family = new FamilyRepository().create({
      spouse1_id: husband,
      marriage_date: 'ABT 1911',
    });

    expect(sortKeyOf(family.id)).toBe(19110000);
    expect(
      (db.prepare('SELECT marriage_date_qualifier AS q FROM families WHERE id = ?').get(family.id) as { q: string }).q,
    ).toBe('about');
  });

  it('has no sort key when it has no date', () => {
    const family = new FamilyRepository().create({ spouse1_id: husband });

    expect(sortKeyOf(family.id)).toBeNull();
  });

  it('re-sorts when the date is corrected', () => {
    const families = new FamilyRepository();
    const family = families.create({ spouse1_id: husband, marriage_date: '1911' });

    families.update(family.id, { marriage_date: '1911-01-04' });

    expect(sortKeyOf(family.id)).toBe(19110104);
  });

  it('forgets what it sorted by when the date is cleared', () => {
    const families = new FamilyRepository();
    const family = families.create({ spouse1_id: husband, marriage_date: '1911-01-04' });

    families.update(family.id, { marriage_date: null as unknown as string });

    expect(sortKeyOf(family.id)).toBeNull();
  });
});
