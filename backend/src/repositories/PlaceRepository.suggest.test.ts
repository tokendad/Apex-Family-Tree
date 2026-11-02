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
const { PlaceRepository } = await import('./PlaceRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let repo: InstanceType<typeof PlaceRepository>;
let massachusetts: string;
let worcester: string;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');

  repo = new PlaceRepository();
  massachusetts = repo.create({ title: 'Massachusetts, United States', place_type: 'state', region: 'Massachusetts', country: 'United States' }).id;
  worcester = repo.create({
    title: 'Worcester, Massachusetts',
    place_type: 'city',
    locality: 'Worcester',
    region: 'Massachusetts',
    country: 'United States',
    parent_place_id: massachusetts,
    aliases: ['Worcester, Worcester, Massachusetts'],
  }).id;
  repo.create({
    title: '714 Main St., Worcester, Massachusetts',
    place_type: 'address',
    address_text: '714 Main St.',
    locality: 'Worcester',
    region: 'Massachusetts',
    country: 'United States',
    parent_place_id: worcester,
  });
  repo.create({ title: 'Paxton, Massachusetts', place_type: 'city', locality: 'Paxton', region: 'Massachusetts', country: 'United States', parent_place_id: massachusetts });
});

afterEach(() => db.close());

const titles = (term: string, limit?: number) => repo.suggest(term, limit).map(s => s.title);

describe('PlaceRepository — suggesting a place somebody is typing', () => {
  /* Issue #35: entry was a free-text box with nothing offering what the
     archive already holds, so a second spelling of a known place became a
     second place. */
  it('offers the places whose name starts with what was typed first', () => {
    expect(titles('worce')).toEqual([
      'Worcester, Massachusetts',
      '714 Main St., Worcester, Massachusetts',
    ]);
  });

  it('still offers a place the term only appears inside', () => {
    expect(titles('main st')).toEqual(['714 Main St., Worcester, Massachusetts']);
  });

  it('matches a component, not only the name', () => {
    // Nothing is titled "Paxton, Worcester County" — the match is on region.
    expect(titles('massachu')).toContain('Paxton, Massachusetts');
  });

  it('matches a spelling that was folded away as an alias', () => {
    // The whole point of the alias leg: resolveOrCreate would have matched
    // this string, so the typeahead must offer the same place.
    expect(titles('Worcester, Worcester')).toContain('Worcester, Massachusetts');
  });

  it('says which place a suggestion sits inside', () => {
    const [street] = repo.suggest('714 Main');
    expect(street.parent_place_id).toBe(worcester);
    expect(street.parent_title).toBe('Worcester, Massachusetts');
    expect(street.address_text).toBe('714 Main St.');
  });

  it('returns nothing for an empty term rather than everything', () => {
    expect(repo.suggest('')).toEqual([]);
    expect(repo.suggest('   ')).toEqual([]);
  });

  it('honours the limit', () => {
    expect(repo.suggest('massachusetts', 2)).toHaveLength(2);
  });

  it('leaves out a deleted place', () => {
    repo.delete(worcester);
    expect(titles('worce')).toEqual(['714 Main St., Worcester, Massachusetts']);
  });
});
