export type FieldStatus = 'filled' | 'unchanged' | 'conflict';
export interface FieldDiff { field: string; existing: string | null; incoming: string | null; status: FieldStatus; }
export type Tier = 'strong' | 'partial' | 'none';
export interface PersonAnalysis {
  xref: string; name: string; birthDate: string | null; deathDate: string | null;
  tier: Tier; candidate: { id: string; name: string; birthDate: string | null; deathDate: string | null } | null;
  fields: FieldDiff[];
}
export interface MergeAnalysis { persons: PersonAnalysis[]; counts: { strong: number; partial: number; none: number }; }

export interface Decision { kind: 'same' | 'new'; candidateId: string | null; fields: Record<string, 'old' | 'new'>; }
export type ReviewState = Record<string, Decision>;

export function initReviewState(a: MergeAnalysis): ReviewState {
  const s: ReviewState = {};
  for (const p of a.persons) {
    if (p.tier === 'strong' && p.candidate) s[p.xref] = { kind: 'same', candidateId: p.candidate.id, fields: {} };
    else if (p.tier === 'none') s[p.xref] = { kind: 'new', candidateId: null, fields: {} };
  }
  return s;
}

export function setDecision(state: ReviewState, xref: string, kind: 'same' | 'new', candidateId: string | null): ReviewState {
  const prev = state[xref] ?? { kind, candidateId, fields: {} };
  return { ...state, [xref]: { ...prev, kind, candidateId } };
}

export function setField(state: ReviewState, xref: string, field: string, choice: 'old' | 'new'): ReviewState {
  const prev = state[xref];
  if (!prev) return state; // ignore field choice before an explicit same/new decision is made
  return { ...state, [xref]: { ...prev, fields: { ...prev.fields, [field]: choice } } };
}

export function unresolvedCount(a: MergeAnalysis, state: ReviewState): number {
  return a.persons.filter((p) => p.tier === 'partial' && !state[p.xref]).length;
}

export function toApiDecisions(a: MergeAnalysis, state: ReviewState) {
  return a.persons
    .filter((p) => state[p.xref])
    .map((p) => {
      const d = state[p.xref];
      return { xref: p.xref, decision: d.kind, candidatePersonId: d.candidateId, fieldResolutions: d.fields };
    });
}
