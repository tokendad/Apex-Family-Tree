import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../../db/connection.js', () => ({ getDatabase: () => db }));

const {
  getTreeIssueSummary,
  listTreeIssues,
  scanTreeIssues,
  updateTreeIssue,
} = await import('./treeIssues.js');

function createSchema() {
  db.exec(`
    CREATE TABLE persons (
      id TEXT PRIMARY KEY,
      sex TEXT,
      is_living INTEGER,
      is_private INTEGER,
      gedcom_id TEXT,
      notes TEXT,
      display_name TEXT,
      created_by TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE names (
      id TEXT PRIMARY KEY,
      person_id TEXT,
      name_type TEXT,
      prefix TEXT,
      given_name TEXT,
      middle_name TEXT,
      surname TEXT,
      suffix TEXT,
      nickname TEXT,
      is_primary INTEGER,
      sort_order INTEGER,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      person_id TEXT,
      event_type TEXT,
      event_date TEXT,
      event_date_qualifier TEXT,
      event_date_sort_key INTEGER,
      event_place TEXT,
      description TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE families (
      id TEXT PRIMARY KEY,
      spouse1_id TEXT,
      spouse2_id TEXT,
      marriage_date TEXT,
      marriage_date_qualifier TEXT,
      marriage_date_sort_key INTEGER,
      marriage_place TEXT,
      divorce_date TEXT,
      divorce_place TEXT,
      gedcom_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE family_members (
      id TEXT PRIMARY KEY,
      family_id TEXT,
      person_id TEXT,
      role TEXT,
      sort_order INTEGER,
      created_at TEXT
    );

    CREATE TABLE import_conflicts (
      id TEXT PRIMARY KEY,
      import_job_id TEXT,
      xref TEXT,
      record_type TEXT,
      field_name TEXT,
      existing_value TEXT,
      incoming_value TEXT,
      resolution TEXT,
      resolved_at TEXT,
      created_at TEXT
    );

    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE data_quality_issues (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      primary_entity_type TEXT NOT NULL,
      primary_entity_id TEXT NOT NULL,
      related_entities_json TEXT NOT NULL,
      fingerprint TEXT NOT NULL UNIQUE,
      detected_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      resolved_at TEXT,
      dismissed_at TEXT,
      note TEXT
    );
  `);
}

function insertPerson(id: string, displayName: string | null, isLiving = 1) {
  db.prepare(`
    INSERT INTO persons (id, sex, is_living, is_private, display_name, created_at, updated_at)
    VALUES (?, 'U', ?, 0, ?, '2026-01-01', '2026-01-01')
  `).run(id, isLiving, displayName);

  if (displayName) {
    const [givenName, ...surnameParts] = displayName.split(' ');
    db.prepare(`
      INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at)
      VALUES (?, ?, 'birth', ?, ?, 1, 0, '2026-01-01', '2026-01-01')
    `).run(`name-${id}`, id, givenName, surnameParts.join(' ') || null);
  }
}

function seedIssueFixture() {
  for (const [id, name, living] of [
    ['p1', 'John Doe', 1],
    ['p2', 'Jane Alpha', 1],
    ['p3', 'Janet Beta', 1],
    ['p4', 'Mary Gone', 0],
    ['p5', 'Mark Living', 1],
    ['p6', null, 0],
    ['p7', 'Event Only', 1],
    ['p8', 'Family Only One', 1],
    ['p9', 'Family Only Two', 1],
    ['p10', 'Unconnected Person', 1],
  ] as const) {
    insertPerson(id, name, living);
  }

  db.exec(`
    INSERT INTO events (id, person_id, event_type, event_date, event_date_sort_key, created_at, updated_at)
    VALUES
      ('birth-p1', 'p1', 'birth', '1 JAN 1970', 19700101, '2026-01-01', '2026-01-01'),
      ('death-p4', 'p4', 'death', '1 JAN 2020', 20200101, '2026-01-01', '2026-01-01'),
      ('marriage-event-p7', 'p7', 'marriage', '1 JAN 2000', 20000101, '2026-01-01', '2026-01-01');

    INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_date_sort_key, divorce_date, created_at, updated_at)
    VALUES
      ('fam-a', 'p1', 'p2', '1 JAN 1990', 19900101, NULL, '2026-01-01', '2026-01-01'),
      ('fam-b', 'p1', 'p3', '1 JAN 2005', 20050101, NULL, '2026-01-01', '2026-01-01'),
      ('fam-c', 'p4', 'p5', '1 JAN 1980', 19800101, NULL, '2026-01-01', '2026-01-01'),
      ('fam-d', 'p8', 'p9', '1 JAN 2010', 20100101, NULL, '2026-01-01', '2026-01-01');

    INSERT INTO import_conflicts (id, import_job_id, xref, record_type, field_name, existing_value, incoming_value, resolution, created_at)
    VALUES ('conflict-1', 'job-1', '@I1@', 'INDI', 'birthDate', '1900', '1901', NULL, '2026-01-01');
  `);
}

beforeEach(() => {
  db = new Database(':memory:');
  createSchema();
  seedIssueFixture();
});

afterEach(() => {
  db.close();
});

describe('tree issue scanner', () => {
  it('creates open issues for detected tree data problems', () => {
    const result = scanTreeIssues();

    expect(result.created).toBeGreaterThan(0);
    expect(result.open).toBeGreaterThan(0);

    const issues = listTreeIssues({ status: 'open', limit: 50 }).data;
    expect(issues.map((issue) => issue.type)).toEqual(expect.arrayContaining([
      'multiple_active_marriages',
      'death_with_active_family',
      'marriage_event_without_family',
      'family_without_marriage_event',
      'missing_core_person_data',
      'unconnected_person',
      'disconnected_branch',
      'unresolved_import_conflict',
    ]));
    expect(issues.find((issue) => issue.type === 'multiple_active_marriages')).toMatchObject({
      severity: 'high',
      primary_entity_type: 'person',
      primary_entity_id: 'p1',
      status: 'open',
    });
  });

  it('updates existing issue rows instead of duplicating them on repeated scans', () => {
    scanTreeIssues();
    const firstCount = listTreeIssues({ status: 'open', limit: 100 }).data.length;

    const result = scanTreeIssues();

    expect(result.updated).toBeGreaterThan(0);
    expect(listTreeIssues({ status: 'open', limit: 100 }).data).toHaveLength(firstCount);
  });

  it('reopens a resolved issue when the same problem is detected again', () => {
    scanTreeIssues();
    const issue = listTreeIssues({ type: 'multiple_active_marriages', limit: 1 }).data[0];

    updateTreeIssue(issue.id, { status: 'resolved' });
    expect(listTreeIssues({ status: 'resolved', limit: 10 }).data).toHaveLength(1);

    scanTreeIssues();

    expect(listTreeIssues({ status: 'open', type: 'multiple_active_marriages', limit: 10 }).data[0]).toMatchObject({
      id: issue.id,
      status: 'open',
      resolved_at: null,
    });
  });

  it('keeps dismissed issues dismissed on repeated scans', () => {
    scanTreeIssues();
    const issue = listTreeIssues({ type: 'multiple_active_marriages', limit: 1 }).data[0];

    updateTreeIssue(issue.id, { status: 'dismissed', note: 'Intentional second marriage record.' });
    scanTreeIssues();

    expect(listTreeIssues({ status: 'dismissed', type: 'multiple_active_marriages', limit: 10 }).data[0]).toMatchObject({
      id: issue.id,
      status: 'dismissed',
      note: 'Intentional second marriage record.',
    });
  });

  it('summarizes unresolved issues by severity and type', () => {
    scanTreeIssues();

    const summary = getTreeIssueSummary();

    expect(summary.open).toBeGreaterThan(0);
    expect(summary.bySeverity.high).toBeGreaterThanOrEqual(1);
    expect(summary.byType.multiple_active_marriages).toBe(1);
    expect(summary.lastScanAt).toEqual(expect.any(String));
  });
});
