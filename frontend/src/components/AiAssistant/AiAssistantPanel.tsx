import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAiAssistantStore } from '@/stores/aiAssistantStore';
import ProposalCard from './ProposalCard';
import type { IntakeConflict, IntakeItem, IntakeProposal } from './intakeReview';
import { unresolvedCount } from './intakeReview';
import styles from './AiAssistantPanel.module.css';

// 150 attempts at 2s comfortably outlasts the provider client's own 120s
// request timeout plus its retries, matching Phase 0.5's transcribe poll.
async function pollIntakeItem(id: string): Promise<IntakeItem> {
  for (let attempt = 0; attempt < 150; attempt++) {
    const res = await fetch(`/api/v1/intake/${id}`);
    if (!res.ok) throw new Error('Failed to check extraction status');
    const body = await res.json() as { item: IntakeItem; error: string | null };
    if (body.item.status === 'awaiting_review' || body.item.status === 'failed') {
      if (body.item.status === 'failed') throw new Error(body.error ?? 'Extraction failed');
      return body.item;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Extraction is taking longer than expected. It may still finish — reopen the panel in a minute.');
}

interface TurnProps {
  item: IntakeItem;
  pending: boolean;
  error: string | null;
}

/** One past submission, rendered as a chat "turn": the pasted text, then the
 *  assistant's reply as a list of structured proposal cards (not free-text
 *  chat) once extraction finishes. */
const IntakeTurn: React.FC<TurnProps> = ({ item, pending, error }) => {
  const [proposals, setProposals] = useState<IntakeProposal[]>([]);
  const [conflicts, setConflicts] = useState<IntakeConflict[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committed, setCommitted] = useState(item.status === 'committed');

  const loadProposals = useCallback(async () => {
    const res = await fetch(`/api/v1/intake/${item.id}/proposals`);
    if (!res.ok) return;
    const body = await res.json() as { proposals: IntakeProposal[]; conflicts: IntakeConflict[] };
    setProposals(body.proposals);
    setConflicts(body.conflicts);
    setLoaded(true);
  }, [item.id]);

  useEffect(() => {
    if (item.status === 'awaiting_review' || item.status === 'committed') void loadProposals();
  }, [item.status, loadProposals]);

  const decide = async (proposalId: string, decision: 'accept' | 'edit' | 'reject', editedPayload?: Record<string, unknown>) => {
    const res = await fetch(`/api/v1/intake/${item.id}/proposals/${proposalId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, editedPayload }),
    });
    if (res.ok) void loadProposals();
  };

  const handleCommit = async () => {
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await fetch(`/api/v1/intake/${item.id}/commit`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Commit failed');
      }
      setCommitted(true);
      void loadProposals();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setCommitting(false);
    }
  };

  const remaining = unresolvedCount(proposals);

  return (
    <div className={styles.turn}>
      <div className={styles.userBubble}>{item.source_text}</div>

      <div className={styles.assistantReply}>
        {pending && <p className={styles.muted}>Reading the text and looking for citable facts…</p>}
        {!pending && error && <p className={styles.error}>{error}</p>}

        {!pending && !error && loaded && proposals.length === 0 && (
          <p className={styles.muted}>No citable facts found in this text.</p>
        )}

        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            disabled={committed}
            onDecide={(decision, editedPayload) => void decide(proposal.id, decision, editedPayload)}
          />
        ))}

        {conflicts.length > 0 && (
          <div className={styles.conflictBanner}>
            <strong>{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}</strong> found at commit —
            neither value was chosen automatically.
            <ul>
              {conflicts.map((conflict) => (
                <li key={conflict.id}>
                  {conflict.field_name}: existing “{conflict.existing_value ?? '—'}” vs. incoming “{conflict.incoming_value ?? '—'}”
                </li>
              ))}
            </ul>
          </div>
        )}

        {loaded && proposals.length > 0 && !committed && (
          <div className={styles.commitRow}>
            <button
              type="button"
              className={styles.commitButton}
              disabled={committing || remaining > 0}
              onClick={() => void handleCommit()}
            >
              {committing ? 'Committing…' : remaining > 0 ? `Commit (${remaining} undecided)` : 'Commit Accepted'}
            </button>
          </div>
        )}
        {committed && <p className={styles.committedNote}>Committed to the tree.</p>}
        {commitError && <p className={styles.error}>{commitError}</p>}
      </div>
    </div>
  );
};

/** The global AI Assistant panel's content (#73). AiAssistantHost portals
 *  this in; it is otherwise a normal component so it's easy to test. */
const AiAssistantPanel: React.FC = () => {
  const close = useAiAssistantStore((s) => s.close);
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [errorsByItem, setErrorsByItem] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async () => {
    const res = await fetch('/api/v1/intake');
    if (!res.ok) return;
    const body = await res.json() as { items: IntakeItem[] };
    // Oldest first, so the transcript reads top-to-bottom like a chat log.
    const ordered = [...body.items].reverse();
    setItems(ordered);

    // A previously-failed submission's error lives on its ai_job, not on the
    // item row itself -- fetch it so history doesn't render a silently blank
    // reply for a turn that failed before this session opened the panel.
    for (const item of ordered) {
      if (item.status !== 'failed') continue;
      const detail = await fetch(`/api/v1/intake/${item.id}`);
      if (!detail.ok) continue;
      const detailBody = await detail.json() as { error: string | null };
      setErrorsByItem((prev) => ({ ...prev, [item.id]: detailBody.error ?? 'Extraction failed' }));
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  useEffect(() => {
    // jsdom (unit tests) has no scrollTo implementation on Element.
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [items, pendingItemId]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/v1/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Submission failed');
      }
      const { intakeItemId } = await res.json() as { intakeItemId: string };
      setText('');
      setItems((prev) => (prev.some((item) => item.id === intakeItemId)
        ? prev
        : [...prev, { id: intakeItemId, source_text: trimmed, status: 'extracting', created_at: new Date().toISOString() }]));
      setErrorsByItem((prev) => { const { [intakeItemId]: _omit, ...rest } = prev; return rest; });
      setPendingItemId(intakeItemId);

      try {
        const finished = await pollIntakeItem(intakeItemId);
        setItems((prev) => prev.map((item) => (item.id === intakeItemId ? finished : item)));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extraction failed';
        setItems((prev) => prev.map((item) => (item.id === intakeItemId ? { ...item, status: 'failed' } : item)));
        setErrorsByItem((prev) => ({ ...prev, [intakeItemId]: message }));
      } finally {
        setPendingItemId(null);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.panel} role="dialog" aria-label="AI Assistant">
      <div className={styles.header}>
        <span className={styles.title}>AI Assistant</span>
        <button type="button" className={styles.closeButton} aria-label="Close AI Assistant" onClick={close}>
          ×
        </button>
      </div>

      <div className={styles.transcript} ref={scrollRef}>
        {items.length === 0 && (
          <p className={styles.muted}>
            Paste research text below — a letter transcript, an obituary, a census note — and I&apos;ll propose
            facts to add, each backed by a quote from what you pasted. Nothing is added to the tree until you
            review and commit it.
          </p>
        )}
        {items.map((item) => (
          <IntakeTurn
            key={item.id}
            item={item}
            pending={item.id === pendingItemId}
            error={errorsByItem[item.id] ?? null}
          />
        ))}
      </div>

      {submitError && <p className={styles.error}>{submitError}</p>}

      <div className={styles.inputRow}>
        <textarea
          className={styles.textInput}
          placeholder="Paste research text to analyze…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          disabled={submitting}
        />
        <div className={styles.inputActions}>
          <button type="button" className={styles.attachButton} disabled title="Coming in a later update">
            Attach file
          </button>
          <button
            type="button"
            className={styles.sendButton}
            disabled={submitting || !text.trim()}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPanel;
