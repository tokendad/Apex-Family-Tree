import React, { useState } from 'react';
import type { IntakeProposal } from './intakeReview';
import { proposalSummary } from './intakeReview';
import styles from './AiAssistantPanel.module.css';

interface ProposalCardProps {
  proposal: IntakeProposal;
  disabled: boolean;
  onDecide: (decision: 'accept' | 'edit' | 'reject', editedPayload?: Record<string, unknown>) => void;
}

/** One extracted fact, rendered as the assistant's "reply": the citation
 *  quote(s) backing it, any existing-person matches for a person proposal,
 *  and accept/edit/reject controls. Editing is a plain-text statement edit
 *  for 'fact' proposals (the common case) -- other proposal types can only
 *  be accepted or rejected here, since editing their structured fields
 *  (refs, dates) needs more care than a textarea affords. */
const ProposalCard: React.FC<ProposalCardProps> = ({ proposal, disabled, onDecide }) => {
  const payload = proposal.edited_payload ?? proposal.payload;
  const citations = (payload.citations ?? []) as { quote: string; citationStatus: string }[];
  const matches = (payload.matches ?? []) as { personId: string; score: number; reasons: string[]; displayName: string; birthYear: number | null }[];
  const decided = proposal.decision;
  const isPerson = proposal.proposal_type === 'person';
  const [editText, setEditText] = useState(proposal.proposal_type === 'fact' ? String(payload.statement ?? '') : '');
  const [editing, setEditing] = useState(false);

  const badgeClass = decided === 'accept' ? styles.badgeAccepted : decided === 'reject' ? styles.badgeRejected : decided === 'edit' ? styles.badgeEdited : '';

  return (
    <div className={styles.proposalCard}>
      <div className={styles.proposalHeader}>
        <span className={styles.proposalType}>{proposal.proposal_type}</span>
        {decided && <span className={badgeClass}>{decided}</span>}
      </div>
      <p className={styles.proposalSummary}>{proposalSummary(proposal)}</p>

      {isPerson && matches.length > 0 && !decided && (
        <div className={styles.matchList}>
          <span className={styles.matchLabel}>Already in the tree — use instead of creating a new person?</span>
          {matches.map((match) => (
            <button
              key={match.personId}
              type="button"
              disabled={disabled}
              className={styles.matchChip}
              title={match.reasons.join('; ')}
              onClick={() => onDecide('edit', { ...payload, existingPersonId: match.personId })}
            >
              {match.displayName}{match.birthYear ? ` (b. ${match.birthYear})` : ''} — {match.score}% match
            </button>
          ))}
        </div>
      )}
      {isPerson && (payload.existingPersonId as string | null | undefined) && (
        <p className={styles.muted}>Will attach to existing person {String(payload.existingPersonId)}.</p>
      )}

      <ul className={styles.citationList}>
        {citations.map((citation, i) => (
          <li
            key={i}
            className={
              citation.citationStatus === 'verified' ? styles.citationVerified
                : citation.citationStatus === 'unconfirmed_image' ? styles.citationUnconfirmed
                  : styles.citationUnverified
            }
          >
            “{citation.quote}”
            {citation.citationStatus === 'unconfirmed_image' && (
              <span className={styles.citationUnconfirmedLabel}> — from image, verify against the source</span>
            )}
          </li>
        ))}
      </ul>

      {editing ? (
        <div className={styles.editRow}>
          <textarea
            className={styles.editTextarea}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={2}
          />
          <button
            type="button"
            className={styles.smallButton}
            onClick={() => {
              onDecide('edit', { ...payload, statement: editText });
              setEditing(false);
            }}
          >
            Save edit
          </button>
        </div>
      ) : (
        <div className={styles.decisionRow}>
          <button type="button" disabled={disabled} className={styles.smallButton} onClick={() => onDecide('accept')}>
            {isPerson && matches.length > 0 ? 'Create as new person' : 'Accept'}
          </button>
          {proposal.proposal_type === 'fact' && (
            <button type="button" disabled={disabled} className={styles.smallButton} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          <button type="button" disabled={disabled} className={styles.smallButtonDanger} onClick={() => onDecide('reject')}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
};

export default ProposalCard;
