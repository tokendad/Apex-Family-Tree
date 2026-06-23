import { describe, it, expect } from 'vitest';
import { buildMergeAnalysis } from './mergeAnalysis.js';
import type { MappedData } from './tagMapper.js';
import type { MatchPersonInput } from './matcher.js';
import type { PersonAnalysis } from './mergeAnalysis.js';
import type { FieldDiff } from './matcher.js';

const mapped = {
  persons: [
    { xref: '@I1@', sex: 'F', gedcomId: '@I1@',
      names: [{ nameType: 'birth', prefix: null, givenName: 'Margaret', surname: 'Smith', suffix: null, isPrimary: true }],
      events: [
        { eventType: 'birth', date: '1842-04-12', place: 'London', description: null },
        { eventType: 'death', date: '1911-02-03', place: null, description: null },
      ] },
    { xref: '@I2@', sex: 'M', gedcomId: '@I2@',
      names: [{ nameType: 'birth', prefix: null, givenName: 'Zelda', surname: 'Nobody', suffix: null, isPrimary: true }],
      events: [] },
  ],
  families: [], sources: [], repositories: [],
} as unknown as MappedData;

const existing: MatchPersonInput[] = [
  { id: 'p1', givenName: 'Margaret', surname: 'Smith', birthDate: '1842-04-12', deathDate: '1911-02-03' },
];
const existingFields = (id: string): Record<string, string | null> => {
  if (id === 'p1') return { givenName: 'Margaret', surname: 'Smith', sex: 'F', birthPlace: 'London', deathPlace: '', occupation: 'Seamstress' };
  return {};
};

describe('buildMergeAnalysis', () => {
  it('classifies people and counts tiers', () => {
    const a = buildMergeAnalysis(mapped, existing, existingFields);
    expect(a.counts).toEqual({ strong: 1, partial: 0, none: 1 });
    const m = a.persons.find((p: PersonAnalysis) => p.xref === '@I1@')!;
    expect(m.tier).toBe('strong');
    expect(m.candidate?.id).toBe('p1');
    expect(m.fields.find((f: FieldDiff) => f.field === 'givenName')?.status).toBe('unchanged');
    // DB-only field: occupation exists in DB but GEDCOM omits it -> incoming blank -> unchanged
    expect(m.fields.find((f: FieldDiff) => f.field === 'occupation')?.status).toBe('unchanged');
    // candidate name resolves correctly
    expect(m.candidate?.name).toBe('Margaret Smith');
    // none-tier person has no field diffs
    expect(a.persons.find((p: PersonAnalysis) => p.xref === '@I2@')!.fields).toEqual([]);
  });
});
