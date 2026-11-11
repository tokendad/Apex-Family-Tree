import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAiAssistantStore } from '@/stores/aiAssistantStore';
import { useAuth } from '@/contexts/AuthContext.js';
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
  /** An object URL for the file just attached this session, so the reviewer
   *  can see the image a citation claims to be "from" without yet having a
   *  server route to stream the staged/committed file back. Only ever set
   *  for the turn submitted in this panel session -- history loaded from
   *  GET /intake has no local Blob to build one from. */
  previewUrl?: string | null;
}

/** One past submission, rendered as a chat "turn": the pasted text and/or
 *  attached file, then the assistant's reply as a list of structured
 *  proposal cards (not free-text chat) once extraction finishes. */
const IntakeTurn: React.FC<TurnProps> = ({ item: initialItem, pending, error, previewUrl }) => {
  // A manual submission's extraction is actively polled by the parent
  // (handleSubmit), which owns pendingItemId/errorsByItem for it. A
  // 'suggested' item (#73 Phase 3) is created by a scan the parent doesn't
  // track the same way -- several may be queued at once -- so this turn
  // polls its own status independently until it settles.
  const [item, setItem] = useState(initialItem);
  const [selfError, setSelfError] = useState<string | null>(null);

  // The parent actively updates its items array as a manual submission's
  // extraction resolves (pollIntakeItem) -- that new prop value has to win
  // here too, or this turn keeps showing its stale initial mount state.
  useEffect(() => {
    setItem(initialItem);
  }, [initialItem]);
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

  useEffect(() => {
    if (item.trigger !== 'suggested' || (item.status !== 'pending' && item.status !== 'extracting')) return;
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 150 && !cancelled; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const res = await fetch(`/api/v1/intake/${item.id}`);
        if (!res.ok || cancelled) return;
        const body = await res.json() as { item: IntakeItem; error: string | null };
        if (body.item.status === 'awaiting_review') {
          if (!cancelled) setItem(body.item);
          return;
        }
        if (body.item.status === 'failed') {
          if (!cancelled) {
            setItem(body.item);
            setSelfError(body.error ?? 'Extraction failed');
          }
          return;
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.trigger]);

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
  const selfPending = item.status === 'pending' || item.status === 'extracting';
  const isPending = pending || (item.trigger === 'suggested' && selfPending);
  const effectiveError = error ?? selfError;

  return (
    <div className={styles.turn}>
      {item.trigger === 'suggested' ? (
        <div className={styles.suggestedBubble}>
          <span className={styles.suggestedBadge}>🔍 Suggested</span>
          {item.source_artifact_id && (
            <a href={`/artifacts/${item.source_artifact_id}`} className={styles.suggestedLink} target="_blank" rel="noreferrer">
              from this artifact
            </a>
          )}
        </div>
      ) : (
        <div className={styles.userBubble}>
          {item.source_text && <p className={styles.userBubbleText}>{item.source_text}</p>}
          {item.source_file_original_name && (
            <div className={styles.userBubbleFile}>
              {previewUrl && item.source_file_mime_type?.startsWith('image/') ? (
                <img src={previewUrl} alt={item.source_file_original_name} className={styles.userBubbleImage} />
              ) : (
                <span className={styles.fileChip}>📎 {item.source_file_original_name}</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className={styles.assistantReply}>
        {isPending && <p className={styles.muted}>Reading the source and looking for citable facts…</p>}
        {!isPending && effectiveError && <p className={styles.error}>{effectiveError}</p>}

        {!isPending && !effectiveError && loaded && proposals.length === 0 && (
          <p className={styles.muted}>No citable facts found in this source.</p>
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

// Same five types the backend's ALLOWED_UPLOAD_MIME_TYPES accepts.
const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';

/** The global AI Assistant panel's content (#73). AiAssistantHost portals
 *  this in; it is otherwise a normal component so it's easy to test. */
const AiAssistantPanel: React.FC = () => {
  const close = useAiAssistantStore((s) => s.close);
  const { user } = useAuth();
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [text, setText] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [errorsByItem, setErrorsByItem] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URLs are per-viewer browser memory, not server state -- revoke
  // them when the panel closes so an attached photo doesn't leak for the
  // rest of the tab's lifetime.
  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!trimmed && !attachedFile) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let res: Response;
      if (attachedFile) {
        const formData = new FormData();
        formData.append('file', attachedFile);
        if (trimmed) formData.append('text', trimmed);
        // No Content-Type header: the browser sets the multipart boundary
        // itself, and setting it by hand here would omit that boundary.
        res = await fetch('/api/v1/intake', { method: 'POST', body: formData });
      } else {
        res = await fetch('/api/v1/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Submission failed');
      }
      const { intakeItemId } = await res.json() as { intakeItemId: string };

      if (attachedFile) {
        const url = URL.createObjectURL(attachedFile);
        setPreviewUrls((prev) => ({ ...prev, [intakeItemId]: url }));
      }

      setText('');
      setAttachedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setItems((prev) => (prev.some((item) => item.id === intakeItemId)
        ? prev
        : [...prev, {
            id: intakeItemId,
            source_text: trimmed,
            status: 'extracting',
            created_at: new Date().toISOString(),
            source_file_path: null,
            source_file_mime_type: attachedFile?.type ?? null,
            source_file_original_name: attachedFile?.name ?? null,
            source_artifact_id: null,
            trigger: 'manual',
          }]));
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

  // #73 Phase 3. Admin-only server-side (the route 403s anyone else), and
  // the button is hidden for anyone else too rather than shown-then-denied.
  const handleScan = async () => {
    setScanning(true);
    setScanError(null);
    setScanNotice(null);
    try {
      const res = await fetch('/api/v1/intake/scan-suggestions', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Scan failed');
      }
      const { queued } = await res.json() as { queued: number };
      if (queued === 0) {
        setScanNotice('Nothing new to scan — every transcribed artifact has already been reviewed.');
      }
      await loadItems();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className={styles.panel} role="dialog" aria-label="AI Assistant">
      <div className={styles.header}>
        <span className={styles.title}>AI Assistant</span>
        {user?.role === 'admin' && (
          <button
            type="button"
            className={styles.scanButton}
            disabled={scanning}
            onClick={() => void handleScan()}
            title="Scan existing artifacts with a transcript for facts worth suggesting"
          >
            {scanning ? 'Scanning…' : '🔍 Scan for Suggestions'}
          </button>
        )}
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
            previewUrl={previewUrls[item.id] ?? null}
          />
        ))}
      </div>

      {submitError && <p className={styles.error}>{submitError}</p>}
      {scanError && <p className={styles.error}>{scanError}</p>}
      {scanNotice && <p className={styles.muted}>{scanNotice}</p>}

      <div className={styles.inputRow}>
        {attachedFile && (
          <div className={styles.attachedFileRow}>
            <span className={styles.fileChip}>📎 {attachedFile.name}</span>
            <button
              type="button"
              className={styles.removeFileButton}
              aria-label="Remove attached file"
              onClick={() => {
                setAttachedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            >
              ×
            </button>
          </div>
        )}
        <textarea
          className={styles.textInput}
          placeholder="Paste research text to analyze…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          disabled={submitting}
        />
        <div className={styles.inputActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            className={styles.hiddenFileInput}
            onChange={(e) => setAttachedFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className={styles.attachButton}
            disabled={submitting}
            onClick={() => fileInputRef.current?.click()}
          >
            {attachedFile ? 'Change file' : 'Attach file'}
          </button>
          <button
            type="button"
            className={styles.sendButton}
            disabled={submitting || (!text.trim() && !attachedFile)}
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
