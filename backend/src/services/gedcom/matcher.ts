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

export interface MatchPersonInput {
  id: string;
  givenName: string | null;
  surname: string | null;
  birthDate: string | null;
  deathDate: string | null;
}

export type MatchTier = 'strong' | 'partial' | 'none';
export interface MatchResult { tier: MatchTier; candidateId: string | null; }

const TIER_RANK: Record<MatchTier, number> = { none: 0, partial: 1, strong: 2 };

function classifyPair(a: MatchPersonInput, b: MatchPersonInput): MatchTier {
  const exactName = normalizeName(a.givenName, a.surname) === normalizeName(b.givenName, b.surname)
    && normalizeName(a.givenName, a.surname).length > 0;
  const soundexName = nameSoundex(a.givenName, a.surname) === nameSoundex(b.givenName, b.surname);
  const birth = dateMatch(a.birthDate, b.birthDate);
  const death = dateMatch(a.deathDate, b.deathDate);

  if (exactName && birth === 'match' && (death === 'match' || (death === 'absent' && !a.deathDate && !b.deathDate))) {
    return 'strong';
  }
  if ((exactName || soundexName) && (birth === 'match' || death === 'match')) {
    return 'partial';
  }
  return 'none';
}

export function classify(incoming: MatchPersonInput, existing: MatchPersonInput[]): MatchResult {
  let best: MatchResult = { tier: 'none', candidateId: null };
  for (const cand of existing) {
    const tier = classifyPair(incoming, cand);
    if (TIER_RANK[tier] > TIER_RANK[best.tier]) {
      best = { tier, candidateId: tier === 'none' ? null : cand.id };
      if (tier === 'strong') break;
    }
  }
  return best;
}

export type FieldStatus = 'filled' | 'unchanged' | 'conflict';
export interface FieldDiff { field: string; existing: string | null; incoming: string | null; status: FieldStatus; }

export function diffFields(
  existing: Record<string, string | null>,
  incoming: Record<string, string | null>,
): FieldDiff[] {
  const keys: string[] = [...Object.keys(existing)];
  for (const k of Object.keys(incoming)) if (!keys.includes(k)) keys.push(k);

  const out: FieldDiff[] = [];
  for (const field of keys) {
    const e = existing[field] ?? '';
    const i = incoming[field] ?? '';
    if (!e && !i) continue;
    let status: FieldStatus;
    if (!e && i) status = 'filled';
    else if (e === i) status = 'unchanged';
    else status = 'conflict';
    out.push({ field, existing: existing[field] ?? '', incoming: incoming[field] ?? '', status });
  }
  return out;
}

export function coupleKey(a: string | null, b: string | null): string {
  return [a ?? '', b ?? ''].sort().join('|');
}

export function sourceKey(title: string, author: string | null): string {
  return `${title.trim().toLowerCase()}|${(author ?? '').trim().toLowerCase()}`;
}
