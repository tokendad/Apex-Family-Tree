/**
 * Coerces a JSON boolean into the 0/1 integer SQLite stores.
 *
 * better-sqlite3 refuses to bind a JavaScript boolean — it throws
 * "SQLite3 can only bind numbers, strings, bigints, buffers, and null" — so any
 * request body carrying `true`/`false` for a flag column fails at the INSERT
 * unless it is converted first.
 *
 * This is easy to miss because the repository signatures say `number`, which is
 * true of every internal caller; only values arriving from an untyped JSON body
 * break the assumption. The person wizard sent `is_living: true` and every
 * attempt to add a person failed with a bare 500.
 *
 * Accepts the string forms too, since query strings and form posts cannot carry
 * real booleans.
 */
export function toSqliteBool(value: unknown, fallback: 0 | 1): 0 | 1 {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 0 ? 0 : 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return 1;
    if (['false', '0', 'no', 'off', ''].includes(normalized)) return 0;
  }
  return fallback;
}
