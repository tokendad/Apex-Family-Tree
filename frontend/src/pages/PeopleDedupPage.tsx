import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import styles from './PeopleDedupPage.module.css';

type Confidence = 'strong' | 'partial' | 'low';
type FieldChoice = 'canonical' | `duplicate:${string}`;

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
}

interface ScanResponse {
  groups: DuplicateGroup[];
}

interface MergeConflict {
  field: string;
  label: string;
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
  conflicts: MergeConflict[];
  transferCounts: TransferCounts;
}

interface MergeResult extends MergePreview {
  mergedPersonIds: string[];
}

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

export default function PeopleDedupPage() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [canonicalPersonId, setCanonicalPersonId] = useState<string | null>(null);
  const [fieldResolutions, setFieldResolutions] = useState<Record<string, FieldChoice>>({});
  const [preview, setPreview] = useState<MergePreview | null>(null);
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

  const scan = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setResult(null);
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
    try {
      const response = await fetch('/api/v1/tools/people-dedup/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await response.json() as MergePreview | { error?: string };
      if (!response.ok) throw new Error('error' in data && data.error ? data.error : 'Failed to preview merge');
      const nextPreview = data as MergePreview;
      setPreview(nextPreview);
      setFieldResolutions((current) => {
        const next = { ...current };
        for (const conflict of nextPreview.conflicts) {
          if (!next[conflict.field]) next[conflict.field] = conflict.canonicalValue ? 'canonical' : `duplicate:${conflict.duplicatePersonId}`;
        }
        return next;
      });
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
    setFieldResolutions({});
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<ToolsSidebar />}>
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>People Merge and De-Duplication</h1>
            <p className={styles.subtitle}>Find likely duplicate people, preview every data move, and merge only after review.</p>
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
                  <span className={styles.confidence}>{titleCase(selectedGroup.confidence)}</span>
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

                {preview && (
                  <div className={styles.preview}>
                    <h3>Merge preview</h3>
                    <div className={styles.transferGrid}>
                      {transferSummary(preview.transferCounts).map((item) => (
                        <span key={item} className={styles.transferPill}>{item}</span>
                      ))}
                    </div>

                    {preview.conflicts.length > 0 && (
                      <div className={styles.conflicts}>
                        <h4>Field choices</h4>
                        {preview.conflicts.map((conflict) => (
                          <fieldset key={`${conflict.field}-${conflict.duplicatePersonId}`} className={styles.conflict}>
                            <legend>{conflict.label}</legend>
                            <label>
                              <input
                                type="radio"
                                name={conflict.field}
                                checked={(fieldResolutions[conflict.field] ?? 'canonical') === 'canonical'}
                                onChange={() => setFieldResolutions((current) => ({ ...current, [conflict.field]: 'canonical' }))}
                              />
                              Keep current: {conflict.canonicalValue || 'blank'}
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={conflict.field}
                                checked={fieldResolutions[conflict.field] === `duplicate:${conflict.duplicatePersonId}`}
                                onChange={() => setFieldResolutions((current) => ({ ...current, [conflict.field]: `duplicate:${conflict.duplicatePersonId}` }))}
                              />
                              Use duplicate: {conflict.duplicateValue || 'blank'}
                            </label>
                          </fieldset>
                        ))}
                      </div>
                    )}

                    <button className={styles.dangerButton} type="button" onClick={applyMerge} disabled={loading}>
                      Apply Merge
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
