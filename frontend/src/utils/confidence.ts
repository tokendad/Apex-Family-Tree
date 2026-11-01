/**
 * The confidence vocabulary (#52), kept out of the component that draws it.
 *
 * Separate from ConfidencePill so these can be imported by pages that reason
 * about confidence without rendering a pill -- the person page filters its
 * unsettled claims with isUnsettledConfidence and draws nothing -- and so the
 * component file exports only a component, which is what fast refresh wants.
 */

/** The levels with a colour of their own. Anything else falls back to neutral. */
const CONFIDENCE_KEYS = ['confirmed', 'probable', 'disputed', 'possible', 'rejected'] as const;

/* Confirmed and Rejected are both settled: one is established and the other has
   been looked into and ruled out. Neither marks the facts it governs, because
   if every settled date carried a badge none of them would mean anything. */
const SETTLED = new Set<string>(['confirmed', 'rejected']);

/** The style key for a level name, or 'unknown' for anything unrecognised. */
export function confidenceKey(name: string | null | undefined): string {
  const key = name?.trim().toLowerCase() ?? '';
  return (CONFIDENCE_KEYS as readonly string[]).includes(key) ? key : 'unknown';
}

/** Whether a level leaves a question open. An ungraded claim counts as open. */
export function isUnsettledConfidence(name: string | null | undefined): boolean {
  return !SETTLED.has(confidenceKey(name));
}

/** "Confirmed · 95" says more than "Confirmed"; "Unknown · null" says less. */
export function confidenceLabel(
  name: string | null | undefined,
  score: number | null | undefined,
): string {
  const text = name?.trim() || 'Unknown';
  return score === null || score === undefined ? text : `${text} · ${score}`;
}
