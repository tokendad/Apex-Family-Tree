/**
 * Opaque cursor for keyset pagination over archive-object list queries
 * ordered by `updated_at DESC, id ASC`. Encodes both fields so a page
 * boundary that falls mid-`updated_at` still resumes correctly — a cursor
 * keyed on `id` alone skips or repeats rows whenever two adjacent rows
 * don't share the same `updated_at`.
 */
export function encodeUpdatedAtCursor(updatedAt: string, id: string): string {
  return `${updatedAt}|${id}`;
}

export function decodeUpdatedAtCursor(cursor: string): { updatedAt: string; id: string } | null {
  const sepIndex = cursor.lastIndexOf('|');
  if (sepIndex <= 0 || sepIndex === cursor.length - 1) return null;
  return { updatedAt: cursor.slice(0, sepIndex), id: cursor.slice(sepIndex + 1) };
}
