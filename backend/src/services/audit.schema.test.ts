import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { recordChange, recordBulk } = await import('./audit.js');
const { runWithContext } = await import('./requestContext.js');

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Builds audit_log from the migrations themselves rather than a hand-written
 * CREATE TABLE.
 *
 * The first version of these tests used a permissive fixture and passed while
 * production silently rejected every bulk entry: the real table constrained
 * action to create/update/delete and required entity_id. Recording deliberately
 * swallows its own failures, so nothing surfaced. A fixture that is looser than
 * the database proves nothing about the database.
 */
function applyAuditMigrations(): void {
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, display_name TEXT);`);
  for (const file of ['026-audit-log.sql', '064-audit-log-bulk-actions.sql']) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
  }
}

function rows() {
  return db.prepare('SELECT * FROM audit_log ORDER BY id').all() as { action: string; entity_id: string | null }[];
}

beforeEach(() => {
  db = new Database(':memory:');
  applyAuditMigrations();
});

afterEach(() => db.close());

describe('audit_log, against the real schema', () => {
  it('accepts the row-level actions', () => {
    runWithContext({ userId: null, ipAddress: null }, () => {
      recordChange('create', 'person', 'p1', null, { id: 'p1' });
      recordChange('update', 'event', 'e1', { a: 1 }, { a: 2 });
      recordChange('delete', 'name', 'n1', { id: 'n1' }, null);
    });

    expect(rows().map((r) => r.action)).toEqual(['create', 'update', 'delete']);
  });

  /* These were rejected by the original CHECK constraint, and because
     recording never throws, the rejection was invisible. */
  it('accepts the bulk actions', () => {
    runWithContext({ userId: null, ipAddress: null }, () => {
      recordBulk('import', 'gedcom_import', 'job1', { added: 50 });
      recordBulk('merge', 'person', 'p1', { merged_person_ids: ['p2'] });
      recordBulk('scan', 'media', null, { added: 3 });
    });

    expect(rows().map((r) => r.action)).toEqual(['import', 'merge', 'scan']);
  });

  /* A scan acts on a directory, not on one record. */
  it('accepts an entry with no single entity', () => {
    runWithContext({ userId: null, ipAddress: null }, () => {
      recordBulk('scan', 'media', null, { path: '/media/Personal' });
    });

    expect(rows()).toHaveLength(1);
    expect(rows()[0].entity_id).toBeNull();
  });

  it('refuses to let an entry be changed after the fact', () => {
    runWithContext({ userId: null, ipAddress: null }, () => {
      recordChange('update', 'event', 'e1', { a: 1 }, { a: 2 });
    });

    expect(() => db.prepare("UPDATE audit_log SET action = 'create' WHERE id = 1").run())
      .toThrow(/cannot be modified/);
  });

  it('refuses to let an entry be deleted', () => {
    runWithContext({ userId: null, ipAddress: null }, () => {
      recordChange('delete', 'person', 'p1', { id: 'p1' }, null);
    });

    expect(() => db.prepare('DELETE FROM audit_log WHERE id = 1').run())
      .toThrow(/cannot be deleted/);
  });

  /* user_id was a foreign key with ON DELETE SET NULL. Setting a column is an
     UPDATE, which the append-only trigger aborts, so deleting a user who had
     made any edit would have failed outright once the log had rows -- which it
     only just started to have. Deleting the account must still work, and the
     entry must still say who acted. */
  it('lets a user be deleted, and still records who acted', () => {
    db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'a@b.c')").run();
    db.pragma('foreign_keys = ON');

    runWithContext({ userId: 'u1', ipAddress: null }, () => {
      recordChange('delete', 'person', 'p1', { id: 'p1' }, null);
    });

    expect(() => db.prepare("DELETE FROM users WHERE id = 'u1'").run()).not.toThrow();

    expect(rows()).toHaveLength(1);
    expect(db.prepare('SELECT user_id FROM audit_log').get()).toEqual({ user_id: 'u1' });
  });
});
