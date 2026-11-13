export interface ParsedDate {
  year: number | null;
  month: number | null;
  day: number | null;
  qualifier: 'exact' | 'about' | 'before' | 'after' | 'between' | 'calculated' | 'estimated';
  sortKey: number;
  original: string;
  /**
   * For a `FROM x TO y` / `FROM x` span only: `x`, with the `FROM` keyword
   * stripped, in the author's own words. EventRepository stores this back
   * into event_date in place of the whole "FROM ... TO ..." string, so the
   * end can live in its own column (#33) and the exporter can recompose the
   * GEDCOM form from the two rather than nesting "FROM" inside itself. Null
   * for every form that is not a span, including a span with no start.
   */
  startRaw: string | null;
  /**
   * The second date of a `FROM x TO y` span or a `BET x AND y` range, in the
   * author's own words -- not reformatted, so it can be written back into
   * event_date_end unchanged (#33). Null for every other date form, and for
   * the one-sided `FROM x` / `TO y` forms that have no second date to carry.
   */
  endRaw: string | null;
  endYear: number | null;
  endMonth: number | null;
  endDay: number | null;
  endSortKey: number | null;
  /**
   * True only for `FROM`/`TO` (DATE_PERIOD). `BET x AND y` also fills the end
   * fields above, but it states a single uncertain date somewhere in a range,
   * not a span -- so it keeps displaying as "Between 1900", not "1900-1910".
   */
  isPeriod: boolean;
}

const MONTH_MAP: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

interface DateParts {
  year: number | null;
  month: number | null;
  day: number | null;
}

const NO_DATE: DateParts = { year: null, month: null, day: null };

/** The single-date grammar shared by every qualifier and by each half of a
    span or range: ISO, "D MON YYYY", "MON YYYY", or a bare year. */
function parseDateParts(upperText: string): DateParts {
  // ISO first, and not as a fallback. Read after the other shapes it never
  // matched at all: "1990-11-29" is one whitespace-delimited part, so it took
  // the year-only branch, where parseInt stops at the first hyphen and returns
  // 1990. That made `year` truthy, the `!year` guard below false, and the
  // month and day were dropped from a date that stated both -- silently, with
  // the text kept verbatim on screen and only the sort order showing it.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(upperText);
  if (iso) {
    return { year: parseInt(iso[1], 10), month: parseInt(iso[2], 10), day: parseInt(iso[3], 10) };
  }

  const parts = upperText.split(/\s+/).filter(Boolean);
  if (parts.length === 3) {
    return {
      day: parseInt(parts[0], 10) || null,
      month: MONTH_MAP[parts[1]] || null,
      year: parseInt(parts[2], 10) || null,
    };
  }
  if (parts.length === 2) {
    return { month: MONTH_MAP[parts[0]] || null, day: null, year: parseInt(parts[1], 10) || null };
  }
  if (parts.length === 1 && parts[0]) {
    return { year: parseInt(parts[0], 10) || null, month: null, day: null };
  }
  return NO_DATE;
}

function sortKeyOf(p: DateParts): number {
  return (p.year || 0) * 10000 + (p.month || 0) * 100 + (p.day || 0);
}

function finish(
  start: DateParts,
  qualifier: ParsedDate['qualifier'],
  original: string,
  endText: string | null,
  isPeriod: boolean,
  startText: string | null = null,
): ParsedDate {
  const end = endText ? parseDateParts(endText.toUpperCase()) : null;
  return {
    ...start,
    qualifier,
    sortKey: sortKeyOf(start),
    original,
    startRaw: startText,
    endRaw: endText,
    endYear: end?.year ?? null,
    endMonth: end?.month ?? null,
    endDay: end?.day ?? null,
    endSortKey: end ? sortKeyOf(end) : null,
    isPeriod,
  };
}

export function parseGedcomDate(dateStr: string): ParsedDate {
  const original = dateStr.trim();
  const working = original.toUpperCase();

  // DATE_PERIOD (#33): `FROM x TO y`, `FROM x`, `TO y`. Handled before every
  // other qualifier below, because it is the one GEDCOM date form that
  // carries two dates rather than one -- falling into the single-date
  // branches the way the other qualifiers do is why "FROM 1982 TO 1990"
  // used to silently sort as 0: four whitespace-delimited parts matched none
  // of the 1/2/3-part shapes.
  if (working.startsWith('FROM ')) {
    const rest = original.slice(5);
    const toMatch = /\sTO\s/i.exec(rest);
    const startText = (toMatch ? rest.slice(0, toMatch.index) : rest).trim();
    const endText = toMatch ? rest.slice(toMatch.index + toMatch[0].length).trim() : null;
    return finish(parseDateParts(startText.toUpperCase()), 'exact', original, endText, true, startText || null);
  }

  // No start, only an end -- there is nothing to put in `year`/`month`/`day`,
  // so the one date this form carries belongs in the end fields, not
  // mistaken for a start the way the generic parser used to read it (the
  // `TO` keyword simply failed to match a month and got ignored).
  if (working.startsWith('TO ')) {
    const endText = original.slice(3).trim();
    return finish(NO_DATE, 'exact', original, endText, true);
  }

  let qualifier: ParsedDate['qualifier'] = 'exact';
  let rest = working;
  let endText: string | null = null;

  if (working.startsWith('ABT ') || working.startsWith('ABOUT ')) {
    qualifier = 'about';
    rest = working.replace(/^(ABT|ABOUT)\s+/, '');
  } else if (working.startsWith('BEF ') || working.startsWith('BEFORE ')) {
    qualifier = 'before';
    rest = working.replace(/^(BEF|BEFORE)\s+/, '');
  } else if (working.startsWith('AFT ') || working.startsWith('AFTER ')) {
    qualifier = 'after';
    rest = working.replace(/^(AFT|AFTER)\s+/, '');
  } else if (working.startsWith('BET ')) {
    qualifier = 'between';
    const afterBet = original.slice(original.toUpperCase().indexOf('BET') + 3).trim();
    const andMatch = /\sAND\s/i.exec(afterBet);
    rest = (andMatch ? afterBet.slice(0, andMatch.index) : afterBet).toUpperCase();
    // The second bound used to be discarded here. It is the same kind of
    // second date a span carries, so it is captured the same way.
    endText = andMatch ? afterBet.slice(andMatch.index + andMatch[0].length).trim() : null;
  } else if (working.startsWith('CAL ') || working.startsWith('CALCULATED ')) {
    qualifier = 'calculated';
    rest = working.replace(/^(CAL|CALCULATED)\s+/, '');
  } else if (working.startsWith('EST ') || working.startsWith('ESTIMATED ')) {
    qualifier = 'estimated';
    rest = working.replace(/^(EST|ESTIMATED)\s+/, '');
  }

  return finish(parseDateParts(rest), qualifier, original, endText, false);
}

export function formatDateForDisplay(parsed: ParsedDate): string {
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const formatOne = (p: { day: number | null; month: number | null; year: number | null }): string | null => {
    if (p.day && p.month && p.year) return `${p.day} ${months[p.month]} ${p.year}`;
    if (p.month && p.year) return `${months[p.month]} ${p.year}`;
    if (p.year) return `${p.year}`;
    return null;
  };

  const start = formatOne(parsed);
  const end = formatOne({ day: parsed.endDay, month: parsed.endMonth, year: parsed.endYear });

  // A span renders as "1982–1990", or "from 1982" / "to 1990" when only one
  // side is known -- never silently dropping the half that is. BET x AND y
  // states a single uncertain date, not a span, so it keeps its "Between "
  // prefix below instead of taking this branch.
  if (parsed.isPeriod) {
    if (start && end) return `${start}–${end}`;
    if (end) return `to ${end}`;
    if (start) return `from ${start}`;
    return parsed.original;
  }

  if (!start) return parsed.original;

  const prefixes: Record<string, string> = {
    exact: '', about: 'About ', before: 'Before ', after: 'After ',
    between: 'Between ', calculated: 'Calculated ', estimated: 'Estimated ',
  };

  return `${prefixes[parsed.qualifier]}${start}`;
}

/**
 * Removes a leading `FROM ` keyword, case-insensitively (#33).
 *
 * event_date never keeps a FROM keyword by design -- EventRepository only
 * splits a fully-bounded span, leaving an open-ended "FROM x" verbatim --
 * but a one-sided "FROM x" that later gets an end added through the End
 * field on its own (event_date untouched, event_date_end set) will still
 * carry it. Recomposing "FROM x TO y" from that without stripping first
 * writes "FROM FROM x TO y". Used wherever event_date and event_date_end are
 * combined, not just once at write time, so it still protects a row written
 * before this existed.
 */
export function stripFromKeyword(text: string | null): string | null {
  if (!text) return text;
  const stripped = text.replace(/^FROM\s+/i, '').trim();
  return stripped || null;
}
