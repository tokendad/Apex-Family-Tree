export type ProposalType = 'person' | 'relationship' | 'event' | 'fact';
export type ProposalDecisionKind = 'accept' | 'edit' | 'reject';

export interface Citation {
  quote: string;
  locator?: string | null;
  citationStatus: 'verified' | 'unverified';
}

export interface IntakeProposal {
  id: string;
  intake_item_id: string;
  proposal_type: ProposalType;
  payload: Record<string, unknown> & { citations: Citation[] };
  confidence: number | null;
  decision: ProposalDecisionKind | null;
  edited_payload: (Record<string, unknown> & { citations: Citation[] }) | null;
  committed_object_id: string | null;
}

export interface IntakeConflict {
  id: string;
  proposal_id: string;
  record_type: string;
  field_name: string;
  existing_value: string | null;
  incoming_value: string | null;
}

export interface IntakeItem {
  id: string;
  source_text: string;
  status: 'pending' | 'extracting' | 'awaiting_review' | 'committed' | 'cancelled' | 'failed';
  created_at: string;
}

/** How many proposals in this turn still have no decision -- the commit
 *  button stays disabled until this is 0, since #73 forbids a partial
 *  silent commit. Each decision posts to the server immediately (see
 *  ProposalCard/AiAssistantPanel), so `proposal.decision` itself -- not a
 *  separate local draft state -- is the source of truth here. */
export function unresolvedCount(proposals: IntakeProposal[]): number {
  return proposals.filter((proposal) => !proposal.decision).length;
}

export function proposalSummary(proposal: IntakeProposal): string {
  const payload = proposal.edited_payload ?? proposal.payload;
  switch (proposal.proposal_type) {
    case 'person': {
      const given = String(payload.givenName ?? '');
      const surname = String(payload.surname ?? '');
      return [given, surname].filter(Boolean).join(' ') || 'Unnamed person';
    }
    case 'relationship':
      return `${String(payload.personARef ?? '?')} — ${String(payload.relType ?? '')} — ${String(payload.personBRef ?? '?')}`;
    case 'event':
      return `${String(payload.eventType ?? 'event')}${payload.date ? ` (${String(payload.date)})` : ''}`;
    case 'fact':
      return String(payload.statement ?? '');
    default:
      return 'Proposal';
  }
}
