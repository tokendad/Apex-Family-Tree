import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './TreeIssuesPage.module.css';

type IssueStatus = 'open' | 'resolved' | 'dismissed';
type IssueSeverity = 'high' | 'medium' | 'low';

interface TreeIssue {
  id: string;
  type: string;
  severity: IssueSeverity;
  status: IssueStatus;
  title: string;
  summary: string;
  primary_entity_type: string;
  primary_entity_id: string;
  related_entities_json: string;
  detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  note: string | null;
}

interface TreeIssueSummary {
  open: number;
  bySeverity: Record<IssueSeverity, number>;
  byType: Record<string, number>;
  lastScanAt: string | null;
}

interface RelatedEntity {
  type: string;
  id: string;
  label?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  multiple_active_marriages: 'Multiple active marriages',
  death_with_active_family: 'Death with active family',
  marriage_event_without_family: 'Marriage event without family',
  family_without_marriage_event: 'Family without marriage event',
  missing_core_person_data: 'Missing core data',
  unconnected_person: 'Unconnected person',
  unresolved_import_conflict: 'Import conflict',
};

function TreeIssuesSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Tree issue tools">
      <Link to="/tools" className={styles.backLink}>Tools</Link>
      <span className={styles.sidebarTitle}>Tree Issues</span>
      <span className={styles.sidebarText}>Track data-quality warnings and jump to affected records.</span>
    </aside>
  );
}

function parseRelated(issue: TreeIssue): RelatedEntity[] {
  try {
    const parsed = JSON.parse(issue.related_entities_json) as RelatedEntity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function entityHref(type: string, id: string): string | null {
  if (type === 'person') return `/people/${id}`;
  if (type === 'family') return `/families/${id}`;
  if (type === 'import_job' || type === 'import_conflict') return '/import';
  return null;
}

function formatType(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

function statusLabel(status: IssueStatus): string {
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

export default function TreeIssuesPage() {
  const { canEdit } = usePermissions();
  const [summary, setSummary] = useState<TreeIssueSummary | null>(null);
  const [issues, setIssues] = useState<TreeIssue[]>([]);
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'all'>('open');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | 'all'>('all');
  const [dismissNotes, setDismissNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);

      const [summaryResponse, issuesResponse] = await Promise.all([
        fetch('/api/v1/tools/tree-issues/summary', { credentials: 'include' }),
        fetch(`/api/v1/tools/tree-issues?${params.toString()}`, { credentials: 'include' }),
      ]);

      if (!summaryResponse.ok) throw new Error('Failed to load tree issue summary');
      if (!issuesResponse.ok) throw new Error('Failed to load tree issues');

      setSummary(await summaryResponse.json() as TreeIssueSummary);
      const issueData = await issuesResponse.json() as { data: TreeIssue[] };
      setIssues(issueData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tree issues');
    } finally {
      setLoading(false);
    }
  }, [severityFilter, statusFilter, typeFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const issueTypes = useMemo(() => {
    const types = new Set(issues.map((issue) => issue.type));
    if (summary) {
      for (const type of Object.keys(summary.byType)) types.add(type);
    }
    return Array.from(types).sort();
  }, [issues, summary]);

  const scan = async () => {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/v1/tools/tree-issues/scan', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json() as { detected?: number; open?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to scan tree');
      setMessage(`Scan found ${data.detected ?? 0} issue patterns and ${data.open ?? 0} open issues.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan tree');
    } finally {
      setWorking(false);
    }
  };

  const updateIssue = async (issue: TreeIssue, status: IssueStatus) => {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const note = status === 'dismissed' ? dismissNotes[issue.id]?.trim() : undefined;
      const response = await fetch(`/api/v1/tools/tree-issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, note }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to update tree issue');
      setMessage(`Issue marked ${status}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tree issue');
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<TreeIssuesSidebar />}>
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Tree Issues</h1>
            <p className={styles.subtitle}>Review warnings, open affected records, and keep intentional exceptions documented.</p>
          </div>
          {canEdit && (
            <button className={styles.primaryButton} type="button" onClick={scan} disabled={working}>
              {working ? 'Working...' : 'Scan tree'}
            </button>
          )}
        </div>

        <div className={styles.summaryGrid} aria-label="Tree issue summary">
          <span className={styles.summaryItem}>{summary?.open ?? 0} open</span>
          <span className={styles.summaryItem}>{summary?.bySeverity.high ?? 0} high</span>
          <span className={styles.summaryItem}>{summary?.bySeverity.medium ?? 0} medium</span>
          <span className={styles.summaryItem}>{summary?.bySeverity.low ?? 0} low</span>
          <span className={styles.summaryItem}>Last scan: {summary?.lastScanAt ?? 'Never'}</span>
        </div>

        <div className={styles.filters} aria-label="Tree issue filters">
          <label>
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as IssueStatus | 'all')}>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </select>
          </label>
          <label>
            Type
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All</option>
              {issueTypes.map((type) => <option key={type} value={type}>{formatType(type)}</option>)}
            </select>
          </label>
          <label>
            Severity
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as IssueSeverity | 'all')}>
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.success} role="status">{message}</div>}

        {loading ? (
          <div className={styles.emptyState}>Loading tree issues...</div>
        ) : issues.length === 0 ? (
          <div className={styles.emptyState}>No tree issues match the current filters.</div>
        ) : (
          <div className={styles.issueList}>
            {issues.map((issue) => {
              const primaryHref = entityHref(issue.primary_entity_type, issue.primary_entity_id);
              const related = parseRelated(issue);
              return (
                <article key={issue.id} className={styles.issueCard}>
                  <div className={styles.issueHeader}>
                    <div>
                      <h2>{issue.title}</h2>
                      <p>{issue.summary}</p>
                    </div>
                    <div className={styles.badges}>
                      <span className={styles[issue.severity]}>{issue.severity}</span>
                      <span className={styles.status}>{statusLabel(issue.status)}</span>
                    </div>
                  </div>

                  <div className={styles.linkRow}>
                    {primaryHref && (
                      <Link to={primaryHref}>Open affected {issue.primary_entity_type}</Link>
                    )}
                    {related.map((entity) => {
                      const href = entityHref(entity.type, entity.id);
                      if (!href) return null;
                      return <Link key={`${entity.type}-${entity.id}`} to={href}>{entity.label || `${entity.type} ${entity.id}`}</Link>;
                    })}
                  </div>

                  <div className={styles.metaRow}>
                    <span>{formatType(issue.type)}</span>
                    <span>Last seen {issue.last_seen_at}</span>
                    {issue.note && <span>Note: {issue.note}</span>}
                  </div>

                  {canEdit && (
                    <div className={styles.actions}>
                      {issue.status !== 'resolved' && (
                        <button type="button" onClick={() => void updateIssue(issue, 'resolved')} disabled={working}>
                          Resolve
                        </button>
                      )}
                      {issue.status !== 'open' && (
                        <button type="button" onClick={() => void updateIssue(issue, 'open')} disabled={working}>
                          Reopen
                        </button>
                      )}
                      {issue.status !== 'dismissed' && (
                        <>
                          <input
                            value={dismissNotes[issue.id] ?? ''}
                            placeholder="Dismiss note"
                            onChange={(e) => setDismissNotes((current) => ({ ...current, [issue.id]: e.target.value }))}
                            aria-label={`Dismiss note for ${issue.title}`}
                          />
                          <button
                            type="button"
                            onClick={() => void updateIssue(issue, 'dismissed')}
                            disabled={working || !dismissNotes[issue.id]?.trim()}
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
