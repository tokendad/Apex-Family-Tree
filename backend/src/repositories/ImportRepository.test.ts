import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));
const { ImportRepository } = await import('./ImportRepository.js');

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE import_merge_decisions (
      import_job_id TEXT NOT NULL, xref TEXT NOT NULL,
      decision TEXT NOT NULL, candidate_person_id TEXT,
      field_resolutions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (import_job_id, xref)
    );
  `);
});
afterAll(() => db.close());

describe('merge decisions', () => {
  it('saves and reads back decisions, upserting on conflict', () => {
    const repo = new ImportRepository();
    repo.saveMergeDecision({ import_job_id: 'j1', xref: '@I1@', decision: 'same', candidate_person_id: 'p1', field_resolutions: '{"occupation":"new"}' });
    repo.saveMergeDecision({ import_job_id: 'j1', xref: '@I1@', decision: 'new', candidate_person_id: null, field_resolutions: '{}' });

    const rows = repo.findMergeDecisions('j1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ xref: '@I1@', decision: 'new', candidate_person_id: null });
  });
});
