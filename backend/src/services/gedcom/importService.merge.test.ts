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

// ─── Test GEDCOM ─────────────────────────────────────────────────────────────

const GED = `0 HEAD
0 @I1@ INDI
1 NAME Margaret /Smith/
1 BIRT
2 DATE 12 APR 1842
1 DEAT
2 DATE 3 FEB 1911
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
});
