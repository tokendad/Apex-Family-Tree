import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { MediaRepository } = await import('./MediaRepository.js');

/**
 * The portrait the tree shows for a person is one flag: the person_media row
 * carrying is_primary = 1. TreeRepository joins on it and nothing falls back,
 * so a person with photographs and no flag shows no face -- which is the
 * intended state, not a fault.
 *
 * These tests exist because promoting an ALREADY LINKED photograph used to
 * clear the portrait instead of moving it. linkToPerson cleared every flag and
 * then ran INSERT OR IGNORE, which did nothing at all when the row was already
 * there -- and in this archive the row is always already there, because every
 * photograph is linked by the migration that files it long before anyone picks
 * a portrait. The person was left with zero primaries and the tree went blank.
 */

const primaries = (personId: string): string[] =>
  db
    .prepare('SELECT media_id FROM person_media WHERE person_id = ? AND is_primary = 1 ORDER BY media_id')
    .all(personId)
    .map((r) => (r as { media_id: string }).media_id);

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_filename TEXT,
      mime_type TEXT,
      file_size INTEGER,
      file_path TEXT,
      title TEXT,
      description TEXT,
      date_taken TEXT,
      thumbnail_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE persons (id TEXT PRIMARY KEY, sex TEXT);
    CREATE TABLE person_media (
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      PRIMARY KEY (person_id, media_id)
    );
  `);

  db.prepare("INSERT INTO persons (id, sex) VALUES ('p-subject', 'M')").run();
  db.prepare("INSERT INTO persons (id, sex) VALUES ('p-other', 'F')").run();
  for (const [id, name] of [
    ['m-portrait', 'portrait.png'],
    ['m-census', 'census-sheet.jpg'],
    ['m-stray', 'unrelated.jpg'],
  ]) {
    db.prepare(
      'INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, name, name, 'image/jpeg', 100, `/tmp/${name}`);
  }
});

describe('linkToPerson and the portrait flag', () => {
  it('promotes a photograph that is already linked, instead of clearing the portrait', () => {
    const repo = new MediaRepository();
    repo.linkToPerson('m-census', 'p-subject', true);
    repo.linkToPerson('m-portrait', 'p-subject', false);
    expect(primaries('p-subject')).toEqual(['m-census']);

    // The call that used to leave the person with no portrait at all.
    repo.linkToPerson('m-portrait', 'p-subject', true);

    expect(primaries('p-subject')).toEqual(['m-portrait']);
  });

  it('never leaves a person with two portraits', () => {
    const repo = new MediaRepository();
    repo.linkToPerson('m-census', 'p-subject', true);
    repo.linkToPerson('m-portrait', 'p-subject', true);
    repo.linkToPerson('m-census', 'p-subject', true);

    expect(primaries('p-subject')).toHaveLength(1);
  });

  it('leaves sort_order alone when it only re-flags an existing link', () => {
    const repo = new MediaRepository();
    repo.linkToPerson('m-census', 'p-subject', false);
    repo.linkToPerson('m-portrait', 'p-subject', false);
    const before = db
      .prepare("SELECT sort_order FROM person_media WHERE person_id = 'p-subject' AND media_id = 'm-portrait'")
      .get() as { sort_order: number };

    repo.linkToPerson('m-portrait', 'p-subject', true);

    const after = db
      .prepare("SELECT sort_order FROM person_media WHERE person_id = 'p-subject' AND media_id = 'm-portrait'")
      .get() as { sort_order: number };
    expect(after.sort_order).toBe(before.sort_order);
  });

  it('does not touch another person who shares the photograph', () => {
    const repo = new MediaRepository();
    repo.linkToPerson('m-portrait', 'p-other', true);
    repo.linkToPerson('m-census', 'p-subject', false);
    repo.linkToPerson('m-portrait', 'p-subject', true);

    expect(primaries('p-other')).toEqual(['m-portrait']);
    expect(primaries('p-subject')).toEqual(['m-portrait']);
  });
});

describe('setPortrait', () => {
  it('chooses among the photographs a person already has', () => {
    const repo = new MediaRepository();
    repo.linkToPerson('m-census', 'p-subject', true);
    repo.linkToPerson('m-portrait', 'p-subject', false);

    expect(repo.setPortrait('p-subject', 'm-portrait')).toBe(true);
    expect(primaries('p-subject')).toEqual(['m-portrait']);
  });

  it('clears the portrait when given null, leaving the person with none', () => {
    const repo = new MediaRepository();
    repo.linkToPerson('m-portrait', 'p-subject', true);

    expect(repo.setPortrait('p-subject', null)).toBe(true);

    expect(primaries('p-subject')).toEqual([]);
    // The link itself survives: clearing a portrait is not untagging a photo.
    const stillLinked = db
      .prepare("SELECT 1 FROM person_media WHERE person_id = 'p-subject' AND media_id = 'm-portrait'")
      .get();
    expect(stillLinked).toBeTruthy();
  });

  it('refuses a photograph the person is not linked to, and changes nothing', () => {
    const repo = new MediaRepository();
    repo.linkToPerson('m-census', 'p-subject', true);

    expect(repo.setPortrait('p-subject', 'm-stray')).toBe(false);

    expect(primaries('p-subject')).toEqual(['m-census']);
    const tagged = db
      .prepare("SELECT 1 FROM person_media WHERE person_id = 'p-subject' AND media_id = 'm-stray'")
      .get();
    expect(tagged).toBeUndefined();
  });
});

describe('findByPerson', () => {
  it('reports which photograph is the portrait', () => {
    const repo = new MediaRepository();
    repo.linkToPerson('m-census', 'p-subject', false);
    repo.linkToPerson('m-portrait', 'p-subject', true);

    const rows = repo.findByPerson('p-subject') as unknown as { id: string; is_primary: number }[];

    expect(rows[0].id).toBe('m-portrait');
    expect(rows[0].is_primary).toBe(1);
    expect(rows.find((r) => r.id === 'm-census')?.is_primary).toBe(0);
  });
});
