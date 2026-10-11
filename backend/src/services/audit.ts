import { AuditRepository } from '../repositories/AuditRepository.js';
import { getRequestContext } from './requestContext.js';
import { createLogger } from './logger.js';

const logger = createLogger();

/**
 * Columns that change on every write and say nothing about what a person did.
 * Recording them would bury the one field that actually moved.
 */
const NOISE_FIELDS = new Set([
  'updated_at',
  'created_at',
  'marriage_date_sort_key',
  'event_date_sort_key',
  'checksum',
  // Rewritten by the boot-time backfill, not by anyone.
  'thumbnail_path',
  'thumbnail_mime',
  'last_login_at',
]);

/**
 * Never copied into an audit entry, whatever happens to the row.
 *
 * Deleting a user would otherwise carry their Argon2 hash forward into a table
 * that exists to be read, and survive the deletion of the account itself.
 */
const REDACTED_FIELDS = new Set(['password_hash', 'token_hash']);

function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(source)) {
    out[key] = REDACTED_FIELDS.has(key) ? '[redacted]' : val;
  }
  return out;
}

/* Accepts the repositories' typed row interfaces, which have no index
   signature, as well as plain objects. Read through a cast rather than
   loosening every entity type in the codebase to suit the audit layer. */
type Row = object | null | undefined;

function asRecord(row: Row): Record<string, unknown> {
  return (row ?? {}) as Record<string, unknown>;
}

/** The changed fields only, as matching old/new objects. */
export interface Diff {
  old: Record<string, unknown>;
  new: Record<string, unknown>;
}

/**
 * Field-level difference between two versions of a row.
 *
 * Returns null when nothing meaningful changed, so a no-op save does not
 * produce an audit entry that implies someone altered something.
 */
export function diffRows(before: Row, after: Row): Diff | null {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  const beforeRow = asRecord(before);
  const afterRow = asRecord(after);
  const keys = new Set([...Object.keys(beforeRow), ...Object.keys(afterRow)]);

  for (const key of keys) {
    if (NOISE_FIELDS.has(key)) continue;

    const a = beforeRow[key] ?? null;
    const b = afterRow[key] ?? null;
    // Loose comparison by serialisation: SQLite hands back numbers where the
    // caller passed strings, and a 1 that was "1" is not a change anyone made.
    if (JSON.stringify(a) === JSON.stringify(b)) continue;

    oldValues[key] = a;
    newValues[key] = b;
  }

  return Object.keys(newValues).length === 0 && Object.keys(oldValues).length === 0
    ? null
    : { old: oldValues, new: newValues };
}

export type AuditAction = 'create' | 'update' | 'delete' | string;

/**
 * Record one change.
 *
 * Never throws and never rejects. An audit row is a record of what happened,
 * not part of the thing happening: if writing it fails, the user's edit still
 * stands and the failure goes to the log. The alternative -- letting a full
 * disk roll back a correction someone just made -- is worse than a gap here.
 *
 * Writes nothing while a bulk job is running. An import or a merge touches
 * thousands of rows and is recorded as a single entry by its own route; the
 * per-record detail of an import lives in import_audit_log.
 */
export function recordChange(
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  before: Row,
  after: Row,
  extra?: Record<string, unknown>,
): void {
  try {
    const context = getRequestContext();

    // Derived rows rebuilt from a record that is itself being audited, and
    // rows written by a bulk job, are covered by their own single entry.
    if (context?.inSync || context?.bulkSource) return;

    let oldValues: unknown = before ?? null;
    let newValues: unknown = after ?? null;

    if (action === 'update') {
      const diff = diffRows(before, after);
      if (!diff) return; // nothing actually changed
      oldValues = diff.old;
      newValues = diff.new;
    }

    if (extra) {
      newValues = { ...(newValues as Record<string, unknown> ?? {}), ...extra };
    }

    new AuditRepository().record({
      userId: context?.userId ?? null,
      action,
      entityType,
      entityId,
      oldValues: redact(oldValues),
      newValues: redact(newValues),
      ipAddress: context?.ipAddress ?? null,
    });
  } catch (error) {
    logger.error(
      `Failed to record audit entry (${action} ${entityType} ${entityId ?? 'unknown'}):`,
      error,
    );
  }
}

/**
 * Record a whole bulk operation as one entry.
 *
 * Called from the route that runs the job, outside the bulk context, so the
 * summary is written even though the individual row writes are suppressed.
 */
export function recordBulk(
  action: string,
  entityType: string,
  entityId: string | null,
  summary: Record<string, unknown>,
): void {
  try {
    const context = getRequestContext();
    new AuditRepository().record({
      userId: context?.userId ?? null,
      action,
      entityType,
      entityId,
      oldValues: null,
      newValues: redact(summary),
      ipAddress: context?.ipAddress ?? null,
    });
  } catch (error) {
    logger.error(`Failed to record bulk audit entry (${action} ${entityType}):`, error);
  }
}
