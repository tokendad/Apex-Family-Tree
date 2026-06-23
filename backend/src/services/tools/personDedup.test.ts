import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../../db/connection.js', () => ({
  getDatabase: () => db,
}));

const { applyPeopleMerge, previewPeopleMerge, scanPeopleDuplicates } = await import('./personDedup.js');

function seedSchema(database: Database.Database) {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE persons (
      id TEXT PRIMARY KEY,
      sex TEXT NOT NULL DEFAULT 'U',
      is_living INTEGER NOT NULL DEFAULT 1,
      is_private INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_by TEXT,
      gedcom_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE names (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      name_type TEXT NOT NULL DEFAULT 'birth',
      prefix TEXT,
      given_name TEXT,
      surname TEXT,
      suffix TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      event_date TEXT,
      event_date_qualifier TEXT,
      event_date_sort_key INTEGER,
      event_place TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE families (
      id TEXT PRIMARY KEY,
      spouse1_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
      spouse2_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
      marriage_date TEXT,
      marriage_date_qualifier TEXT,
      marriage_date_sort_key INTEGER,
      marriage_place TEXT,
      divorce_date TEXT,
      divorce_place TEXT,
      gedcom_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE family_members (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'child',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(family_id, person_id)
    );

    CREATE TABLE sources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE source_citations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
      event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
      page TEXT,
      quality TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE media_items (
      id TEXT PRIMARY KEY,
      file_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE person_media (
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (person_id, media_id)
    );

    CREATE TABLE media_person_regions (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      x REAL NOT NULL,
      y REAL NOT NULL,
      width REAL NOT NULL,
      height REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      home_person_id TEXT REFERENCES persons(id) ON DELETE SET NULL
    );

    CREATE TABLE export_jobs (
      id TEXT PRIMARY KEY,
      scope_person_id TEXT REFERENCES persons(id),
      status TEXT NOT NULL DEFAULT 'pending'
    );
  `);
}

function seedDuplicatePeople(database: Database.Database) {
  const insertPerson = database.prepare('INSERT INTO persons (id, sex, is_living, notes) VALUES (?, ?, ?, ?)');
  insertPerson.run('keep', 'M', 0, 'Original notes');
  insertPerson.run('dupe', 'M', 0, 'Additional notes');
  insertPerson.run('other', 'F', 1, null);

  const insertName = database.prepare(`
    INSERT INTO names (id, person_id, given_name, surname, is_primary, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertName.run('name-keep', 'keep', 'John', 'Smith', 1, 0);
  insertName.run('name-dupe', 'dupe', 'John', 'Smith', 1, 0);
  insertName.run('name-dupe-aka', 'dupe', 'Johnny', 'Smith', 0, 1);
  insertName.run('name-other', 'other', 'Jane', 'Brown', 1, 0);

  const insertEvent = database.prepare(`
    INSERT INTO events (id, person_id, event_type, event_date, event_date_sort_key, event_place)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertEvent.run('birth-keep', 'keep', 'birth', '1 JAN 1900', 19000101, 'Boston, MA');
  insertEvent.run('birth-dupe', 'dupe', 'birth', '1 JAN 1900', 19000101, 'Cambridge, MA');
  insertEvent.run('death-dupe', 'dupe', 'death', '2 FEB 1970', 19700202, 'Boston, MA');

  database.prepare('INSERT INTO families (id, spouse1_id, spouse2_id) VALUES (?, ?, ?)').run('family-spouse', 'dupe', 'other');
  database.prepare('INSERT INTO families (id, spouse1_id, spouse2_id) VALUES (?, ?, ?)').run('family-child', 'other', null);
  database.prepare('INSERT INTO family_members (id, family_id, person_id, role) VALUES (?, ?, ?, ?)').run('child-link', 'family-child', 'dupe', 'child');

  database.prepare('INSERT INTO sources (id, title) VALUES (?, ?)').run('source-1', 'Birth Register');
  database.prepare('INSERT INTO source_citations (id, source_id, person_id, page) VALUES (?, ?, ?, ?)').run('citation-person', 'source-1', 'dupe', '12');
  database.prepare('INSERT INTO source_citations (id, source_id, event_id, page) VALUES (?, ?, ?, ?)').run('citation-event', 'source-1', 'death-dupe', '44');

  database.prepare('INSERT INTO media_items (id, file_name) VALUES (?, ?)').run('media-1', 'john.jpg');
  database.prepare('INSERT INTO person_media (person_id, media_id, is_primary) VALUES (?, ?, ?)').run('dupe', 'media-1', 1);
  database.prepare(`
    INSERT INTO media_person_regions (id, media_id, person_id, x, y, width, height)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('region-1', 'media-1', 'dupe', 0.1, 0.2, 0.3, 0.4);

  database.prepare('INSERT INTO users (id, email, home_person_id) VALUES (?, ?, ?)').run('user-1', 'user@example.test', 'dupe');
  database.prepare('INSERT INTO export_jobs (id, scope_person_id) VALUES (?, ?)').run('export-1', 'dupe');
}

beforeEach(() => {
  db = new Database(':memory:');
  seedSchema(db);
  seedDuplicatePeople(db);
});

afterEach(() => {
  db.close();
});

describe('person de-duplication service', () => {
  it('finds strong duplicate people with explainable summaries', () => {
    const scan = scanPeopleDuplicates();

    expect(scan.groups).toHaveLength(1);
    expect(scan.groups[0]).toMatchObject({
      confidence: 'strong',
      reasons: expect.arrayContaining(['Same normalized primary name', 'Same birth year']),
    });
    expect(scan.groups[0].people.map((p) => p.id).sort()).toEqual(['dupe', 'keep']);
    expect(scan.groups[0].people.find((p) => p.id === 'dupe')).toMatchObject({
      displayName: 'John Smith',
      birthDate: '1 JAN 1900',
      relationshipCount: 2,
      sourceCount: 2,
      mediaCount: 1,
    });
  });

  it('previews transfer counts and field conflicts before applying a merge', () => {
    const preview = previewPeopleMerge({
      groupId: 'dupe__keep',
      canonicalPersonId: 'keep',
      duplicatePersonIds: ['dupe'],
      fieldResolutions: {
        birthPlace: 'canonical',
        deathDate: 'duplicate:dupe',
        deathPlace: 'duplicate:dupe',
        notes: 'duplicate:dupe',
      },
    });

    expect(preview.canonicalPersonId).toBe('keep');
    expect(preview.duplicatePersonIds).toEqual(['dupe']);
    expect(preview.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'birthPlace', canonicalValue: 'Boston, MA', duplicateValue: 'Cambridge, MA' }),
        expect.objectContaining({ field: 'notes', canonicalValue: 'Original notes', duplicateValue: 'Additional notes' }),
      ]),
    );
    expect(preview.transferCounts).toMatchObject({
      names: 1,
      events: 2,
      families: 2,
      sourceCitations: 2,
      mediaLinks: 1,
      mediaRegions: 1,
      userHomePeople: 1,
      exportScopes: 1,
    });
  });

  it('applies a person merge transactionally and preserves dependent records', () => {
    const result = applyPeopleMerge({
      groupId: 'dupe__keep',
      canonicalPersonId: 'keep',
      duplicatePersonIds: ['dupe'],
      fieldResolutions: {
        birthPlace: 'canonical',
        deathDate: 'duplicate:dupe',
        deathPlace: 'duplicate:dupe',
        notes: 'duplicate:dupe',
      },
    });

    expect(result.mergedPersonIds).toEqual(['dupe']);
    expect(db.prepare('SELECT COUNT(*) AS count FROM persons WHERE id = ?').get('dupe')).toEqual({ count: 0 });
    expect(db.prepare('SELECT notes FROM persons WHERE id = ?').get('keep')).toEqual({ notes: 'Additional notes' });
    expect(db.prepare('SELECT person_id FROM events WHERE id = ?').get('death-dupe')).toEqual({ person_id: 'keep' });
    expect(db.prepare('SELECT spouse1_id FROM families WHERE id = ?').get('family-spouse')).toEqual({ spouse1_id: 'keep' });
    expect(db.prepare('SELECT person_id FROM family_members WHERE id = ?').get('child-link')).toEqual({ person_id: 'keep' });
    expect(db.prepare('SELECT person_id FROM source_citations WHERE id = ?').get('citation-person')).toEqual({ person_id: 'keep' });
    expect(db.prepare('SELECT person_id FROM person_media WHERE media_id = ?').get('media-1')).toEqual({ person_id: 'keep' });
    expect(db.prepare('SELECT person_id FROM media_person_regions WHERE id = ?').get('region-1')).toEqual({ person_id: 'keep' });
    expect(db.prepare('SELECT home_person_id FROM users WHERE id = ?').get('user-1')).toEqual({ home_person_id: 'keep' });
    expect(db.prepare('SELECT scope_person_id FROM export_jobs WHERE id = ?').get('export-1')).toEqual({ scope_person_id: 'keep' });
  });
});
