/**
 * Pull the year out of a date as this application stores it.
 *
 * Dates are kept as GEDCOM-style strings rather than ISO, because genealogy
 * routinely has to record something less precise than a calendar day. All of
 * these are real values from the tree:
 *
 *   12 OCT 1926          a full date
 *   SEP 1988             month and year, no day
 *   1894                 year only
 *   ABT 1876             approximate
 *   BET 1941 AND 1966    a span
 *   4 OCT                day and month with the year unknown
 *
 * Taking the first four characters — which is what the family-chart adapter
 * used to do — only works for the bare-year case. "12 OCT 1926" became
 * "12 O", which is what showed on the cards.
 */
export function yearOf(value: string | null | undefined): string {
  if (!value) return '';
  // The first four-digit group. A span such as "BET 1941 AND 1966" yields its
  // opening year, which is what belongs on a card with one line for dates.
  const match = /\b(\d{4})\b/.exec(value);
  return match ? match[1] : '';
}

/**
 * The life-span label for a person card: "1926 – 1993", "b. 1950", "d. 1993".
 *
 * A year that cannot be determined shows as "?" rather than being omitted, so
 * a card never silently implies someone is living.
 */
export function lifeSpan(birthDate: string | null, deathDate: string | null): string {
  const birth = yearOf(birthDate);
  const death = yearOf(deathDate);

  if (birth && death) return `${birth} – ${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  // A date was recorded but carried no year, e.g. "4 OCT".
  if (birthDate || deathDate) return deathDate ? '? – ?' : 'b. ?';
  return '';
}
