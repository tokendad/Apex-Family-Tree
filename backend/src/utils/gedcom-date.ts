export interface ParsedDate {
  year: number | null;
  month: number | null;
  day: number | null;
  qualifier: 'exact' | 'about' | 'before' | 'after' | 'between' | 'calculated' | 'estimated';
  sortKey: number;
  original: string;
}

const MONTH_MAP: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

export function parseGedcomDate(dateStr: string): ParsedDate {
  const original = dateStr.trim();
  let qualifier: ParsedDate['qualifier'] = 'exact';
  let working = original.toUpperCase();

  if (working.startsWith('ABT ') || working.startsWith('ABOUT ')) {
    qualifier = 'about';
    working = working.replace(/^(ABT|ABOUT)\s+/, '');
  } else if (working.startsWith('BEF ') || working.startsWith('BEFORE ')) {
    qualifier = 'before';
    working = working.replace(/^(BEF|BEFORE)\s+/, '');
  } else if (working.startsWith('AFT ') || working.startsWith('AFTER ')) {
    qualifier = 'after';
    working = working.replace(/^(AFT|AFTER)\s+/, '');
  } else if (working.startsWith('BET ')) {
    qualifier = 'between';
    working = working.replace(/^BET\s+/, '').replace(/\s+AND\s+.*$/, '');
  } else if (working.startsWith('CAL ') || working.startsWith('CALCULATED ')) {
    qualifier = 'calculated';
    working = working.replace(/^(CAL|CALCULATED)\s+/, '');
  } else if (working.startsWith('EST ') || working.startsWith('ESTIMATED ')) {
    qualifier = 'estimated';
    working = working.replace(/^(EST|ESTIMATED)\s+/, '');
  }

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  // ISO first, and not as a fallback. Read after the other shapes it never
  // matched at all: "1990-11-29" is one whitespace-delimited part, so it took
  // the year-only branch, where parseInt stops at the first hyphen and returns
  // 1990. That made `year` truthy, the `!year` guard below false, and the
  // month and day were dropped from a date that stated both -- silently, with
  // the text kept verbatim on screen and only the sort order showing it.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(working);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    return {
      year,
      month,
      day,
      qualifier,
      sortKey: year * 10000 + month * 100 + day,
      original,
    };
  }

  const parts = working.split(/\s+/);

  if (parts.length === 3) {
    day = parseInt(parts[0], 10) || null;
    month = MONTH_MAP[parts[1]] || null;
    year = parseInt(parts[2], 10) || null;
  } else if (parts.length === 2) {
    month = MONTH_MAP[parts[0]] || null;
    year = parseInt(parts[1], 10) || null;
  } else if (parts.length === 1) {
    year = parseInt(parts[0], 10) || null;
  }

  const sortKey = (year || 0) * 10000 + (month || 0) * 100 + (day || 0);

  return { year, month, day, qualifier, sortKey, original };
}

export function formatDateForDisplay(parsed: ParsedDate): string {
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let date = '';
  if (parsed.day && parsed.month && parsed.year) {
    date = `${parsed.day} ${months[parsed.month]} ${parsed.year}`;
  } else if (parsed.month && parsed.year) {
    date = `${months[parsed.month]} ${parsed.year}`;
  } else if (parsed.year) {
    date = `${parsed.year}`;
  } else {
    return parsed.original;
  }

  const prefixes: Record<string, string> = {
    exact: '', about: 'About ', before: 'Before ', after: 'After ',
    between: 'Between ', calculated: 'Calculated ', estimated: 'Estimated ',
  };

  return `${prefixes[parsed.qualifier]}${date}`;
}
