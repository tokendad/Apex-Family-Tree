import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const { AuditRepository } = await import('./AuditRepository.js');

function seed(n: number, overrides: Partial<{ action: string; entityType: string; userId: string | null; oldValues: unknown }> = {}) {
  const repo = new AuditRepository();
  for (let i = 0; i < n; i++) {
    repo.record({
      userId: overrides.userId !== undefined ? overrides.userId : 'u1',
      action: overrides.action ?? 'update',
      entityType: overrides.entityType ?? 'event',
      entityId: `e${i}`,
      oldValues: overrides.oldValues ?? { event_place: `place-${i}` },
      newValues: { event_place: `new-${i}` },
      ipAddress: '203.0.113.9',
    });
  }
}

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, action TEXT, entity_type TEXT,
      entity_id TEXT, old_values TEXT, new_values TEXT, ip_address TEXT, created_at TEXT
    );
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, display_name TEXT);
    INSERT INTO users (id, email, display_name) VALUES ('u1', 'wes@example.test', 'Wes');
  `);
});

afterEach(() => db.close());

describe('AuditRepository.list', () => {
  it('returns newest first', () => {
    seed(3);

    const { data } = new AuditRepository().list();

    expect(data.map((r) => r.entity_id)).toEqual(['e2', 'e1', 'e0']);
  });

  it('names the actor rather than showing a bare id', () => {
    seed(1);

    const [row] = new AuditRepository().list().data;

    expect(row.user_email).toBe('wes@example.test');
    expect(row.user_display_name).toBe('Wes');
  });

  /* The viewer asks for 20 and offers to load more. */
  it('pages with a keyset cursor', () => {
    seed(25);
    const repo = new AuditRepository();

    const first = repo.list({ limit: 20 });
    expect(first.data).toHaveLength(20);
    expect(first.next_cursor).toBe(String(first.data[19].id));

    const second = repo.list({ limit: 20, cursor: first.next_cursor! });
    expect(second.data).toHaveLength(5);
    expect(second.next_cursor).toBeNull();

    // No row appears on both pages, and none is skipped between them.
    const ids = [...first.data, ...second.data].map((r) => r.id);
    expect(new Set(ids).size).toBe(25);
  });

  it('searches the recorded values, not just the ids', () => {
    seed(1, { oldValues: { marriage_place: 'Culver City' } });
    seed(1, { oldValues: { marriage_place: 'Granby' } });

    const { data } = new AuditRepository().list({ q: 'Culver' });

    expect(data).toHaveLength(1);
    expect(JSON.parse(data[0].old_values!)).toEqual({ marriage_place: 'Culver City' });
  });

  it('searches by actor', () => {
    seed(2);

    expect(new AuditRepository().list({ q: 'wes@example' }).data).toHaveLength(2);
    expect(new AuditRepository().list({ q: 'nobody' }).data).toHaveLength(0);
  });

  it('filters by entity type and action', () => {
    seed(2, { entityType: 'event', action: 'update' });
    seed(3, { entityType: 'person', action: 'delete' });

    const repo = new AuditRepository();
    expect(repo.list({ entityType: 'person' }).data).toHaveLength(3);
    expect(repo.list({ action: 'update' }).data).toHaveLength(2);
  });

  /* Boot-time backfills and importer writes have no actor. They are noise in a
     log someone opens to see what a person did, so they are hidden by default. */
  it('hides actorless system entries unless asked for', () => {
    seed(2, { userId: 'u1' });
    seed(3, { userId: null });

    const repo = new AuditRepository();
    expect(repo.list().data).toHaveLength(2);
    expect(repo.list({ includeSystem: true }).data).toHaveLength(5);
  });

  it('caps the page size however large a limit is asked for', () => {
    seed(30);

    expect(new AuditRepository().list({ limit: 10_000 }).data.length).toBeLessThanOrEqual(200);
  });
});

describe('AuditRepository.facets', () => {
  it('lists the distinct entity types and actions present', () => {
    seed(1, { entityType: 'event', action: 'update' });
    seed(1, { entityType: 'person', action: 'delete' });

    const { entityTypes, actions } = new AuditRepository().facets();

    expect(entityTypes).toEqual(['event', 'person']);
    expect(actions).toEqual(['delete', 'update']);
  });
});
