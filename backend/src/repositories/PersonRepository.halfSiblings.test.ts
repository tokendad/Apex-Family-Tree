import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { PersonRepository } = await import('./PersonRepository.js');

let seq = 0;

function addPerson(id: string, given: string, birth: number | null = null) {
  db.prepare("INSERT INTO persons (id, sex, is_living, is_private, created_at, updated_at) VALUES (?, 'U', 0, 0, '2026-01-01', '2026-01-01')").run(id);
  db.prepare("INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at) VALUES (?, ?, 'birth', ?, 'LeFort', 1, 0, '2026-01-01', '2026-01-01')")
    .run(`n-${id}`, id, given);
  if (birth !== null) {
    db.prepare("INSERT INTO events (id, person_id, event_type, event_date, event_date_sort_key, created_at, updated_at) VALUES (?, ?, 'birth', ?, ?, '2026-01-01', '2026-01-01')")
      .run(`e-${id}`, id, String(birth), birth);
  }
}

function addFamily(id: string, spouse1: string | null, spouse2: string | null) {
  db.prepare("INSERT INTO families (id, spouse1_id, spouse2_id, created_at, updated_at) VALUES (?, ?, ?, '2026-01-01', '2026-01-01')")
    .run(id, spouse1, spouse2);
}

/** Puts an existing person into a family as a child, with an optional role. */
function addMember(familyId: string, personId: string, role = 'child') {
  db.prepare("INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?, '2026-01-01')")
    .run(`fm-${familyId}-${personId}`, familyId, personId, role, seq++);
}

function childFamilyOf(personId: string) {
  const rels = new PersonRepository().getRelationshipsForDetail(personId);
  return rels.find((r) => r.type === 'child_family')!;
}

const names = (rows: { given_name: string | null }[]) => rows.map((r) => r.given_name);

beforeEach(() => {
  seq = 0;
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
});

afterEach(() => db.close());

describe('half-siblings', () => {
  /* The reported case. Raymond Jr's panel listed only Raymond Sr and Eunice's
     children; Raymond Sr's two by Betty Mercier appeared nowhere. */
  it("lists a father's children by another wife, labelled with the father", () => {
    addPerson('ray-sr', 'RaymondSr');
    addPerson('eunice', 'Eunice');
    addPerson('betty', 'Betty');
    addFamily('f-ray-eunice', 'ray-sr', 'eunice');
    addPerson('ray-jr', 'RaymondJr', 19540101);
    addPerson('cheryle', 'Cheryle', 19560101);
    addMember('f-ray-eunice', 'ray-jr');
    addMember('f-ray-eunice', 'cheryle');
    addFamily('f-ray-betty', 'ray-sr', 'betty');
    addPerson('harold', 'Harold', 19480101);
    addPerson('lucinda', 'Lucinda', 19500101);
    addMember('f-ray-betty', 'harold');
    addMember('f-ray-betty', 'lucinda');

    const family = childFamilyOf('ray-jr');
    expect(names(family.children)).toEqual(['RaymondJr', 'Cheryle']);
    expect(family.half_siblings).toHaveLength(1);
    expect(family.half_siblings[0].via.given_name).toBe('RaymondSr');
    expect(names(family.half_siblings[0].children)).toEqual(['Harold', 'Lucinda']);
    expect(family.step_siblings).toEqual([]);
  });

  /* Eunice's own five unions are the other side of the same gap: her children
     by Bernard Cabana are half-siblings to her children by Raymond LeFort. */
  it("lists a mother's children by another husband, labelled with the mother", () => {
    addPerson('eunice', 'Eunice');
    addPerson('ray-sr', 'RaymondSr');
    addPerson('bernard', 'Bernard');
    addFamily('f-ray', 'ray-sr', 'eunice');
    addPerson('ray-jr', 'RaymondJr', 19540101);
    addMember('f-ray', 'ray-jr');
    addFamily('f-cabana', 'bernard', 'eunice');
    addPerson('cabana-kid', 'Dennis', 19490101);
    addMember('f-cabana', 'cabana-kid');

    const family = childFamilyOf('ray-jr');
    expect(family.half_siblings).toHaveLength(1);
    expect(family.half_siblings[0].via.given_name).toBe('Eunice');
    expect(names(family.half_siblings[0].children)).toEqual(['Dennis']);
  });

  /* With both parents remarried an unqualified list is uninterpretable, so
     each side is its own group named after the parent it runs through. */
  it('groups each side under the parent it runs through', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('other-wife', 'OtherWife');
    addPerson('other-husband', 'OtherHusband');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'other-wife');
    addPerson('dads-kid', 'DadsKid', 19700101);
    addMember('f-dad-2', 'dads-kid');
    addFamily('f-mum-2', 'other-husband', 'mum');
    addPerson('mums-kid', 'MumsKid', 19500101);
    addMember('f-mum-2', 'mums-kid');

    const family = childFamilyOf('subject');
    expect(family.half_siblings.map((g) => [g.via.given_name, names(g.children)])).toEqual([
      ['Dad', ['DadsKid']],
      ['Mum', ['MumsKid']],
    ]);
  });

  /* The birth-order rule has to hold across the parent's unions, not just
     within each one, or the list is only locally sorted. */
  it('orders half-siblings by birth date across the parent\'s other unions', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('wife-b', 'WifeB');
    addPerson('wife-c', 'WifeC');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-b', 'dad', 'wife-b');
    addFamily('f-c', 'dad', 'wife-c');
    addPerson('late-b', 'Youngest', 19800101);
    addPerson('early-c', 'Oldest', 19400101);
    addPerson('mid-b', 'Middle', 19500101);
    addMember('f-b', 'late-b');
    addMember('f-b', 'mid-b');
    addMember('f-c', 'early-c');

    expect(names(childFamilyOf('subject').half_siblings[0].children)).toEqual([
      'Oldest', 'Middle', 'Youngest',
    ]);
  });

  /* A couple recorded as two families -- which an import can produce -- share
     both parents, so their children are full siblings, not half ones. */
  it('does not treat a duplicate union of the same couple as a second marriage', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dup', 'dad', 'mum');
    addPerson('full-sib', 'FullSib', 19620101);
    addMember('f-dup', 'full-sib');

    expect(childFamilyOf('subject').half_siblings).toEqual([]);
  });

  /* Somebody who is already a full sibling must not be listed twice because
     their parent also recorded them in a later union. */
  it('lists a full sibling once, not again as a half-sibling', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('wife-2', 'WifeTwo');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addPerson('sib', 'Sib', 19620101);
    addMember('f-main', 'subject');
    addMember('f-main', 'sib');
    addFamily('f-dad-2', 'dad', 'wife-2');
    addMember('f-dad-2', 'sib');

    const family = childFamilyOf('subject');
    expect(names(family.children)).toEqual(['Subject', 'Sib']);
    expect(family.half_siblings).toEqual([]);
  });

  it('never lists the subject as their own half-sibling', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('wife-2', 'WifeTwo');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'wife-2');
    addMember('f-dad-2', 'subject', 'step');

    const family = childFamilyOf('subject');
    expect(family.half_siblings).toEqual([]);
    expect(family.step_siblings).toEqual([]);
  });

  /* role carries child | adopted | foster | step, and the panel never showed
     it. An adopted child of the same couple is still a sibling; the role is
     passed through so the page can say which kind. */
  it('passes the membership role through on every row', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('wife-2', 'WifeTwo');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addPerson('adoptee', 'Adoptee', 19610101);
    addMember('f-main', 'subject');
    addMember('f-main', 'adoptee', 'adopted');
    addFamily('f-dad-2', 'dad', 'wife-2');
    addPerson('foster', 'Foster', 19700101);
    addMember('f-dad-2', 'foster', 'foster');

    const family = childFamilyOf('subject');
    expect(family.children.map((c) => c.role)).toEqual(['child', 'adopted']);
    expect(family.half_siblings[0].children[0].role).toBe('foster');
  });
});

describe('step-parents', () => {
  /* The panel showed only the two parents of the one family, so a parent's
     later marriage left no trace on the page at all. */
  it("lists a parent's later spouse, labelled with the parent they married", () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('stepmum', 'StepMum');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'stepmum');

    const family = childFamilyOf('subject');
    expect(family.step_parents).toHaveLength(1);
    expect(family.step_parents[0].via.given_name).toBe('Dad');
    expect(family.step_parents[0].people.map((p) => p.given_name)).toEqual(['StepMum']);
  });

  /* A step-parent who brought no children of their own is still who the
     subject grew up with, and is the only sign that parent remarried. */
  it('lists a step-parent who brought no children', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('childless', 'Childless');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'childless');

    const family = childFamilyOf('subject');
    expect(family.step_parents[0].people.map((p) => p.given_name)).toEqual(['Childless']);
    expect(family.half_siblings).toEqual([]);
    expect(family.step_siblings).toEqual([]);
  });

  it('groups each side under the parent who remarried', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('stepmum', 'StepMum');
    addPerson('stepdad', 'StepDad');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'stepmum');
    addFamily('f-mum-2', 'stepdad', 'mum');

    expect(
      childFamilyOf('subject').step_parents.map((g) => [
        g.via.given_name,
        g.people.map((p) => p.given_name),
      ]),
    ).toEqual([
      ['Dad', ['StepMum']],
      ['Mum', ['StepDad']],
    ]);
  });

  /* Eunice had five unions. Earliest marriage first, undated last. */
  it('orders several step-parents by marriage date, undated last', () => {
    addPerson('mum', 'Eunice');
    addPerson('dad', 'RaymondSr');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19540101);
    addMember('f-main', 'subject');
    addPerson('third', 'Third');
    addPerson('first', 'First');
    addPerson('undated', 'Undated');
    db.prepare("INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date_sort_key, created_at, updated_at) VALUES ('f-3', 'mum', 'third', 19700101, '2026-01-01', '2026-01-01')").run();
    db.prepare("INSERT INTO families (id, spouse1_id, spouse2_id, created_at, updated_at) VALUES ('f-u', 'mum', 'undated', '2026-01-01', '2026-01-01')").run();
    db.prepare("INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date_sort_key, created_at, updated_at) VALUES ('f-1', 'mum', 'first', 19450101, '2026-01-01', '2026-01-01')").run();

    expect(childFamilyOf('subject').step_parents[0].people.map((p) => p.given_name)).toEqual([
      'First', 'Third', 'Undated',
    ]);
  });

  /* The other parent is not a step-parent, however the union was recorded. */
  it('never lists the subject\'s own other parent as a step-parent', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dup', 'dad', 'mum');

    expect(childFamilyOf('subject').step_parents).toEqual([]);
  });

  it('lists a step-parent once when the couple holds two union rows', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('stepmum', 'StepMum');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'stepmum');
    addFamily('f-dad-3', 'dad', 'stepmum');

    expect(childFamilyOf('subject').step_parents[0].people.map((p) => p.given_name)).toEqual([
      'StepMum',
    ]);
  });

  it('carries no step-parents on the subject\'s own family', () => {
    addPerson('subject', 'Subject');
    addPerson('spouse', 'Spouse');
    addFamily('f-own', 'subject', 'spouse');

    const rels = new PersonRepository().getRelationshipsForDetail('subject');
    expect(rels.find((r) => r.type === 'parent_family')!.step_parents).toEqual([]);
  });
});

describe('step-siblings', () => {
  /* The children of the woman the subject's father went on to marry share no
     ancestor with the subject, so they are their own list. */
  it("lists the later spouse's children by someone else, under both names", () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('stepmum', 'StepMum');
    addPerson('her-first-husband', 'HerFirst');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'stepmum');
    addFamily('f-stepmum-1', 'her-first-husband', 'stepmum');
    addPerson('step-kid', 'StepKid', 19580101);
    addMember('f-stepmum-1', 'step-kid');

    const family = childFamilyOf('subject');
    expect(family.half_siblings).toEqual([]);
    expect(family.step_siblings).toHaveLength(1);
    expect(family.step_siblings[0].via.given_name).toBe('Dad');
    expect(family.step_siblings[0].step_parent?.given_name).toBe('StepMum');
    expect(names(family.step_siblings[0].children)).toEqual(['StepKid']);
  });

  /* A `step` membership in the parent's later family says the child came in
     with the other spouse, so they are a step-sibling and not a half one --
     the distinction the role column already records. */
  it('reads a step membership in the later family as step, not half', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('stepmum', 'StepMum');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'stepmum');
    addPerson('hers', 'Hers', 19550101);
    addPerson('theirs', 'Theirs', 19750101);
    addMember('f-dad-2', 'hers', 'step');
    addMember('f-dad-2', 'theirs');

    const family = childFamilyOf('subject');
    expect(names(family.half_siblings[0].children)).toEqual(['Theirs']);
    expect(names(family.step_siblings[0].children)).toEqual(['Hers']);
    expect(family.step_siblings[0].step_parent?.given_name).toBe('StepMum');
  });

  /* Half beats step: a child of the subject's own parent is a half-sibling
     even though they are also the step-parent's child. */
  it('prefers the closer relationship when a child qualifies for both', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('stepmum', 'StepMum');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'stepmum');
    addPerson('shared', 'Shared', 19700101);
    addMember('f-dad-2', 'shared');
    /* The same child also recorded in a family of the step-mother alone. */
    addFamily('f-stepmum-solo', 'stepmum', null);
    addMember('f-stepmum-solo', 'shared');

    const family = childFamilyOf('subject');
    expect(names(family.half_siblings[0].children)).toEqual(['Shared']);
    expect(family.step_siblings).toEqual([]);
  });

  /* The father's later wife had an earlier child by the subject's own mother,
     so that child is a half-sibling through the mother. Classifying the
     father's side first would have fixed them as a step-sibling, which is why
     half is collected for both parents before either step pass. */
  it("prefers a half link through the other parent over a step link", () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addPerson('stepmum', 'StepMum');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', 'stepmum');
    /* The step-mother's earlier union -- with the subject's own mother. */
    addFamily('f-stepmum-mum', 'stepmum', 'mum');
    addPerson('shared', 'Shared', 19520101);
    addMember('f-stepmum-mum', 'shared');

    const family = childFamilyOf('subject');
    expect(family.half_siblings.map((g) => [g.via.given_name, names(g.children)])).toEqual([
      ['Mum', ['Shared']],
    ]);
    expect(family.step_siblings).toEqual([]);
  });

  it('records no step-parent when the later spouse is unknown', () => {
    addPerson('dad', 'Dad');
    addPerson('mum', 'Mum');
    addFamily('f-main', 'dad', 'mum');
    addPerson('subject', 'Subject', 19600101);
    addMember('f-main', 'subject');
    addFamily('f-dad-2', 'dad', null);
    addPerson('hers', 'Hers', 19550101);
    addMember('f-dad-2', 'hers', 'step');

    const family = childFamilyOf('subject');
    expect(family.step_siblings[0].step_parent).toBeNull();
    expect(names(family.step_siblings[0].children)).toEqual(['Hers']);
  });
});

describe("the subject's own families", () => {
  it('carries no sibling groups on a parent family', () => {
    addPerson('subject', 'Subject');
    addPerson('spouse', 'Spouse');
    addFamily('f-own', 'subject', 'spouse');
    addPerson('kid', 'Kid', 19900101);
    addMember('f-own', 'kid');

    const rels = new PersonRepository().getRelationshipsForDetail('subject');
    const own = rels.find((r) => r.type === 'parent_family')!;
    expect(own.half_siblings).toEqual([]);
    expect(own.step_siblings).toEqual([]);
  });
});
