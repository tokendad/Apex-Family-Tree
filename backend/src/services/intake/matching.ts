import {
  blockingKey,
  classifyGroup,
  findPersonFacts,
  isCandidatePair,
  matchScore,
  type PersonFactRow,
} from '../tools/personDedup.js';

export interface CandidateMatch {
  personId: string;
  score: number;
  reasons: string[];
  /** For the review UI to show who a match actually is -- a bare id tells a
   *  reviewer nothing they can act on. */
  displayName: string;
  birthYear: number | null;
}

function yearFromDate(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

/**
 * Ranks existing people in the tree against one incoming proposed person.
 *
 * Deliberately not a new matching algorithm -- it reuses the exact scoring
 * personDedup.ts's whole-table duplicate scan already does (blockingKey,
 * isCandidatePair, matchScore, classifyGroup), just pointed at a single
 * synthetic row instead of pairs drawn from the tree itself.
 *
 * Runs only against local DB rows: per #73's privacy constraint, the LLM
 * never sees tree data, so this candidate ranking happens entirely after
 * extraction, never as part of the prompt.
 */
export function rankCandidates(
  proposed: { givenName: string; surname: string | null; birthDate?: string | null; deathDate?: string | null },
  limit = 5,
): CandidateMatch[] {
  const proposedRow: PersonFactRow = {
    id: '__proposed__',
    sex: null,
    is_living: null,
    notes: null,
    given_name: proposed.givenName || null,
    surname: proposed.surname || null,
    birth_date: proposed.birthDate ?? null,
    birth_sort: null,
    birth_place: null,
    death_date: proposed.deathDate ?? null,
    death_sort: null,
    death_place: null,
    spouse_name: null,
    father_name: null,
    mother_name: null,
    occupation: null,
  };

  const proposedKey = blockingKey(proposedRow);
  if (!proposedKey) return [];

  const candidates = findPersonFacts().filter((row) => blockingKey(row) === proposedKey && isCandidatePair(proposedRow, row));

  return candidates
    .map((row) => {
      const { reasons } = classifyGroup([proposedRow, row]);
      const score = matchScore([proposedRow, row]) ?? 0;
      const displayName = [row.given_name, row.surname].filter(Boolean).join(' ') || 'Unknown';
      return { personId: row.id, score, reasons, displayName, birthYear: yearFromDate(row.birth_date) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
