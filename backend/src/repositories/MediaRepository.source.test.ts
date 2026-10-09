import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { MediaRepository } = await import('./MediaRepository.js');

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
    CREATE TABLE source_repositories (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE sources (
      id TEXT PRIMARY KEY,
      repository_id TEXT REFERENCES source_repositories(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      author TEXT,
      publisher TEXT,
      publication_date TEXT,
      url TEXT,
      notes TEXT,
      gedcom_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE source_media (
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source_id, media_id)
    );
    CREATE TABLE persons (id TEXT PRIMARY KEY, sex TEXT);
    CREATE TABLE names (id TEXT PRIMARY KEY, person_id TEXT, given_name TEXT, surname TEXT, is_primary INTEGER, sort_order INTEGER DEFAULT 0);
    CREATE TABLE person_media (person_id TEXT, media_id TEXT, is_primary INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, created_at TEXT, PRIMARY KEY (person_id, media_id));
    CREATE TABLE families (id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT);
    CREATE TABLE family_media (family_id TEXT, media_id TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT, PRIMARY KEY (family_id, media_id));
    CREATE TABLE events (id TEXT PRIMARY KEY, event_type TEXT, event_date TEXT);
    CREATE TABLE event_media (event_id TEXT, media_id TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT, PRIMARY KEY (event_id, media_id));
  `);

  const media = (id: string, filename: string) =>
    db
      .prepare(
        'INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, filename, filename, 'image/jpeg', 100, `/tmp/${filename}`);
  media('m-sheet', 'census-sheet.jpg');
  media('m-index', 'census-index.jpg');

  db.prepare("INSERT INTO sources (id, title, author) VALUES ('s-census', '1930 United States Federal Census', 'US Federal Government')").run();
  db.prepare("INSERT INTO sources (id, title) VALUES ('s-other', 'Parish Register')").run();
});

afterEach(() => {
  db.close();
});

describe('MediaRepository — source images', () => {
  it('attaches an image to a source and reads it back', () => {
    const repo = new MediaRepository();
    const link = repo.linkToSource('m-sheet', 's-census');
    expect(link).toMatchObject({ source_id: 's-census', media_id: 'm-sheet', sort_order: 0 });

    const attached = repo.findBySource('s-census');
    expect(attached.map((m) => m.id)).toEqual(['m-sheet']);
    expect(repo.findBySource('s-other')).toEqual([]);
  });

  it('orders attachments and tolerates a repeated attach', () => {
    const repo = new MediaRepository();
    repo.linkToSource('m-sheet', 's-census');
    repo.linkToSource('m-index', 's-census');
    repo.linkToSource('m-sheet', 's-census'); // same pair again

    expect(repo.findBySource('s-census').map((m) => m.id)).toEqual(['m-sheet', 'm-index']);
    expect(db.prepare('SELECT COUNT(*) c FROM source_media').get()).toEqual({ c: 2 });
  });

  it('detaches an image without deleting it', () => {
    const repo = new MediaRepository();
    repo.linkToSource('m-sheet', 's-census');

    expect(repo.unlinkFromSource('m-sheet', 's-census')).toBe(true);
    expect(repo.findBySource('s-census')).toEqual([]);
    // The media item itself survives — it may be attached elsewhere.
    expect(repo.findById('m-sheet')).toBeTruthy();
  });

  it('reports a missing link rather than claiming success', () => {
    expect(new MediaRepository().unlinkFromSource('m-index', 's-census')).toBe(false);
  });

  it('lists source attachments alongside the other link types', () => {
    const repo = new MediaRepository();
    repo.linkToSource('m-sheet', 's-census');

    const links = repo.findLinks('m-sheet');
    expect(links.sources).toEqual([{ source_id: 's-census', label: '1930 United States Federal Census' }]);
    expect(links.persons).toEqual([]);
    expect(links.families).toEqual([]);
    expect(links.events).toEqual([]);
  });

  it('drops the link when the source is deleted', () => {
    const repo = new MediaRepository();
    repo.linkToSource('m-sheet', 's-census');

    db.prepare("DELETE FROM sources WHERE id = 's-census'").run();

    expect(db.prepare('SELECT COUNT(*) c FROM source_media').get()).toEqual({ c: 0 });
    expect(repo.findById('m-sheet')).toBeTruthy();
  });
});
