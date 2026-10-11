import { useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/Button/Button';
import styles from './AdminAuditPage.module.css';

interface AuditEntry {
  id: number;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  created_at: string;
  user_email: string | null;
  user_display_name: string | null;
}

interface Filters {
  q: string;
  entityType: string;
  action: string;
  includeSystem: boolean;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_FILTERS: Filters = { q: '', entityType: '', action: '', includeSystem: false };

/* Badge's variants are roles and statuses; an action is neither, so these get
   their own class rather than borrowing one that means something else. */
const ACTION_CLASS: Record<string, string> = {
  create: 'actionCreate',
  update: 'actionUpdate',
  delete: 'actionDelete',
  merge: 'actionDelete',
  import: 'actionBulk',
  scan: 'actionBulk',
};

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** SQLite stores naive UTC strings; the Z makes the browser read them as such. */
function toDate(value: string): Date {
  return new Date(value.replace(' ', 'T') + 'Z');
}

function formatWhen(value: string): string {
  const date = toDate(value);
  const ageMs = Date.now() - date.getTime();

  if (ageMs < 60_000) return 'just now';
  if (ageMs < 3_600_000) {
    const mins = Math.floor(ageMs / 60_000);
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (ageMs < 86_400_000) {
    const hours = Math.floor(ageMs / 3_600_000);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * The best human handle for the thing that changed.
 *
 * Audit rows outlive the records they describe, so a delete entry has nothing
 * left to look up: whatever the entry itself carries is all there will ever be.
 */
function entryLabel(entry: AuditEntry): string {
  const values = parseJson(entry.new_values) ?? parseJson(entry.old_values);
  for (const key of ['label', 'email', 'title', 'filename', 'display_name']) {
    const candidate = values?.[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return entry.entity_id ? entry.entity_id.slice(0, 8) : '—';
}

function actorLabel(entry: AuditEntry): string {
  return entry.user_display_name || entry.user_email || (entry.user_id ? entry.user_id.slice(0, 8) : 'System');
}

function EntryDetail({ entry }: { entry: AuditEntry }) {
  const oldValues = parseJson(entry.old_values);
  const newValues = parseJson(entry.new_values);

  if (entry.action === 'update' && oldValues && newValues) {
    const fields = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]));
    return (
      <table className={styles.diff}>
        <thead>
          <tr><th>Field</th><th>Before</th><th>After</th></tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field}>
              <td className={styles.diffField}>{field}</td>
              <td className={styles.diffOld}>{formatValue(oldValues[field])}</td>
              <td className={styles.diffNew}>{formatValue(newValues[field])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  /* A create or delete carries the whole row, most of it empty. Showing forty
     fields of "—" hides the handful that say anything. */
  const snapshot = newValues ?? oldValues;
  const populated = Object.entries(snapshot ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== '',
  );

  if (populated.length === 0) {
    return <p className={styles.emptyDetail}>No values recorded for this entry.</p>;
  }

  return (
    <dl className={styles.snapshot}>
      {populated.map(([key, value]) => (
        <div key={key} className={styles.snapshotRow}>
          <dt>{key}</dt>
          <dd>{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminAuditPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [facets, setFacets] = useState<{ entityTypes: string[]; actions: string[] }>({
    entityTypes: [], actions: [],
  });

  /* Typing fast on a phone fires several searches; only the newest answer may
     be rendered, whatever order the responses come back in. */
  const requestId = useRef(0);

  // Debounce the text box into the filter state that actually drives fetching.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.q === searchInput ? current : { ...current, q: searchInput }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const buildQuery = useCallback((active: Filters, after: string | null) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (after) params.set('cursor', after);
    if (active.q.trim()) params.set('q', active.q.trim());
    if (active.entityType) params.set('entity_type', active.entityType);
    if (active.action) params.set('action', active.action);
    if (active.includeSystem) params.set('include_system', 'true');
    return params.toString();
  }, []);

  /* Any filter change starts a new list. Keeping the cursor would ask for
     matches older than wherever the previous, unfiltered list had got to, and
     silently hide every match above that point. */
  useEffect(() => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError('');

    void (async () => {
      try {
        const response = await fetch(`/api/v1/admin/audit?${buildQuery(filters, null)}`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to load the audit log');
        const data = await response.json() as { data: AuditEntry[]; next_cursor: string | null };

        if (id !== requestId.current) return; // a newer search has overtaken this one
        setRows(data.data);
        setCursor(data.next_cursor);
        setExpanded(new Set());
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load the audit log');
        setRows([]);
        setCursor(null);
      } finally {
        if (id === requestId.current) setIsLoading(false);
      }
    })();
  }, [filters, buildQuery]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/v1/admin/audit/facets', { credentials: 'include' });
        if (response.ok) setFacets(await response.json() as { entityTypes: string[]; actions: string[] });
      } catch {
        // Filters fall back to free text; not worth surfacing.
      }
    })();
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const id = requestId.current;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/v1/admin/audit?${buildQuery(filters, cursor)}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to load more entries');
      const data = await response.json() as { data: AuditEntry[]; next_cursor: string | null };

      // A filter change while this was in flight makes the extra page wrong.
      if (id !== requestId.current) return;
      setRows((current) => [...current, ...data.data]);
      setCursor(data.next_cursor);
    } catch (err) {
      if (id === requestId.current) setError(err instanceof Error ? err.message : 'Failed to load more entries');
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, filters, buildQuery]);

  const toggle = (id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasFilters = Boolean(filters.q.trim() || filters.entityType || filters.action);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Audit Log</h1>
          <p className={styles.subtitle}>
            Every change to the archive: what changed, who changed it, and what the change was.
          </p>
        </div>
      </header>

      <div className={styles.controls}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search people, places, fields, or who made the change…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search the audit log"
        />

        <select
          className={styles.select}
          value={filters.entityType}
          onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
          aria-label="Filter by record type"
        >
          <option value="">All record types</option>
          {facets.entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>

        <select
          className={styles.select}
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {facets.actions.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={filters.includeSystem}
            onChange={(e) => setFilters((f) => ({ ...f, includeSystem: e.target.checked }))}
          />
          Show system activity
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {isLoading ? (
        <p className={styles.status}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className={styles.status}>
          {hasFilters
            ? 'No changes match those filters.'
            : filters.includeSystem
              ? 'Nothing has been recorded yet.'
              : 'No changes recorded yet. Edits made from now on will appear here.'}
        </p>
      ) : (
        <ul className={styles.entries}>
          {rows.map((entry) => {
            const isOpen = expanded.has(entry.id);
            return (
              <li key={entry.id} className={styles.entry}>
                <button
                  type="button"
                  className={styles.entryHeader}
                  onClick={() => toggle(entry.id)}
                  aria-expanded={isOpen}
                >
                  <span className={styles.chevron} aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                  <span className={`${styles.action} ${styles[ACTION_CLASS[entry.action] ?? 'actionBulk']}`}>
                    {entry.action}
                  </span>
                  <span className={styles.entityType}>{entry.entity_type}</span>
                  <span className={styles.entryLabel}>{entryLabel(entry)}</span>
                  <span className={styles.actor}>{actorLabel(entry)}</span>
                  <span className={styles.when} title={toDate(entry.created_at).toLocaleString()}>
                    {formatWhen(entry.created_at)}
                  </span>
                </button>

                {isOpen && (
                  <div className={styles.entryBody}>
                    <EntryDetail entry={entry} />
                    <p className={styles.meta}>
                      {entry.entity_id && <>Record <code>{entry.entity_id}</code> · </>}
                      {entry.ip_address ? <>from {entry.ip_address} · </> : null}
                      {toDate(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cursor && !isLoading && (
        <div className={styles.more}>
          <Button variant="secondary" onClick={() => void loadMore()} disabled={isLoadingMore}>
            {isLoadingMore ? 'Loading…' : `Show ${PAGE_SIZE} more`}
          </Button>
        </div>
      )}
    </div>
  );
}
