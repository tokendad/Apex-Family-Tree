import { soundex } from '../../utils/soundex.js';

export function normalizeName(given: string | null, surname: string | null): string {
  return [given, surname]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameSoundex(given: string | null, surname: string | null): string {
  return `${soundex(given ?? '')}|${soundex(surname ?? '')}`;
}

function yearOf(date: string): number | null {
  const m = date.match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

export function dateMatch(a: string | null, b: string | null): 'match' | 'mismatch' | 'absent' {
  if (!a || !b) return 'absent';
  if (a === b) return 'match';
  const ya = yearOf(a);
  const yb = yearOf(b);
  if (ya !== null && yb !== null) return ya === yb ? 'match' : 'mismatch';
  return 'mismatch';
}
