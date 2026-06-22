import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../../db/connection.js', () => ({ getDatabase: () => db }));

const { processImport, analyzeMerge } = await import('./importService.js');
const { ImportRepository } = await import('../../repositories/ImportRepository.js');

// ─── Minimal schema copied from backend/src/migrations/ ──────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS persons (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  sex TEXT CHECK (sex IN ('M', 'F', 'X', 'U')) DEFAULT 'U',
  is_living INTEGER NOT NULL DEFAULT 1,
  is_private INTEGER NOT NULL DEFAULT 0,
  gedcom_id TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS names (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  name_type TEXT NOT NULL DEFAULT 'birth' CHECK (name_type IN ('birth', 'married', 'aka', 'nickname', 'formal', 'religious')),
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
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'birth', 'death', 'burial', 'cremation', 'baptism', 'christening',
    'bar_mitzvah', 'bat_mitzvah', 'confirmation', 'first_communion',
    'graduation', 'immigration', 'emigration', 'naturalization',
    'census', 'residence', 'occupation', 'retirement',
    'military_service', 'medical', 'custom'
  )),
  event_date TEXT,
  event_date_qualifier TEXT CHECK (event_date_qualifier IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'estimated')),
  event_date_sort_key INTEGER,
  event_place TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  spouse1_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  spouse2_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  marriage_date TEXT,
  marriage_date_qualifier TEXT CHECK (marriage_date_qualifier IN ('exact', 'about', 'before', 'after', 'between', 'calculated', 'estimated')),
  marriage_date_sort_key INTEGER,
  marriage_place TEXT,
  divorce_date TEXT,
  divorce_place TEXT,
  gedcom_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'child' CHECK (role IN ('child', 'adopted', 'foster', 'step')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(family_id, person_id)
);

CREATE TABLE IF NOT EXISTS source_repositories (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  address TEXT,
  url TEXT,
  notes TEXT,
  gedcom_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  gedcom_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'awaiting_review', 'processing', 'completed', 'failed', 'cancelled')),
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gedcom_xref_map (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  xref TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('INDI', 'FAM', 'SOUR', 'REPO', 'OBJE', 'NOTE')),
  internal_id TEXT NOT NULL,
  internal_table TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(import_job_id, xref)
);

CREATE TABLE IF NOT EXISTS import_conflicts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  xref TEXT NOT NULL,
  record_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  existing_value TEXT,
  incoming_value TEXT,
  resolution TEXT CHECK (resolution IN ('skip', 'overwrite', 'merge', NULL)),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'skipped', 'merged', 'error')),
  record_type TEXT NOT NULL,
  xref TEXT,
  internal_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_merge_decisions (
  import_job_id TEXT NOT NULL,
  xref TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('same','new')),
  candidate_person_id TEXT,
  field_resolutions TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (import_job_id, xref)
);
`;

// Seed Margaret Smith with birth 1842 and death 1911 events
function seedMargaret(database: Database.Database): string {
  const personId = 'test-margaret-001';
  database.prepare(
    `INSERT INTO persons (id, sex, is_living, created_at, updated_at)
     VALUES (?, 'F', 0, datetime('now'), datetime('now'))`
  ).run(personId);
  database.prepare(
    `INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at)
     VALUES ('test-name-001', ?, 'birth', 'Margaret', 'Smith', 1, 0, datetime('now'), datetime('now'))`
  ).run(personId);
  database.prepare(
    `INSERT INTO events (id, person_id, event_type, event_date, event_date_sort_key, created_at, updated_at)
     VALUES ('test-evt-birth', ?, 'birth', '12 APR 1842', 18420412, datetime('now'), datetime('now'))`
  ).run(personId);
  database.prepare(
    `INSERT INTO events (id, person_id, event_type, event_date, event_date_sort_key, created_at, updated_at)
     VALUES ('test-evt-death', ?, 'death', '3 FEB 1911', 19110203, datetime('now'), datetime('now'))`
  ).run(personId);
  return personId;
}

// Seed a person with matching name but NO events at all.
// This is the critical case for the stale-snapshot bug:
// when birthPlace='new' is resolved and the candidate has no birth event,
// the resolution block CREATES a birth event; the stale snapshot misses it,
// so the add-events loop would insert a second copy.
function seedMargaretNoEvents(database: Database.Database): string {
  const personId = 'test-margaret-002';
  database.prepare(
    `INSERT INTO persons (id, sex, is_living, created_at, updated_at)
     VALUES (?, 'F', 0, datetime('now'), datetime('now'))`
  ).run(personId);
  database.prepare(
    `INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at)
     VALUES ('test-name-002', ?, 'birth', 'Margaret', 'Smith', 1, 0, datetime('now'), datetime('now'))`
  ).run(personId);
  // Intentionally NO events seeded — the incoming GEDCOM will supply them
  return personId;
}

// ─── Test GEDCOMs ─────────────────────────────────────────────────────────────

const GED = `0 HEAD
0 @I1@ INDI
1 NAME Margaret /Smith/
1 BIRT
2 DATE 12 APR 1842
1 DEAT
2 DATE 3 FEB 1911
0 TRLR
`;

// Incoming GEDCOM: Margaret Smith with a birth place included
const GED_WITH_BIRTH_PLACE = `0 HEAD
0 @I1@ INDI
1 NAME Margaret /Smith/
1 BIRT
2 DATE 12 APR 1842
2 PLAC Springfield, IL
1 DEAT
2 DATE 3 FEB 1911
0 TRLR
`;

// GEDCOM with a single source, no persons
const GED_WITH_SOURCE = (title: string, author: string) => `0 HEAD
0 @S1@ SOUR
1 TITL ${title}
1 AUTH ${author}
0 TRLR
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(SCHEMA);
  seedMargaret(db);
});

afterEach(() => db.close());

describe('merge processing', () => {
  it('links a strong-matched person instead of creating a duplicate, and is idempotent', () => {
    const importRepo = new ImportRepository();
    const job = importRepo.createJob({ user_id: 'u1', filename: 't.ged', file_size: GED.length });

    const analysis = analyzeMerge(job.id, GED);
    expect(analysis.persons).toHaveLength(1);
    const incoming = analysis.persons[0];
    expect(incoming.tier).toBe('strong');
    expect(incoming.candidate).not.toBeNull();

    importRepo.saveMergeDecision({
      import_job_id: job.id,
      xref: '@I1@',
      decision: 'same',
      candidate_person_id: incoming.candidate!.id,
      field_resolutions: '{}',
    });

    const before = (db.prepare('SELECT COUNT(*) c FROM persons').get() as { c: number }).c;
    processImport(job.id, GED, 'u1', 'merge');
    const after = (db.prepare('SELECT COUNT(*) c FROM persons').get() as { c: number }).c;
    expect(after).toBe(before); // linked, not created
  });

  it('creates a new person when no merge decision is saved (mode=merge, new path)', () => {
    const importRepo = new ImportRepository();
    const job = importRepo.createJob({ user_id: 'u1', filename: 't.ged', file_size: GED.length });

    // No decision saved — should fall through to create path
    const before = (db.prepare('SELECT COUNT(*) c FROM persons').get() as { c: number }).c;
    processImport(job.id, GED, 'u1', 'merge');
    const after = (db.prepare('SELECT COUNT(*) c FROM persons').get() as { c: number }).c;
    expect(after).toBe(before + 1);
  });

  it('creates a new person in default (new) mode even when existing matches', () => {
    const importRepo = new ImportRepository();
    const job = importRepo.createJob({ user_id: 'u1', filename: 't.ged', file_size: GED.length });

    const before = (db.prepare('SELECT COUNT(*) c FROM persons').get() as { c: number }).c;
    processImport(job.id, GED, 'u1'); // default mode = 'new'
    const after = (db.prepare('SELECT COUNT(*) c FROM persons').get() as { c: number }).c;
    expect(after).toBe(before + 1);
  });

  it('analyzeMerge identifies strong match with correct candidate id', () => {
    const importRepo = new ImportRepository();
    const job = importRepo.createJob({ user_id: 'u1', filename: 't.ged', file_size: GED.length });

    const analysis = analyzeMerge(job.id, GED);
    expect(analysis.counts.strong).toBe(1);
    expect(analysis.counts.partial).toBe(0);
    expect(analysis.counts.none).toBe(0);
    expect(analysis.persons[0].candidate?.id).toBe('test-margaret-001');
  });

  it('field-resolution birthPlace=new does not create a duplicate birth event when candidate has no prior birth event', () => {
    // Seed a person with NO events. With the stale-snapshot bug, the resolution block
    // creates a birth event, but the add-events loop (reading the stale snapshot) would
    // insert a second birth event — resulting in 2 rows. The fix re-reads events AFTER
    // resolution so the loop sees the already-created event and skips it.
    const candidateId = seedMargaretNoEvents(db);

    const importRepo = new ImportRepository();
    const ged = GED_WITH_BIRTH_PLACE;
    const job = importRepo.createJob({ user_id: 'u1', filename: 'place.ged', file_size: ged.length });

    // Save a 'same' decision linking incoming @I1@ to candidateId,
    // with birthPlace='new' — triggers the CREATE branch in the resolution block.
    importRepo.saveMergeDecision({
      import_job_id: job.id,
      xref: '@I1@',
      decision: 'same',
      candidate_person_id: candidateId,
      field_resolutions: JSON.stringify({ birthPlace: 'new' }),
    });

    const birthEventsBefore = (
      db.prepare(`SELECT COUNT(*) c FROM events WHERE person_id = ? AND event_type = 'birth'`)
        .get(candidateId) as { c: number }
    ).c;
    expect(birthEventsBefore).toBe(0); // sanity: no existing birth event

    processImport(job.id, ged, 'u1', 'merge');

    // After merge: exactly ONE birth event (not two), with the incoming place
    const birthEvents = db
      .prepare(`SELECT * FROM events WHERE person_id = ? AND event_type = 'birth'`)
      .all(candidateId) as Array<{ id: string; event_place: string | null }>;

    expect(birthEvents).toHaveLength(1);
    expect(birthEvents[0].event_place).toBe('Springfield, IL');
  });

  it('source dedupe: importing a source with the same title+author does not insert a second source row', () => {
    const TITLE = 'Census Records 1880';
    const AUTHOR = 'National Archive';

    // Seed an existing source
    db.prepare(
      `INSERT INTO sources (id, title, author, created_at, updated_at)
       VALUES ('existing-source-001', ?, ?, datetime('now'), datetime('now'))`
    ).run(TITLE, AUTHOR);

    const countBefore = (db.prepare('SELECT COUNT(*) c FROM sources').get() as { c: number }).c;
    expect(countBefore).toBe(1);

    const ged = GED_WITH_SOURCE(TITLE, AUTHOR);
    const importRepo = new ImportRepository();
    const job = importRepo.createJob({ user_id: 'u1', filename: 'sources.ged', file_size: ged.length });

    processImport(job.id, ged, 'u1', 'merge');

    const countAfter = (db.prepare('SELECT COUNT(*) c FROM sources').get() as { c: number }).c;
    expect(countAfter).toBe(countBefore); // deduped — no new row
  });
});

// ─── Gap-fill tests ───────────────────────────────────────────────────────────

describe('gap-fill blank fields on merge', () => {
  // These tests use a fresh in-memory DB per test to avoid colliding with the
  // global Margaret seed (test-margaret-001 / @I1@). They use @I2@ xref and
  // a separate person id.

  let gapDb: Database.Database;

  beforeEach(() => {
    gapDb = new Database(':memory:');
    gapDb.exec(SCHEMA);
    // Point the module-level mock to gapDb for these tests
    db = gapDb;
  });

  afterEach(() => {
    gapDb.close();
    // Restore db to a fresh instance so the outer afterEach doesn't crash
    db = new Database(':memory:');
    db.exec(SCHEMA);
    seedMargaret(db);
  });

  const GED_JOHN_SMITH = `0 HEAD
0 @I2@ INDI
1 NAME John /Smith/
0 TRLR
`;

  it("gap-fills blank givenName from incoming GEDCOM on 'same' decision with empty fieldResolutions", () => {
    // Seed a person with surname='Smith' but given_name=NULL
    const personId = 'test-john-001';
    gapDb.prepare(
      `INSERT INTO persons (id, sex, is_living, created_at, updated_at)
       VALUES (?, 'U', 1, datetime('now'), datetime('now'))`
    ).run(personId);
    gapDb.prepare(
      `INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at)
       VALUES ('test-john-name-001', ?, 'birth', NULL, 'Smith', 1, 0, datetime('now'), datetime('now'))`
    ).run(personId);

    const importRepo = new ImportRepository();
    const job = importRepo.createJob({ user_id: 'u1', filename: 'john.ged', file_size: GED_JOHN_SMITH.length });

    importRepo.saveMergeDecision({
      import_job_id: job.id,
      xref: '@I2@',
      decision: 'same',
      candidate_person_id: personId,
      field_resolutions: '{}',
    });

    processImport(job.id, GED_JOHN_SMITH, 'u1', 'merge');

    const nameRow = gapDb
      .prepare(`SELECT given_name, surname FROM names WHERE person_id = ?`)
      .get(personId) as { given_name: string | null; surname: string | null };

    // given_name was blank — should now be gap-filled from incoming
    expect(nameRow.given_name).toBe('John');
    // surname was non-blank — should remain unchanged
    expect(nameRow.surname).toBe('Smith');
  });

  it('does NOT overwrite a non-blank existing givenName even when incoming differs and fieldResolutions is empty', () => {
    // Seed a person with given_name='Bob', surname='Smith'
    const personId = 'test-bob-001';
    gapDb.prepare(
      `INSERT INTO persons (id, sex, is_living, created_at, updated_at)
       VALUES (?, 'U', 1, datetime('now'), datetime('now'))`
    ).run(personId);
    gapDb.prepare(
      `INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at)
       VALUES ('test-bob-name-001', ?, 'birth', 'Bob', 'Smith', 1, 0, datetime('now'), datetime('now'))`
    ).run(personId);

    const importRepo = new ImportRepository();
    const job = importRepo.createJob({ user_id: 'u1', filename: 'john.ged', file_size: GED_JOHN_SMITH.length });

    // Incoming has givenName='John' but existing has 'Bob'; empty fieldResolutions → no explicit overwrite
    importRepo.saveMergeDecision({
      import_job_id: job.id,
      xref: '@I2@',
      decision: 'same',
      candidate_person_id: personId,
      field_resolutions: '{}',
    });

    processImport(job.id, GED_JOHN_SMITH, 'u1', 'merge');

    const nameRow = gapDb
      .prepare(`SELECT given_name, surname FROM names WHERE person_id = ?`)
      .get(personId) as { given_name: string | null; surname: string | null };

    // given_name was non-blank ('Bob') — must NOT be overwritten
    expect(nameRow.given_name).toBe('Bob');
    expect(nameRow.surname).toBe('Smith');
  });
});
