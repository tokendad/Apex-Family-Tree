import type { MappedData, MappedPerson } from './tagMapper.js';
import { classify, diffFields, type MatchPersonInput, type MatchTier, type FieldDiff } from './matcher.js';

export interface PersonAnalysis {
  xref: string;
  name: string;
  birthDate: string | null;
  deathDate: string | null;
  tier: MatchTier;
  candidate: { id: string; name: string; birthDate: string | null; deathDate: string | null } | null;
  fields: FieldDiff[];
}
export interface MergeAnalysis {
  persons: PersonAnalysis[];
  counts: { strong: number; partial: number; none: number };
}

function primary(p: MappedPerson) {
  return p.names.find((n) => n.isPrimary) ?? p.names[0] ?? { givenName: null, surname: null };
}
function eventDate(p: MappedPerson, type: string): string | null {
  return p.events.find((e) => e.eventType === type)?.date ?? null;
}
function eventPlace(p: MappedPerson, type: string): string | null {
  return p.events.find((e) => e.eventType === type)?.place ?? null;
}
function fullName(given: string | null, surname: string | null): string {
  return [given, surname].filter(Boolean).join(' ') || 'Unknown';
}

export function buildMergeAnalysis(
  mapped: MappedData,
  existing: MatchPersonInput[],
  existingFields: (id: string) => Record<string, string | null>,
): MergeAnalysis {
  const persons: PersonAnalysis[] = [];
  const counts = { strong: 0, partial: 0, none: 0 };

  const existingById = new Map(existing.map((e) => [e.id, e]));

  for (const p of mapped.persons) {
    const pn = primary(p);
    const birthDate = eventDate(p, 'birth');
    const deathDate = eventDate(p, 'death');
    const result = classify({ id: p.xref, givenName: pn.givenName, surname: pn.surname, birthDate, deathDate }, existing);
    counts[result.tier]++;

    let candidate: PersonAnalysis['candidate'] = null;
    let fields: FieldDiff[] = [];
    if (result.candidateId) {
      const ex = existingById.get(result.candidateId)!;
      candidate = { id: ex.id, name: fullName(ex.givenName, ex.surname), birthDate: ex.birthDate, deathDate: ex.deathDate };
      const incomingFields: Record<string, string | null> = {
        givenName: pn.givenName, surname: pn.surname, sex: p.sex,
        birthPlace: eventPlace(p, 'birth'), deathPlace: eventPlace(p, 'death'),
      };
      fields = diffFields(existingFields(result.candidateId), incomingFields);
    }

    persons.push({
      xref: p.xref, name: fullName(pn.givenName, pn.surname),
      birthDate, deathDate, tier: result.tier, candidate, fields,
    });
  }

  return { persons, counts };
}
