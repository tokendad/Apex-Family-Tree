import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { PersonRepository } = await import('./PersonRepository.js');

/** Inserts a child whose row order deliberately differs from their birth order. */
function addChild(familyId: string, id: string, given: string, birth: number | null, sortOrder: number) {
  db.prepare("INSERT INTO persons (id, sex, is_living, is_private, created_at, updated_at) VALUES (?, 'U', 0, 0, '2026-01-01', '2026-01-01')").run(id);
  db.prepare("INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at) VALUES (?, ?, 'birth', ?, 'Lagor', 1, 0, '2026-01-01', '2026-01-01')")
    .run(`n-${id}`, id, given);
  db.prepare("INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at) VALUES (?, ?, ?, 'child', ?, '2026-01-01')")
    .run(`fm-${id}`, familyId, id, sortOrder);
  if (birth !== null) {
    db.prepare("INSERT INTO events (id, person_id, event_type, event_date, event_date_sort_key, created_at, updated_at) VALUES (?, ?, 'birth', ?, ?, '2026-01-01', '2026-01-01')")
      .run(`e-${id}`, id, String(birth), birth);
  }
}

function siblingOrder(personId: string): string[] {
  const rels = new PersonRepository().getRelationshipsForDetail(personId);
  const childFamily = rels.find((r) => r.type === 'child_family')!;
  return childFamily.children.map((c) => c.given_name!);
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE persons (id TEXT PRIMARY KEY, sex TEXT, is_living INTEGER, is_private INTEGER,
      gedcom_id TEXT, notes TEXT, display_name TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE names (id TEXT PRIMARY KEY, person_id TEXT, name_type TEXT, prefix TEXT,
      given_name TEXT, middle_name TEXT, surname TEXT, suffix TEXT, nickname TEXT,
      is_primary INTEGER, sort_order INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE families (id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT,
      marriage_date TEXT, marriage_date_qualifier TEXT, marriage_date_sort_key INTEGER,
      marriage_place TEXT, divorce_date TEXT, divorce_place TEXT, gedcom_id TEXT,
      created_at TEXT, updated_at TEXT);
    CREATE TABLE family_members (id TEXT PRIMARY KEY, family_id TEXT, person_id TEXT,
      role TEXT, sort_order INTEGER, created_at TEXT);
    CREATE TABLE events (id TEXT PRIMARY KEY, person_id TEXT, family_id TEXT, event_type TEXT,
      event_date TEXT, event_date_qualifier TEXT, event_date_sort_key INTEGER,
      event_place TEXT, description TEXT, created_at TEXT, updated_at TEXT);
  `);
  db.prepare("INSERT INTO families (id, created_at, updated_at) VALUES ('f1', '2026-01-01', '2026-01-01')").run();
});

afterEach(() => db.close());

describe('children and siblings are listed oldest first', () => {
  /* The real case: Eunice's own family came back Albert, Eunice, Alfred when
     Alfred was born before her. */
  it('orders by birth date, not by the order the rows were written', () => {
    addChild('f1', 'p-albert', 'Albert', 19150101, 0);
    addChild('f1', 'p-eunice', 'Eunice', 19261012, 1);
    addChild('f1', 'p-alfred', 'Alfred', 19240101, 2);

    expect(siblingOrder('p-eunice')).toEqual(['Albert', 'Alfred', 'Eunice']);
  });

  /* sort_order only records the order children were entered, so a child added
     years later sits at the end of it whenever they were born. */
  it('prefers the birth date over the entry order', () => {
    addChild('f1', 'p-late', 'Firstborn', 19400101, 99);
    addChild('f1', 'p-early', 'Secondborn', 19450101, 0);

    expect(siblingOrder('p-early')).toEqual(['Firstborn', 'Secondborn']);
  });

  /* A child with no recorded birth is not a child born in year zero. */
  it('puts children with no birth date after the dated ones', () => {
    addChild('f1', 'p-known', 'Dated', 19500101, 1);
    addChild('f1', 'p-unknown', 'Undated', null, 0);

    expect(siblingOrder('p-known')).toEqual(['Dated', 'Undated']);
  });

  it('falls back to entry order when nobody has a birth date', () => {
    addChild('f1', 'p-a', 'First', null, 0);
    addChild('f1', 'p-b', 'Second', null, 1);

    expect(siblingOrder('p-a')).toEqual(['First', 'Second']);
  });

  /* A second birth row must not clone the child into the list. */
  it('lists a child once even with a duplicate birth event', () => {
    addChild('f1', 'p-one', 'Only', 19500101, 0);
    db.prepare("INSERT INTO events (id, person_id, event_type, event_date, event_date_sort_key, created_at, updated_at) VALUES ('e-dup', 'p-one', 'birth', '1950', 19500000, '2026-01-01', '2026-01-01')").run();

    expect(siblingOrder('p-one')).toEqual(['Only']);
  });
});
