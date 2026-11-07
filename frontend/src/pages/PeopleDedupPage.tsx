import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import styles from './PeopleDedupPage.module.css';

type Confidence = 'strong' | 'partial' | 'low';
type ComparisonStatus = 'match' | 'possible' | 'different' | 'missing';
type FieldChoice = 'canonical' | `duplicate:${string}` | 'blank';

interface DuplicatePerson {
  id: string;
  displayName: string;
  birthDate: string | null;
  deathDate: string | null;
  relationshipCount: number;
  sourceCount: number;
  mediaCount: number;
}

interface DuplicateGroup {
  id: string;
  confidence: Confidence;
  reasons: string[];
  people: DuplicatePerson[];
  matchScore: number | null;
}

interface ScanResponse {
  groups: DuplicateGroup[];
}

interface MergeComparison {
  field: string;
  label: string;
  status: ComparisonStatus;
  hasSelection: boolean;
  canonicalValue: string | null;
  duplicatePersonId: string;
  duplicateValue: string | null;
}

interface TransferCounts {
  names: number;
  events: number;
  families: number;
  sourceCitations: number;
  mediaLinks: number;
  mediaRegions: number;
  userHomePeople: number;
  exportScopes: number;
}

interface MergePreview {
  groupId: string;
  canonicalPersonId: string;
  duplicatePersonIds: string[];
  comparisons: MergeComparison[];
  transferCounts: TransferCounts;
}

interface MergeResult extends MergePreview {
  mergedPersonIds: string[];
}

const STATUS_META: Record<ComparisonStatus, { icon: string; label: string; rowClass: string }> = {
  match: { icon: '✓', label: 'Exact match', rowClass: 'rowMatch' },
  possible: { icon: '?', label: 'Possible match', rowClass: 'rowPossible' },
  different: { icon: '⚠', label: 'Different information', rowClass: 'rowDifferent' },
  missing: { icon: 'i', label: 'Missing information', rowClass: 'rowMissing' },
};

function ToolsSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="People de-duplication tools">
      <Link to="/tools" className={styles.backLink}>
        Tools
      </Link>
      <span className={styles.sidebarTitle}>People Merge</span>
      <span className={styles.sidebarText}>Scan for likely duplicate people and review every merge before it changes data.</span>
    </aside>
  );
}

function countLabel(value: number, label: string): string {
  if (label === 'media') return `${value} media`;
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function factLine(person: DuplicatePerson): string {
  const facts = [
    person.birthDate ? `b. ${person.birthDate}` : 'birth unknown',
    person.deathDate ? `d. ${person.deathDate}` : null,
  ].filter(Boolean);
  return facts.join(' | ');
}

function transferSummary(counts: TransferCounts): string[] {
  return [
    countLabel(counts.names, 'name'),
    countLabel(counts.events, 'event'),
    countLabel(counts.families, 'family link'),
    countLabel(counts.sourceCitations, 'source citation'),
    countLabel(counts.mediaLinks, 'media link'),
    countLabel(counts.mediaRegions, 'media tag'),
  ];
}

function requiresSelection(comparison: MergeComparison): boolean {
  return comparison.hasSelection && (comparison.status === 'different' || comparison.status === 'possible');
}

export default function PeopleDedupPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [canonicalPersonId, setCanonicalPersonId] = useState<string | null>(null);
  const [fieldResolutions, setFieldResolutions] = useState<Record<string, FieldChoice>>({});
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [showReviewMerge, setShowReviewMerge] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null,
    [groups, selectedGroupId],
  );

  const duplicatePersonIds = useMemo(() => {
    if (!selectedGroup || !canonicalPersonId) return [];
    return selectedGroup.people.map((person) => person.id).filter((id) => id !== canonicalPersonId);
  }, [canonicalPersonId, selectedGroup]);

  const personNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of selectedGroup?.people ?? []) map.set(person.id, person.displayName);
    return map;
  }, [selectedGroup]);

  const unresolvedComparisons = useMemo(
    () => (preview?.comparisons ?? []).filter((comparison) => requiresSelection(comparison) && !fieldResolutions[comparison.field]),
    [preview, fieldResolutions],
  );

  useEffect(() => {
    if (!preview) return;
    setFieldResolutions((current) => {
      const next = { ...current };
      for (const comparison of preview.comparisons) {
        if (!comparison.hasSelection || next[comparison.field]) continue;
        if (comparison.status === 'missing') {
          next[comparison.field] = comparison.canonicalValue
            ? 'canonical'
            : comparison.duplicateValue
              ? `duplicate:${comparison.duplicatePersonId}`
              : 'blank';
        }
      }
      return next;
    });
  }, [preview]);

  const scan = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
    setShowReviewMerge(false);
    try {
      const response = await fetch('/api/v1/tools/people-dedup/scan', { credentials: 'include' });
      const data = await response.json() as ScanResponse | { error?: string };
      if (!response.ok) throw new Error('error' in data && data.error ? data.error : 'Failed to scan for duplicates');
      const nextGroups = (data as ScanResponse).groups;
      setGroups(nextGroups);
      setSelectedGroupId(nextGroups[0]?.id ?? null);
      setCanonicalPersonId(nextGroups[0]?.people[0]?.id ?? null);
      setFieldResolutions({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan for duplicates');
    } finally {
      setLoading(false);
    }
  };

  const buildPayload = () => {
    if (!selectedGroup || !canonicalPersonId) return null;
    return {
      groupId: selectedGroup.id,
      canonicalPersonId,
      duplicatePersonIds,
      fieldResolutions,
    };
  };

  const previewMerge = async () => {
    const payload = buildPayload();
    if (!payload || payload.duplicatePersonIds.length === 0) return;
    setLoading(true);
    setError(null);
    setShowReviewMerge(false);
    try {
      const response = await fetch('/api/v1/tools/people-dedup/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json() as MergePreview | { error?: string };
      if (!response.ok) throw new Error('error' in data && data.error ? data.error : 'Failed to preview merge');
      setPreview(data as MergePreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview merge');
    } finally {
      setLoading(false);
    }
  };

  const applyMerge = async () => {
    const payload = buildPayload();
    if (!payload || payload.duplicatePersonIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/tools/people-dedup/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json() as MergeResult | { error?: string };
      if (!response.ok) throw new Error('error' in data && data.error ? data.error : 'Failed to apply merge');
      setResult(data as MergeResult);
      setShowReviewMerge(false);
      await scan();
      setResult(data as MergeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply merge');
    } finally {
      setLoading(false);
    }
  };

  const chooseGroup = (group: DuplicateGroup) => {
    setSelectedGroupId(group.id);
    setCanonicalPersonId(group.people[0]?.id ?? null);
    setPreview(null);
    setResult(null);
    setShowReviewMerge(false);
    setFieldResolutions({});
  };

  const setResolution = (field: string, choice: FieldChoice) => {
    setFieldResolutions((current) => ({ ...current, [field]: choice }));
  };

  const resolvedValue = (comparison: MergeComparison): string => {
    const choice = fieldResolutions[comparison.field];
    if (choice === 'blank') return 'blank';
    if (choice === `duplicate:${comparison.duplicatePersonId}`) return comparison.duplicateValue || 'blank';
    return comparison.canonicalValue || 'blank';
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<ToolsSidebar />}>
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>People Merge and De-Duplication</h1>
            <p className={styles.subtitle}>Find likely duplicate people, compare every field side by side, and merge only after review.</p>
          </div>
          <button className={styles.primaryButton} type="button" onClick={scan} disabled={loading}>
            {loading ? 'Working...' : 'Scan for Duplicates'}
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {result && (
          <div className={styles.success}>
            Merged {result.mergedPersonIds.length} duplicate {result.mergedPersonIds.length === 1 ? 'person' : 'people'}.
          </div>
        )}

        {groups.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No scan results yet</h2>
            <p>Run a scan to look for duplicate people by name and vital facts.</p>
          </div>
        ) : (
          <div className={styles.layout}>
            <div className={styles.groupList} aria-label="Duplicate groups">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`${styles.groupButton} ${group.id === selectedGroup?.id ? styles.groupButtonActive : ''}`}
                  onClick={() => chooseGroup(group)}
                >
                  <span className={styles.confidence}>{titleCase(group.confidence)}</span>
                  <span>{group.people.map((person) => person.displayName).join(' / ')}</span>
                  <span className={styles.groupMeta}>{group.people.length} people</span>
                </button>
              ))}
            </div>

            {selectedGroup && (
              <div className={styles.reviewPanel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Review candidate group</h2>
                    <p>{selectedGroup.reasons.join(', ')}</p>
                  </div>
                  <div className={styles.headerBadges}>
                    <span className={styles.confidence}>{titleCase(selectedGroup.confidence)}</span>
                    {selectedGroup.matchScore !== null && (
                      <span className={styles.matchScore}>Likely Match: {selectedGroup.matchScore}%</span>
                    )}
                  </div>
                </div>

                <div className={styles.personGrid}>
                  {selectedGroup.people.map((person) => (
                    <label key={person.id} className={styles.personCard}>
                      <input
                        type="radio"
                        name="canonical-person"
                        checked={canonicalPersonId === person.id}
                        onChange={() => {
                          setCanonicalPersonId(person.id);
                          setPreview(null);
                          setShowReviewMerge(false);
                          setFieldResolutions({});
                        }}
                        aria-label={`Keep ${person.displayName} ${person.id}`}
                      />
                      <span className={styles.personName}>{person.displayName}</span>
                      <span className={styles.personFacts}>{factLine(person)}</span>
                      <span className={styles.personStats}>
                        {countLabel(person.relationshipCount, 'relationship')} · {countLabel(person.sourceCount, 'source')} · {countLabel(person.mediaCount, 'media')}
                      </span>
                    </label>
                  ))}
                </div>

                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={previewMerge}
                  disabled={!canonicalPersonId || duplicatePersonIds.length === 0 || loading}
                >
                  Preview Merge
                </button>

                {preview && !showReviewMerge && (
                  <div className={styles.preview}>
                    <h3>Field comparison</h3>
                    <div
                      className={styles.comparisonTable}
                      role="table"
                      aria-label={`Field comparison between ${personNameById.get(preview.canonicalPersonId) ?? 'Person 1'} and other candidates`}
                    >
                      {preview.comparisons.map((comparison) => {
                        const meta = STATUS_META[comparison.status];
                        const rowClass = `${styles.comparisonRow} ${styles[meta.rowClass]}`;
                        const blocked = requiresSelection(comparison) && !fieldResolutions[comparison.field];
                        return (
                          <fieldset key={`${comparison.field}-${comparison.duplicatePersonId}`} className={rowClass} role="row">
                            <legend className={styles.comparisonLabel}>
                              <span className={styles.statusIcon} aria-hidden="true">{meta.icon}</span>
                              <span className={styles.visuallyHidden}>{meta.label}: </span>
                              {comparison.label}
                              {blocked && <span className={styles.selectionRequired}> — selection required</span>}
                            </legend>

                            {!comparison.hasSelection ? (
                              <p className={styles.comparisonReadOnly}>
                                <span>{comparison.canonicalValue || 'Not recorded'}</span>
                                <span>{comparison.duplicateValue || 'Not recorded'}</span>
                                <span className={styles.comparisonCaption}>Both records&apos; relationships are kept after merging.</span>
                              </p>
                            ) : comparison.status === 'match' ? (
                              <p className={styles.comparisonReadOnly}>
                                <span>{comparison.canonicalValue || 'Not recorded'}</span>
                                <span>{comparison.duplicateValue || 'Not recorded'}</span>
                              </p>
                            ) : (
                              <div className={styles.comparisonChoices}>
                                <label>
                                  <input
                                    type="radio"
                                    name={comparison.field}
                                    checked={fieldResolutions[comparison.field] === 'canonical'}
                                    onChange={() => setResolution(comparison.field, 'canonical')}
                                  />
                                  Use this: {comparison.canonicalValue || 'blank'}
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name={comparison.field}
                                    checked={fieldResolutions[comparison.field] === `duplicate:${comparison.duplicatePersonId}`}
                                    onChange={() => setResolution(comparison.field, `duplicate:${comparison.duplicatePersonId}`)}
                                  />
                                  Use this: {comparison.duplicateValue || 'blank'}
                                </label>
                                {comparison.status === 'missing' && (!comparison.canonicalValue || !comparison.duplicateValue) && (
                                  <label>
                                    <input
                                      type="radio"
                                      name={comparison.field}
                                      checked={fieldResolutions[comparison.field] === 'blank'}
                                      onChange={() => setResolution(comparison.field, 'blank')}
                                    />
                                    Use blank
                                  </label>
                                )}
                              </div>
                            )}
                          </fieldset>
                        );
                      })}
                    </div>

                    <div className={styles.legend} aria-label="Comparison legend">
                      <span><span aria-hidden="true">{STATUS_META.match.icon}</span> Exact match — information agrees on both sides.</span>
                      <span><span aria-hidden="true">{STATUS_META.possible.icon}</span> Possible match — similar but not identical; confirm which to keep.</span>
                      <span><span aria-hidden="true">{STATUS_META.different.icon}</span> Different — values conflict; a choice is required.</span>
                      <span><span aria-hidden="true">{STATUS_META.missing.icon}</span> Missing — only one side has this fact.</span>
                    </div>

                    <div className={styles.transferGrid}>
                      {transferSummary(preview.transferCounts).map((item) => (
                        <span key={item} className={styles.transferPill}>{item}</span>
                      ))}
                    </div>

                    <button
                      className={styles.dangerButton}
                      type="button"
                      onClick={() => setShowReviewMerge(true)}
                      disabled={loading || unresolvedComparisons.length > 0}
                    >
                      Review Merge
                    </button>
                    {unresolvedComparisons.length > 0 && (
                      <p className={styles.error}>
                        Resolve {unresolvedComparisons.length} more field{unresolvedComparisons.length === 1 ? '' : 's'} before reviewing the merge.
                      </p>
                    )}
                  </div>
                )}

                {preview && showReviewMerge && (
                  <div className={styles.preview}>
                    <h3>Review merge</h3>
                    <p>
                      {personNameById.get(preview.canonicalPersonId) ?? 'The selected person'} will survive the merge.
                      {' '}The following values will be kept:
                    </p>
                    <ul className={styles.reviewList}>
                      {preview.comparisons.filter((c) => c.hasSelection).map((comparison) => (
                        <li key={`${comparison.field}-${comparison.duplicatePersonId}`} className={styles.reviewRow}>
                          <strong>{comparison.label}:</strong> {resolvedValue(comparison)}
                          {resolvedValue(comparison) !== (comparison.canonicalValue || 'blank') && (
                            <span className={styles.comparisonCaption}> (replaces current value)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className={styles.comparisonCaption}>
                      Relationships, sources, citations, media, and notes from every merged record are kept.
                    </p>
                    <div className={styles.transferGrid}>
                      {transferSummary(preview.transferCounts).map((item) => (
                        <span key={item} className={styles.transferPill}>{item}</span>
                      ))}
                    </div>
                    <button className={styles.secondaryButton} type="button" onClick={() => setShowReviewMerge(false)} disabled={loading}>
                      Back
                    </button>
                    <button className={styles.dangerButton} type="button" onClick={applyMerge} disabled={loading}>
                      Confirm Merge
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
