import { describe, it, expect } from 'vitest';
import { initReviewState, setDecision, setField, unresolvedCount, toApiDecisions, type MergeAnalysis } from './mergeReview';

const analysis: MergeAnalysis = {
  counts: { strong: 1, partial: 1, none: 1 },
  persons: [
    { xref: '@S@', name: 'A', birthDate: null, deathDate: null, tier: 'strong', candidate: { id: 'c1', name: 'A', birthDate: null, deathDate: null }, fields: [] },
    { xref: '@P@', name: 'B', birthDate: null, deathDate: null, tier: 'partial', candidate: { id: 'c2', name: 'B', birthDate: null, deathDate: null }, fields: [{ field: 'occupation', existing: 'x', incoming: 'y', status: 'conflict' }] },
    { xref: '@N@', name: 'C', birthDate: null, deathDate: null, tier: 'none', candidate: null, fields: [] },
  ],
};

describe('mergeReview reducer', () => {
  it('seeds strong as same, none as new, partial unset', () => {
    const s = initReviewState(analysis);
    expect(s['@S@']).toMatchObject({ kind: 'same', candidateId: 'c1' });
    expect(s['@N@']).toMatchObject({ kind: 'new' });
    expect(s['@P@']).toBeUndefined();
    expect(unresolvedCount(analysis, s)).toBe(1);
  });

  it('records a partial decision and field choice', () => {
    let s = initReviewState(analysis);
    s = setDecision(s, '@P@', 'same', 'c2');
    s = setField(s, '@P@', 'occupation', 'new');
    expect(unresolvedCount(analysis, s)).toBe(0);
    const api = toApiDecisions(analysis, s);
    expect(api).toContainEqual({ xref: '@P@', decision: 'same', candidatePersonId: 'c2', fieldResolutions: { occupation: 'new' } });
  });
});
