import { describe, expect, it } from 'vitest';
import { proposalSummary, unresolvedCount, type IntakeProposal } from './intakeReview';

function proposal(overrides: Partial<IntakeProposal> = {}): IntakeProposal {
  return {
    id: 'p1',
    intake_item_id: 'item1',
    proposal_type: 'fact',
    payload: { citations: [], statement: 'John Smith was a sailor.', subjectRef: 'ref1' },
    confidence: null,
    decision: null,
    edited_payload: null,
    committed_object_id: null,
    ...overrides,
  };
}

describe('unresolvedCount', () => {
  it('counts proposals with no decision yet', () => {
    const proposals = [proposal({ id: 'p1' }), proposal({ id: 'p2' }), proposal({ id: 'p3', decision: 'accept' })];
    expect(unresolvedCount(proposals)).toBe(2);
  });

  it('is zero once every proposal has a decision', () => {
    const proposals = [proposal({ id: 'p1', decision: 'accept' }), proposal({ id: 'p2', decision: 'reject' })];
    expect(unresolvedCount(proposals)).toBe(0);
  });
});

describe('proposalSummary', () => {
  it('summarizes a person proposal as its name', () => {
    expect(proposalSummary(proposal({ proposal_type: 'person', payload: { citations: [], givenName: 'John', surname: 'Smith' } }))).toBe('John Smith');
  });

  it('summarizes a fact proposal as its statement', () => {
    expect(proposalSummary(proposal())).toBe('John Smith was a sailor.');
  });

  it('prefers the edited payload over the original once one exists', () => {
    const withEdit = proposal({ edited_payload: { citations: [], statement: 'Edited statement.' } });
    expect(proposalSummary(withEdit)).toBe('Edited statement.');
  });
});
