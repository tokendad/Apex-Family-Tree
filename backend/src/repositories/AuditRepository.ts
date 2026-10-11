import { BaseRepository } from './base.js';

export interface AuditEntryInput {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ipAddress: string | null;
}

export interface AuditEntry {
  id: number;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  created_at: string;
  /** Joined, so the viewer can name a person rather than show an id. */
  user_email: string | null;
  user_display_name: string | null;
}

export interface AuditListOptions {
  limit?: number;
  /** Keyset cursor: the id of the last row of the previous page. */
  cursor?: string;
  /** Free text over action, entity type, entity id, the diff, and the actor. */
  q?: string;
  entityType?: string;
  action?: string;
  userId?: string;
  /** Entries with no actor, from imports, backfills and boot-time work. */
  includeSystem?: boolean;
}

export class AuditRepository extends BaseRepository {
  record(entry: AuditEntryInput): void {
    this.db.prepare(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.userId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.oldValues === null || entry.oldValues === undefined ? null : JSON.stringify(entry.oldValues),
      entry.newValues === null || entry.newValues === undefined ? null : JSON.stringify(entry.newValues),
      entry.ipAddress,
      this.now(),
    );
  }

  /**
   * Newest first, which is the only order a log is ever read in.
   *
   * The keyset runs on a descending integer id rather than created_at: two
   * writes inside one request share a timestamp to the millisecond, and a
   * cursor on a non-unique column silently drops rows at the page boundary.
   */
  list(options?: AuditListOptions): { data: AuditEntry[]; next_cursor: string | null } {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 200);
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.cursor) {
      conditions.push('a.id < ?');
      params.push(Number(options.cursor));
    }

    if (!options?.includeSystem) {
      conditions.push('a.user_id IS NOT NULL');
    }

    if (options?.entityType) {
      conditions.push('a.entity_type = ?');
      params.push(options.entityType);
    }

    if (options?.action) {
      conditions.push('a.action = ?');
      params.push(options.action);
    }

    if (options?.userId) {
      conditions.push('a.user_id = ?');
      params.push(options.userId);
    }

    const q = options?.q?.trim();
    if (q) {
      // The diff columns are searched too: looking up "what happened to this
      // date" means searching values, not just entity ids.
      conditions.push(`(
        a.action LIKE ? OR a.entity_type LIKE ? OR a.entity_id LIKE ?
        OR a.old_values LIKE ? OR a.new_values LIKE ?
        OR u.email LIKE ? OR u.display_name LIKE ?
      )`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);

    const rows = this.db.prepare(
      `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id,
              a.old_values, a.new_values, a.ip_address, a.created_at,
              u.email AS user_email, u.display_name AS user_display_name
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.id DESC
       LIMIT ?`,
    ).all(...params) as AuditEntry[];

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return {
      data: rows,
      next_cursor: hasMore ? String(rows[rows.length - 1]?.id ?? '') || null : null,
    };
  }

  /** Distinct values for the viewer's filter dropdowns. */
  facets(): { entityTypes: string[]; actions: string[] } {
    const entityTypes = this.db.prepare(
      'SELECT DISTINCT entity_type FROM audit_log ORDER BY entity_type',
    ).all() as { entity_type: string }[];
    const actions = this.db.prepare(
      'SELECT DISTINCT action FROM audit_log ORDER BY action',
    ).all() as { action: string }[];

    return {
      entityTypes: entityTypes.map((r) => r.entity_type),
      actions: actions.map((r) => r.action),
    };
  }
}
