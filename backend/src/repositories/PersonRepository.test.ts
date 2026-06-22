import Database from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { MatchPersonInput } from '../services/gedcom/matcher.js';
import { soundex } from '../utils/soundex.js';

// ---- In-memory DB setup ----
let db: Database.Database;

vi.mock('../db/connection.js', () => ({
  getDatabase: () => db,
}));

// Import after mocking
const { PersonRepository } = await import('./PersonRepository.js');

function seedDB(database: Database.Database) {
  database.pragma('foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS persons (
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
    CREATE TABLE IF NOT EXISTS names (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      name_type TEXT DEFAULT 'birth',
      prefix TEXT,
      given_name TEXT,
      surname TEXT,
      suffix TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS events (
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
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      spouse1_id TEXT REFERENCES persons(id),
      spouse2_id TEXT REFERENCES persons(id),
      marriage_date TEXT,
      marriage_date_qualifier TEXT,
      marriage_date_sort_key INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'child',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS source_citations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
      event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
      page TEXT,
      quality TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS person_media (
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (person_id, media_id)
    );
  `);

  // FTS5 table for full-text search (content-storing, matching migration 033)
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS persons_fts USING fts5(
      person_id UNINDEXED,
      given_name,
      surname,
      notes,
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS persons_fts_insert AFTER INSERT ON names
    BEGIN
      DELETE FROM persons_fts WHERE person_id = NEW.person_id;
      INSERT INTO persons_fts(person_id, given_name, surname, notes)
      SELECT NEW.person_id,
        (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.person_id),
        (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.person_id),
        (SELECT notes FROM persons WHERE id = NEW.person_id);
    END;

    CREATE TRIGGER IF NOT EXISTS persons_fts_update AFTER UPDATE ON names
    BEGIN
      DELETE FROM persons_fts WHERE person_id = NEW.person_id;
      INSERT INTO persons_fts(person_id, given_name, surname, notes)
      SELECT NEW.person_id,
        (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.person_id),
        (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.person_id),
        (SELECT notes FROM persons WHERE id = NEW.person_id);
    END;

    CREATE TRIGGER IF NOT EXISTS persons_fts_delete AFTER DELETE ON names
    BEGIN
      DELETE FROM persons_fts WHERE person_id = OLD.person_id;
      INSERT INTO persons_fts(person_id, given_name, surname, notes)
      SELECT OLD.person_id,
        (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = OLD.person_id),
        (SELECT group_concat(surname, ' ') FROM names WHERE person_id = OLD.person_id),
        (SELECT notes FROM persons WHERE id = OLD.person_id)
      WHERE EXISTS (SELECT 1 FROM persons WHERE id = OLD.person_id);
    END;

    CREATE TRIGGER IF NOT EXISTS persons_fts_notes_update AFTER UPDATE OF notes ON persons
    BEGIN
      DELETE FROM persons_fts WHERE person_id = NEW.id;
      INSERT INTO persons_fts(person_id, given_name, surname, notes)
      SELECT NEW.id,
        (SELECT group_concat(given_name, ' ') FROM names WHERE person_id = NEW.id),
        (SELECT group_concat(surname, ' ') FROM names WHERE person_id = NEW.id),
        NEW.notes
      WHERE EXISTS (SELECT 1 FROM names WHERE person_id = NEW.id);
    END;

    CREATE TRIGGER IF NOT EXISTS persons_fts_person_delete AFTER DELETE ON persons
    BEGIN
      DELETE FROM persons_fts WHERE person_id = OLD.id;
    END;
  `);
  const ins = database.prepare('INSERT INTO persons (id, sex, is_living) VALUES (?, ?, ?)');
  ins.run('p1', 'M', 1);  // John Smith, living male
  ins.run('p2', 'F', 0);  // Jane Doe, deceased female
  ins.run('p3', 'M', 0);  // Bob Smith, deceased male
  ins.run('p4', 'F', 1);  // Alice Johnson, living female
  ins.run('p5', 'U', 1);  // Unknown person, no events

  // Insert names
  const nameSql = database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)');
  nameSql.run('n1', 'p1', 'John', 'Smith');
  nameSql.run('n2', 'p2', 'Jane', 'Doe');
  nameSql.run('n3', 'p3', 'Bob', 'Smith');
  nameSql.run('n4', 'p4', 'Alice', 'Johnson');
  nameSql.run('n5', 'p5', 'Unknown', null);

  // Insert events
  const evtSql = database.prepare('INSERT INTO events (id, person_id, event_type, event_date_sort_key, event_place) VALUES (?, ?, ?, ?, ?)');
  evtSql.run('e1', 'p1', 'birth', 19800115, 'New York, NY');
  evtSql.run('e2', 'p2', 'birth', 19500305, 'London, UK');
  evtSql.run('e3', 'p2', 'death', 20200101, 'London, UK');
  evtSql.run('e4', 'p3', 'birth', 19450620, 'Chicago, IL');
  evtSql.run('e5', 'p3', 'death', 20100315, 'Chicago, IL');
  evtSql.run('e6', 'p4', 'birth', 19900801, 'Paris, France');

  // Insert media for p1
  database.prepare('INSERT INTO media_items (id, file_path) VALUES (?, ?)').run('m1', '/photos/john.jpg');
  database.prepare('INSERT INTO person_media (person_id, media_id) VALUES (?, ?)').run('p1', 'm1');

  // Insert source citations: p2 has a direct citation, p3 has a citation on their birth event
  database.prepare('INSERT INTO sources (id, title) VALUES (?, ?)').run('s1', 'Census 1950');
  database.prepare('INSERT INTO source_citations (id, source_id, person_id) VALUES (?, ?, ?)').run('c1', 's1', 'p2');
  database.prepare('INSERT INTO source_citations (id, source_id, event_id) VALUES (?, ?, ?)').run('c2', 's1', 'e4');

  // p6: person with no name (missing data)
  ins.run('p6', 'M', 0);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n6', 'p6', null, 'Doe');
  evtSql.run('e7', 'p6', 'birth', 19000101, null);
  // no death event — deceased with no death = missing data

  // p7: person with no birth event (missing data)
  ins.run('p7', 'F', 1);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n7', 'p7', 'Mary', 'Wilson');
  // no events at all

  // ---- Phase 3 seed data ----
  // p8: Walter Earl LeFort — for initial/middle name testing + relationship root
  ins.run('p8', 'M', 1);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n8', 'p8', 'Walter Earl', 'LeFort');
  evtSql.run('e8', 'p8', 'birth', 19500615, 'New Orleans, LA');

  // p9: Henrietta M LeFort — initial "M", spouse of p8
  ins.run('p9', 'F', 1);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n9', 'p9', 'Henrietta M', 'LeFort');
  evtSql.run('e9', 'p9', 'birth', 19520310, 'Baton Rouge, LA');

  // p10: James Walter LeFort — child of p8+p9 (for ancestor/descendant testing)
  ins.run('p10', 'M', 1);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n10', 'p10', 'James Walter', 'LeFort');
  evtSql.run('e10', 'p10', 'birth', 19750920, null);

  // p11: Sarah LeFort — another child of p8+p9 (sibling of p10)
  ins.run('p11', 'F', 1);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n11', 'p11', 'Sarah', 'LeFort');
  evtSql.run('e11', 'p11', 'birth', 19780105, null);

  // p12: grandparent of p10 (parent of p8)
  ins.run('p12', 'M', 0);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n12', 'p12', 'George', 'LeFort');
  evtSql.run('e12', 'p12', 'birth', 19200101, null);
  evtSql.run('e13', 'p12', 'death', 19900101, null);

  // Family f1: p8 + p9, married 1977, with children p10, p11
  const famSql = database.prepare('INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_sort_key) VALUES (?, ?, ?, ?, ?)');
  famSql.run('f1', 'p8', 'p9', '20 AUG 1977', 19770820);

  const memSql = database.prepare('INSERT INTO family_members (id, family_id, person_id, role) VALUES (?, ?, ?, ?)');
  memSql.run('fm1', 'f1', 'p10', 'child');
  memSql.run('fm2', 'f1', 'p11', 'child');

  // Family f2: p12 is parent of p8 (grandparent lineage)
  famSql.run('f2', 'p12', null, null, null);
  memSql.run('fm3', 'f2', 'p8', 'child');

  // Family f3: p1 + p4 married 2015 (for marriage year filter testing)
  famSql.run('f3', 'p1', 'p4', '15 JUN 2015', 20150615);

  // ---- Phase 5 date qualifier seed data ----
  // p13: birth with qualifier 'about', death with qualifier 'before'
  ins.run('p13', 'M', 0);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n13', 'p13', 'Henry', 'Qualifier');
  database.prepare('INSERT INTO events (id, person_id, event_type, event_date_sort_key, event_place, event_date_qualifier) VALUES (?, ?, ?, ?, ?, ?)').run('e14', 'p13', 'birth', 18500101, null, 'about');
  database.prepare('INSERT INTO events (id, person_id, event_type, event_date_sort_key, event_place, event_date_qualifier) VALUES (?, ?, ?, ?, ?, ?)').run('e15', 'p13', 'death', 19200101, null, 'before');

  // p14: birth with qualifier 'after'
  ins.run('p14', 'F', 0);
  database.prepare('INSERT INTO names (id, person_id, given_name, surname, is_primary) VALUES (?, ?, ?, ?, 1)').run('n14', 'p14', 'Clara', 'Qualifier');
  database.prepare('INSERT INTO events (id, person_id, event_type, event_date_sort_key, event_place, event_date_qualifier) VALUES (?, ?, ?, ?, ?, ?)').run('e16', 'p14', 'birth', 18600301, null, 'after');

  // Family f4: p13 + p14 married with qualifier 'about'
  database.prepare('INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_sort_key, marriage_date_qualifier) VALUES (?, ?, ?, ?, ?, ?)').run('f4', 'p13', 'p14', 'ABT 1880', 18800101, 'about');
}

beforeAll(() => {
  db = new Database(':memory:');
  // Register the custom soundex_code function (same as in connection.ts)
  db.function('soundex_code', { deterministic: true }, (val: unknown) => {
    if (typeof val !== 'string' || val.length === 0) return null;
    return soundex(val);
  });
  seedDB(db);
});

afterAll(() => {
  db?.close();
});

describe('PersonRepository.findAll filters', () => {
  it('returns all persons with no filters', () => {
    const repo = new PersonRepository();
    const result = repo.findAll();
    expect(result.data).toHaveLength(14);
    expect(result.total_count).toBe(14);
  });

  it('filters by sex', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ sex: 'M' });
    expect(result.data.every(p => p.sex === 'M')).toBe(true);
    expect(result.total_count).toBe(7); // p1, p3, p6, p8, p10, p12, p13
  });

  it('filters by firstName (contains)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ firstName: 'oh' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('p1');
  });

  it('filters by firstName (startsWith)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ firstName: 'jo', nameMatchType: 'startsWith' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('p1');
  });

  it('filters by firstName (exact, case insensitive)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ firstName: 'john', nameMatchType: 'exact' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('p1');
  });

  it('filters by lastName', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ lastName: 'Smith' });
    expect(result.data).toHaveLength(2); // p1, p3
  });

  it('filters by firstName AND lastName together (same name row)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ firstName: 'John', lastName: 'Smith' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('p1');
  });

  it('filters by birth year range', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ birthYearFrom: 1945, birthYearTo: 1960 });
    expect(result.data).toHaveLength(4); // p2 (1950), p3 (1945), p8 (1950), p9 (1952)
    expect(result.total_count).toBe(4);
  });

  it('filters by birth year (from only)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ birthYearFrom: 1985 });
    expect(result.data).toHaveLength(1); // p4 (1990)
  });

  it('filters by death year range', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ deathYearFrom: 2015, deathYearTo: 2025 });
    expect(result.data).toHaveLength(1); // p2 (death 2020)
  });

  it('filters by place', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ place: 'London' });
    expect(result.data).toHaveLength(1); // p2
  });

  it('filters by placeCountry (structured)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ placeCountry: 'LA' });
    // p8 "New Orleans, LA", p9 "Baton Rouge, LA"
    expect(result.data.map((p: any) => p.id).sort()).toEqual(['p8', 'p9']);
  });

  it('filters by placeState (structured)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ placeState: 'IL' });
    // p3 "Chicago, IL"
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('p3');
  });

  it('filters by placeCity (structured)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ placeCity: 'Baton Rouge' });
    // p9 "Baton Rouge, LA"
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('p9');
  });

  it('filters by combined placeCity + placeCountry (AND logic)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ placeCity: 'New', placeCountry: 'LA' });
    // "New Orleans, LA" matches both — only p8
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('p8');
  });

  it('filters by hasPhoto', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ hasPhoto: true });
    expect(result.data).toHaveLength(1); // p1
    expect(result.data[0].id).toBe('p1');
  });

  it('filters by hasSources (direct person citation)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ hasSources: true });
    // p2 has direct citation, p3 has citation via event
    expect(result.data.map(p => p.id).sort()).toEqual(['p2', 'p3']);
  });

  it('filters by isLiving', () => {
    const repo = new PersonRepository();
    const living = repo.findAll({ isLiving: true });
    expect(living.data).toHaveLength(8); // p1, p4, p5, p7, p8, p9, p10, p11
    const deceased = repo.findAll({ isLiving: false });
    expect(deceased.data).toHaveLength(6); // p2, p3, p6, p12, p13, p14
  });

  it('combines multiple filters', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ sex: 'M', birthYearFrom: 1940, birthYearTo: 1950 });
    expect(result.data).toHaveLength(2); // p3 (Bob Smith, male, born 1945), p8 (Walter, male, born 1950)
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    expect(ids).toEqual(['p3', 'p8']);
  });

  it('returns total_count independent of pagination', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ limit: 2, sex: 'M' });
    expect(result.data).toHaveLength(2);
    expect(result.total_count).toBe(7); // p1, p3, p6, p8, p10, p12, p13
  });

  it('returns total_count for global search', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ search: 'Smith' });
    expect(result.total_count).toBe(2);
  });
});

// ---- Phase 2: Soundex & Missing Data ----

describe('PersonRepository.findAll Soundex matching', () => {
  it('matches firstName by soundex (Jon → John)', () => {
    const repo = new PersonRepository();
    // Jon and John have same soundex code: J500
    const result = repo.findAll({ firstName: 'Jon', nameMatchType: 'soundex' });
    expect(result.data.some(p => p.id === 'p1')).toBe(true); // John
  });

  it('matches lastName by soundex (Smyth → Smith)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ lastName: 'Smyth', nameMatchType: 'soundex' });
    // Smith and Smyth → S530
    expect(result.data.map(p => p.id).sort()).toEqual(['p1', 'p3']);
  });

  it('matches both first and last by soundex', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ firstName: 'Jon', lastName: 'Smyth', nameMatchType: 'soundex' });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('p1');
  });

  it('returns no results when soundex does not match', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ firstName: 'Zyx', nameMatchType: 'soundex' });
    expect(result.data).toHaveLength(0);
  });
});

describe('PersonRepository.findAll hasMissingData filter', () => {
  it('returns persons with missing data', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ hasMissingData: true });
    const ids = result.data.map(p => p.id).sort();
    // p5: living, has name "Unknown" but no birth event → missing
    // p6: no given_name (null) → missing; also deceased with no death → double missing
    // p7: no birth event → missing
    expect(ids).toContain('p5');
    expect(ids).toContain('p6');
    expect(ids).toContain('p7');
  });

  it('does NOT return persons with complete data', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ hasMissingData: true });
    const ids = result.data.map(p => p.id);
    // p2 (Jane Doe) and p3 (Bob Smith) have name + birth + death → complete
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p3');
  });

  it('combines hasMissingData with other filters', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ hasMissingData: true, sex: 'F' });
    // p7 (F, no birth) and p14 (F, deceased, no death event) have missing data
    expect(result.data).toHaveLength(2);
    const ids = result.data.map((r: any) => r.id).sort();
    expect(ids).toEqual(['p14', 'p7']);
  });
});

// ---- Phase 3: Marriage Year, Missing Events, Initial, Relationship ----

describe('PersonRepository.findAll marriage year filter', () => {
  it('filters by marriage year range', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ marriageYearFrom: 1975, marriageYearTo: 1980 });
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    // f1: p8+p9, married 1977 → both should match
    expect(ids).toContain('p8');
    expect(ids).toContain('p9');
    expect(ids).not.toContain('p1'); // married 2015
  });

  it('filters by marriage year from only', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ marriageYearFrom: 2010 });
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    // f3: p1+p4, married 2015
    expect(ids).toContain('p1');
    expect(ids).toContain('p4');
    expect(ids).not.toContain('p8'); // married 1977
  });

  it('filters by marriage year to only', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ marriageYearTo: 1980 });
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    expect(ids).toContain('p8');
    expect(ids).toContain('p9');
  });
});

describe('PersonRepository.findAll missing event filters', () => {
  it('filters by missingBirthDate', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ missingBirthDate: true });
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    // p5, p7 have no birth events
    expect(ids).toContain('p5');
    expect(ids).toContain('p7');
    // p1 has birth → should NOT be included
    expect(ids).not.toContain('p1');
  });

  it('filters by missingDeathDate', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ missingDeathDate: true });
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    // p6 is deceased with no death event
    expect(ids).toContain('p6');
    // p2 has death event → should NOT be included
    expect(ids).not.toContain('p2');
  });

  it('filters by missingMarriageDate', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ missingMarriageDate: true });
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    // p12 is spouse in f2 which has no marriage_date_sort_key
    expect(ids).toContain('p12');
    // p8 has marriage in f1 with sort key → should NOT be included
    expect(ids).not.toContain('p8');
  });
});

describe('PersonRepository.findAll initial/middle name search', () => {
  it('matches middle name "Earl"', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ initial: 'Earl' });
    const ids = result.data.map((p: { id: string }) => p.id);
    // p8: "Walter Earl" → matches
    expect(ids).toContain('p8');
    // p10: "James Walter" → does not have "Earl"
    expect(ids).not.toContain('p10');
  });

  it('matches middle initial "M"', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ initial: 'M' });
    const ids = result.data.map((p: { id: string }) => p.id);
    // p9: "Henrietta M" → matches
    expect(ids).toContain('p9');
  });

  it('matches partial middle name', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ initial: 'Wal' });
    const ids = result.data.map((p: { id: string }) => p.id);
    // p10: "James Walter" → "Walter" starts with "Wal"
    expect(ids).toContain('p10');
    // p8: "Walter Earl" → "Walter" is first word, LIKE '% Wal%' won't match
    expect(ids).not.toContain('p8');
  });
});

describe('PersonRepository.findAll relationship filter', () => {
  it('finds descendants of p8', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ relationshipType: 'descendant', homePersonId: 'p8' });
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    // p10, p11 are children of p8
    expect(ids).toContain('p10');
    expect(ids).toContain('p11');
    // p8 itself should not be included
    expect(ids).not.toContain('p8');
  });

  it('finds ancestors of p10', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ relationshipType: 'ancestor', homePersonId: 'p10' });
    const ids = result.data.map((p: { id: string }) => p.id).sort();
    // p8 is parent, p12 is grandparent (parent of p8)
    expect(ids).toContain('p8');
    expect(ids).toContain('p9');
    expect(ids).toContain('p12');
    // p10 itself should not be included
    expect(ids).not.toContain('p10');
  });

  it('finds siblings of p10', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ relationshipType: 'sibling', homePersonId: 'p10' });
    const ids = result.data.map((p: { id: string }) => p.id);
    // p11 is sibling (same family f1)
    expect(ids).toContain('p11');
    // p10 itself should not be included
    expect(ids).not.toContain('p10');
  });

  it('finds spouse of p8', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ relationshipType: 'spouse', homePersonId: 'p8' });
    const ids = result.data.map((p: { id: string }) => p.id);
    // p9 is spouse in f1
    expect(ids).toContain('p9');
    expect(ids).not.toContain('p8');
  });

  it('returns empty set for person with no relationships', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ relationshipType: 'descendant', homePersonId: 'p5' });
    expect(result.data).toHaveLength(0);
  });
});

// ---- Phase 5: FTS5 full-text search ----

describe('FTS5 global search', () => {
  it('finds person by FTS5 prefix match (multi-char)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ search: 'Smith' });
    expect(result.data).toHaveLength(2); // p1 John Smith, p3 Bob Smith
  });

  it('finds person by partial prefix (Wal → Walter)', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ search: 'Wal' });
    expect(result.data.some((p: any) => p.id === 'p8')).toBe(true); // Walter Earl LeFort
  });

  it('finds person by multi-token FTS query', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ search: 'Walter LeFort' });
    expect(result.data.some((p: any) => p.id === 'p8')).toBe(true);
  });

  it('falls back to LIKE for single-char queries', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({ search: 'J' });
    // Should still find John, Jane, James via LIKE fallback
    expect(result.data.length).toBeGreaterThanOrEqual(3);
  });

  it('handles special characters safely', () => {
    const repo = new PersonRepository();
    // Should not throw — operators stripped
    const result = repo.findAll({ search: 'John "OR" Smith' });
    expect(result.data.length).toBeGreaterThanOrEqual(0);
  });

  it('FTS trigger: name insert populates FTS', () => {
    // Verify FTS row exists for p1 (inserted via trigger during seed)
    const row = db.prepare("SELECT person_id, given_name, surname FROM persons_fts WHERE persons_fts MATCH 'John'").get() as any;
    expect(row).toBeDefined();
    expect(row.person_id).toBe('p1');
    expect(row.given_name).toContain('John');
  });

  it('FTS trigger: name update syncs FTS', () => {
    // Update p5's name and verify FTS reflects it
    db.prepare("UPDATE names SET given_name = 'Ulysses' WHERE id = 'n5'").run();
    const row = db.prepare("SELECT person_id, given_name FROM persons_fts WHERE persons_fts MATCH 'Ulysses'").get() as any;
    expect(row).toBeDefined();
    expect(row.person_id).toBe('p5');
    // Restore
    db.prepare("UPDATE names SET given_name = 'Unknown' WHERE id = 'n5'").run();
  });

  it('FTS trigger: notes update syncs FTS', () => {
    db.prepare("UPDATE persons SET notes = 'important genealogy note' WHERE id = 'p1'").run();
    const row = db.prepare("SELECT person_id, notes FROM persons_fts WHERE persons_fts MATCH 'genealogy'").get() as any;
    expect(row).toBeDefined();
    expect(row.person_id).toBe('p1');
    // Clean up
    db.prepare("UPDATE persons SET notes = NULL WHERE id = 'p1'").run();
  });
});

describe('PersonRepository.findAll date qualifier filters', () => {
  it('dateQualifier=exact filters to events with NULL or exact qualifier', () => {
    const repo = new PersonRepository();
    // p1 has birth with NULL qualifier (treated as exact), p13 has birth with 'about'
    const result = repo.findAll({
      birthYearFrom: 1800,
      birthYearTo: 2000,
      dateQualifier: 'exact',
    });
    const ids = result.data.map((r: any) => r.id);
    // p1 (1980, null/exact), p2 (1950, null/exact), p3 (1945, null/exact), p4 (1990, null/exact)
    // p8 (1950, null/exact), p9 (1952, null/exact), p10 (1975, null/exact), p11 (1978, null/exact), p12 (1920, null/exact)
    expect(ids).toContain('p1');
    expect(ids).toContain('p2');
    // p13 has 'about' qualifier — excluded
    expect(ids).not.toContain('p13');
    // p14 has 'after' qualifier — excluded
    expect(ids).not.toContain('p14');
  });

  it('dateQualifier=approximate filters to about/estimated/calculated/between', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({
      birthYearFrom: 1800,
      birthYearTo: 1900,
      dateQualifier: 'approximate',
    });
    const ids = result.data.map((r: any) => r.id);
    // p13 has birth 1850 with 'about' qualifier — included
    expect(ids).toContain('p13');
    // p14 has birth 1860 with 'after' qualifier — excluded
    expect(ids).not.toContain('p14');
  });

  it('dateQualifier=before on death events', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({
      deathYearFrom: 1900,
      deathYearTo: 1950,
      dateQualifier: 'before',
    });
    const ids = result.data.map((r: any) => r.id);
    // p13 has death 1920 with 'before' qualifier — included
    expect(ids).toContain('p13');
    // p2 has death 2020 with NULL qualifier (exact) — excluded by qualifier + range
    expect(ids).not.toContain('p2');
  });

  it('dateQualifier=after on birth events', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({
      birthYearFrom: 1850,
      birthYearTo: 1870,
      dateQualifier: 'after',
    });
    const ids = result.data.map((r: any) => r.id);
    // p14 has birth 1860 with 'after' — included
    expect(ids).toContain('p14');
    // p13 has birth 1850 with 'about' — excluded
    expect(ids).not.toContain('p13');
  });

  it('dateQualifier on marriage year range', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({
      marriageYearFrom: 1870,
      marriageYearTo: 1890,
      dateQualifier: 'approximate',
    });
    const ids = result.data.map((r: any) => r.id);
    // p13 + p14 married in family f4 with 'about' qualifier at 1880 — both included
    expect(ids).toContain('p13');
    expect(ids).toContain('p14');
  });

  it('dateQualifier on marriage excludes non-matching qualifiers', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({
      marriageYearFrom: 1870,
      marriageYearTo: 1890,
      dateQualifier: 'exact',
    });
    const ids = result.data.map((r: any) => r.id);
    // f4 has 'about' qualifier — not exact, so p13/p14 excluded
    expect(ids).not.toContain('p13');
    expect(ids).not.toContain('p14');
  });

  it('standalone dateQualifier (no year range) finds events by qualifier', () => {
    const repo = new PersonRepository();
    // Filter: approximate dates, no year range — matches any event type
    const result = repo.findAll({
      dateQualifier: 'approximate',
    });
    const ids = result.data.map((r: any) => r.id);
    // p13 has birth with 'about' — included
    expect(ids).toContain('p13');
    // p1 has birth with NULL (exact) — excluded
    expect(ids).not.toContain('p1');
  });

  it('standalone dateQualifier=exact with NULL COALESCE', () => {
    const repo = new PersonRepository();
    const result = repo.findAll({
      dateQualifier: 'exact',
    });
    const ids = result.data.map((r: any) => r.id);
    // p1 has birth with NULL qualifier (coalesced to exact) — included
    expect(ids).toContain('p1');
    // p13 has birth with 'about' — excluded
    expect(ids).not.toContain('p13');
  });
});

describe('PersonRepository.findAllForMatch', () => {
  it('returns each person with primary name and birth/death dates', () => {
    const repo = new PersonRepository();
    const p = repo.create({ sex: 'F', is_living: 0 });
    repo.addName(p.id, { given_name: 'Margaret', surname: 'Smith', is_primary: 1 });
    db.prepare("INSERT INTO events (id, person_id, event_type, event_date) VALUES ('e_marg_b', ?, 'birth', '1842-04-12')").run(p.id);
    db.prepare("INSERT INTO events (id, person_id, event_type, event_date) VALUES ('e_marg_d', ?, 'death', '1911-02-03')").run(p.id);

    const rows: MatchPersonInput[] = repo.findAllForMatch();
    const row = rows.find((r) => r.id === p.id);
    expect(row).toMatchObject({ givenName: 'Margaret', surname: 'Smith', birthDate: '1842-04-12', deathDate: '1911-02-03' });
  });

  it('returns null birth/death dates when events are absent', () => {
    const repo = new PersonRepository();
    // p7 in seed: Mary Wilson, no events at all
    const rows: MatchPersonInput[] = repo.findAllForMatch();
    const row = rows.find((r) => r.id === 'p7');
    expect(row).toBeDefined();
    expect(row!.givenName).toBe('Mary');
    expect(row!.surname).toBe('Wilson');
    expect(row!.birthDate).toBeNull();
    expect(row!.deathDate).toBeNull();
  });
});
