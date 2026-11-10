/**
 * #73 AI Research Intake. A Citation is "a verbatim quote plus where it came
 * from". For a text submission, citationVerification.ts checks `quote`
 * against the source text before a proposal is ever persisted -- a
 * substring match is mechanical, so 'verified'/'unverified' is a fact, not a
 * judgment call. For an image/PDF submission (#73 Phase 2) there is no
 * source text to substring-match against, so every citation is marked
 * 'unconfirmed_image' instead: the quote is still required (extraction
 * still drops anything with zero citations), but confirming it matches the
 * document is the reviewer's job, not a mechanical check. `region` is
 * reserved for a future crop-overlay UI and is always null for now --
 * Phase 2 ships file upload and the unconfirmed-citation status, not a
 * region picker.
 */
export interface Citation {
  quote: string;
  locator?: string | null;
  region?: { x: number; y: number; w: number; h: number } | null;
  citationStatus: 'verified' | 'unverified' | 'unconfirmed_image';
}

export interface PersonProposalPayload {
  type: 'person';
  /** The model's own self-identifying ref string for this person (e.g.
   *  "person_1"), stable only within this one extraction response. Other
   *  proposals in the same batch point back at a person by this string, not
   *  by any database id -- none exists yet until commit. */
  ref: string;
  givenName: string;
  surname: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  citations: Citation[];
  matches: { personId: string; score: number; reasons: string[]; displayName: string; birthYear: number | null }[];
  /** Set by a reviewer (via edited_payload) to commit against an existing
   *  person from `matches` instead of creating a new one. Never set by
   *  extraction itself. */
  existingPersonId?: string | null;
}

export interface RelationshipProposalPayload {
  type: 'relationship';
  /** A 'person' proposal's `ref` string within the same intake item. */
  personARef: string;
  personBRef: string;
  /** 'spouse_of' | 'parent_of' | 'child_of' -- A's role relative to B. */
  relType: 'spouse_of' | 'parent_of' | 'child_of';
  citations: Citation[];
}

export interface EventProposalPayload {
  type: 'event';
  /** A 'person' proposal's `ref` string within the same intake item. */
  personRef: string;
  eventType: string;
  date?: string | null;
  place?: string | null;
  citations: Citation[];
}

export interface FactProposalPayload {
  type: 'fact';
  statement: string;
  subjectRef: string;
  citations: Citation[];
}

export type ProposalPayload =
  | PersonProposalPayload
  | RelationshipProposalPayload
  | EventProposalPayload
  | FactProposalPayload;

export type ProposalType = ProposalPayload['type'];
export type ProposalDecision = 'accept' | 'edit' | 'reject';

export interface IntakeItem {
  id: string;
  created_by: string | null;
  /** '' for a file-only submission -- the column stays NOT NULL rather than
   *  needing a table rebuild to make it nullable. */
  source_text: string;
  source_artifact_id: string | null;
  source_hash: string;
  ai_job_id: string | null;
  status: 'pending' | 'extracting' | 'awaiting_review' | 'committed' | 'cancelled' | 'failed';
  created_at: string;
  committed_at: string | null;
  /** Set when this turn attached a file (#73 Phase 2). source_file_path is a
   *  staged, uncommitted location under DATA_DIR until commit creates the
   *  real artifact from it. */
  source_file_path: string | null;
  source_file_mime_type: string | null;
  source_file_original_name: string | null;
}

export interface IntakeProposal {
  id: string;
  intake_item_id: string;
  proposal_type: ProposalType;
  payload: ProposalPayload;
  confidence: number | null;
  decision: ProposalDecision | null;
  edited_payload: ProposalPayload | null;
  committed_object_id: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface IntakeConflict {
  id: string;
  intake_item_id: string;
  proposal_id: string;
  record_type: string;
  field_name: string;
  existing_value: string | null;
  incoming_value: string | null;
  resolution: 'accept_incoming' | 'keep_existing' | 'edit' | null;
  resolved_at: string | null;
  created_at: string;
}

/** What the extraction service hands back before persistence -- no id, no
 *  intake_item_id, no decision state yet. */
export type RawProposal = Omit<IntakeProposal, 'id' | 'intake_item_id' | 'decision' | 'edited_payload' | 'committed_object_id' | 'created_at' | 'decided_at'>;
