import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { diffRows, recordChange, recordBulk } = await import('./audit.js');
const { runWithContext, runWithFlags } = await import('./requestContext.js');

function auditRows() {
  return db.prepare('SELECT * FROM audit_log ORDER BY id').all() as {
    user_id: string | null; action: string; entity_type: string; entity_id: string | null;
    old_values: string | null; new_values: string | null; ip_address: string | null;
  }[];
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, entity_type TEXT,
      entity_id TEXT, old_values TEXT, new_values TEXT, ip_address TEXT, created_at TEXT
    );
  `);
});

afterEach(() => db.close());

describe('diffRows', () => {
  it('reports only the fields that actually changed', () => {
    const diff = diffRows(
      { id: 'e1', event_date: '1950', event_place: 'Ware', description: null },
      { id: 'e1', event_date: '1950', event_place: 'Las Vegas', description: null },
    );

    expect(diff).toEqual({ old: { event_place: 'Ware' }, new: { event_place: 'Las Vegas' } });
  });

  it('is null when nothing changed, so a no-op save records nothing', () => {
    expect(diffRows({ id: 'e1', event_place: 'Ware' }, { id: 'e1', event_place: 'Ware' })).toBeNull();
  });

  /* These move on every write and would bury the field someone actually edited. */
  it('ignores bookkeeping columns', () => {
    const diff = diffRows(
      { event_place: 'Ware', updated_at: '2026-01-01', event_date_sort_key: 1 },
      { event_place: 'Ware', updated_at: '2026-10-11', event_date_sort_key: 2 },
    );

    expect(diff).toBeNull();
  });

  /* Reordering names is a real edit, so sort_order must not be treated as noise. */
  it('reports a sort_order change', () => {
    expect(diffRows({ sort_order: 0 }, { sort_order: 1 })).toEqual({
      old: { sort_order: 0 },
      new: { sort_order: 1 },
    });
  });

  it('treats absent and null as the same value', () => {
    expect(diffRows({ a: 1 }, { a: 1, b: null })).toBeNull();
  });
});

describe('recordChange', () => {
  it('records who made the change and from where', () => {
    runWithContext({ userId: 'u1', ipAddress: '203.0.113.9' }, () => {
      recordChange('update', 'event', 'e1', { event_place: 'Ware' }, { event_place: 'Las Vegas' });
    });

    const [row] = auditRows();
    expect(row.user_id).toBe('u1');
    expect(row.ip_address).toBe('203.0.113.9');
    expect(row.entity_type).toBe('event');
    expect(row.entity_id).toBe('e1');
    expect(JSON.parse(row.old_values!)).toEqual({ event_place: 'Ware' });
    expect(JSON.parse(row.new_values!)).toEqual({ event_place: 'Las Vegas' });
  });

  it('writes nothing when an update changed nothing', () => {
    runWithContext({ userId: 'u1', ipAddress: null }, () => {
      recordChange('update', 'event', 'e1', { event_place: 'Ware' }, { event_place: 'Ware' });
    });

    expect(auditRows()).toHaveLength(0);
  });

  /* One family edit regenerates its marriage and divorce events. Without the
     flag the log would read as three separate decisions. */
  it('stays quiet for derived writes inside a sync', () => {
    runWithContext({ userId: 'u1', ipAddress: null }, () => {
      runWithFlags({ inSync: true }, () => {
        recordChange('update', 'event', 'e1', { event_place: 'A' }, { event_place: 'B' });
      });
    });

    expect(auditRows()).toHaveLength(0);
  });

  it('stays quiet for per-row writes inside a bulk job', () => {
    runWithContext({ userId: 'u1', ipAddress: null }, () => {
      runWithFlags({ bulkSource: 'import' }, () => {
        for (let i = 0; i < 50; i++) {
          recordChange('create', 'person', `p${i}`, null, { id: `p${i}` });
        }
      });
    });

    expect(auditRows()).toHaveLength(0);
  });

  /* recordBulk is called by the route after the job returns, outside the bulk
     context, which is the only reason the summary survives. */
  it('still records the single summary entry for a bulk job', () => {
    runWithContext({ userId: 'u1', ipAddress: null }, () => {
      runWithFlags({ bulkSource: 'import' }, () => {
        recordChange('create', 'person', 'p1', null, { id: 'p1' });
      });
      recordBulk('import', 'gedcom_import', 'job1', { added: 50 });
    });

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('import');
    expect(JSON.parse(rows[0].new_values!)).toEqual({ added: 50 });
  });

  it('records with no actor when there is no request behind the write', () => {
    recordChange('update', 'media', 'm1', { title: 'a' }, { title: 'b' });

    const [row] = auditRows();
    expect(row.user_id).toBeNull();
  });

  /* A deleted user's row must not carry their password hash into a table that
     exists to be read. */
  it('redacts secrets from a recorded row', () => {
    runWithContext({ userId: 'u1', ipAddress: null }, () => {
      recordChange('delete', 'user', 'u2', { id: 'u2', email: 'a@b.c', password_hash: '$argon2id$v=19$real' }, null);
    });

    const [row] = auditRows();
    expect(row.old_values).not.toContain('argon2');
    expect(JSON.parse(row.old_values!)).toMatchObject({ email: 'a@b.c', password_hash: '[redacted]' });
  });

  /* The whole point: an audit row is a record of the thing, not part of it. */
  it('never throws when the audit write itself fails', () => {
    db.exec(`
      CREATE TRIGGER block_audit BEFORE INSERT ON audit_log
      BEGIN SELECT RAISE(ABORT, 'disk full'); END;
    `);

    expect(() => {
      runWithContext({ userId: 'u1', ipAddress: null }, () => {
        recordChange('update', 'event', 'e1', { a: 1 }, { a: 2 });
      });
    }).not.toThrow();
  });
});
