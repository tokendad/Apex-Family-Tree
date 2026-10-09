/**
 * Date qualifiers, as `events.event_date_qualifier` stores them. These mirror
 * the GEDCOM date approximation keywords and say very different things about
 * how far a date can be trusted, so they are kept apart rather than flattened
 * into one "approximately".
 */
export type DateQualifier =
  | 'exact'
  | 'about'
  | 'before'
  | 'after'
  | 'between'
  | 'calculated'
  | 'estimated'
  | null
  | undefined;

/**
 * How each qualifier is shown to a reader.
 *
 * "abt." rather than the conventional "c." for circa: in parish-record work —
 * which is where much of this tree's evidence comes from — "c." is also read
 * as "christened", alongside "chr." and "bapt.". A date next to "c." in a
 * register transcription is genuinely ambiguous, and "abt." costs nothing and
 * matches the GEDCOM tag the data already stores.
 */
const PREFIX: Record<string, string> = {
  about: 'abt.',
  before: 'bef.',
  after: 'aft.',
  calculated: 'calc.',
  estimated: 'est.',
};

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
  const match = /\b(\d{4})\b/.exec(value);
  return match ? match[1] : '';
}

/** Every four-digit year in a value, so a span keeps both ends. */
function yearsIn(value: string | null | undefined): string[] {
  if (!value) return [];
  return Array.from(value.matchAll(/\b(\d{4})\b/g), (m) => m[1]);
}

/**
 * A single date reduced to the year, carrying its qualifier: "1926",
 * "abt. 1876", "1941–1966".
 *
 * The qualifier is read from the stored column rather than sniffed out of the
 * date text, because the column is the authoritative one — the text is what a
 * source happened to say.
 */
export function formatYear(
  value: string | null | undefined,
  qualifier?: DateQualifier,
): string {
  if (qualifier === 'between') {
    const [from, to] = yearsIn(value);
    if (from && to) return `${from}–${to}`;
    if (from) return from;
    return '';
  }

  const year = yearOf(value);
  if (!year) return '';
  const prefix = qualifier ? PREFIX[qualifier] : undefined;
  return prefix ? `${prefix} ${year}` : year;
}

/**
 * The life-span label for a person card: "1926 – 1993", "b. abt. 1876",
 * "d. 1993".
 *
 * A date that was recorded but carries no readable year shows "?" rather than
 * being dropped, so a card never silently implies someone is living.
 */
export function lifeSpan(
  birthDate: string | null,
  deathDate: string | null,
  birthQualifier?: DateQualifier,
  deathQualifier?: DateQualifier,
): string {
  const birth = formatYear(birthDate, birthQualifier);
  const death = formatYear(deathDate, deathQualifier);

  if (birth && death) return `${birth} – ${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  if (birthDate || deathDate) return deathDate ? '? – ?' : 'b. ?';
  return '';
}
