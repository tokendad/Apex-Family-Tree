import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './FamiliesPage.module.css';

interface SpouseSummary {
  id: string;
  given_name: string | null;
  surname: string | null;
}

interface FamilyListItem {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  marriage_date: string | null;
  spouse1: SpouseSummary | null;
  spouse2: SpouseSummary | null;
}

type FilterValue = '' | 'unlinked';

function personName(p: SpouseSummary | null): string {
  if (!p) return 'Unknown';
  const parts = [p.given_name, p.surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function familyTitle(family: FamilyListItem): string {
  return `${personName(family.spouse1)} & ${personName(family.spouse2)}`;
}

const LIMIT = 20;
const SKELETON_COUNT = 8;

const FamiliesPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();

  const [families, setFamilies] = useState<FamilyListItem[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchFamilies = useCallback(
    async (
      searchQuery: string,
      filterParam: FilterValue,
      cursorParam: string | null,
      append: boolean,
    ) => {
      setIsLoading(true);
      if (!append) setError(null);
      try {
        const params = new URLSearchParams({ limit: String(LIMIT), sort: 'surname' });
        if (searchQuery) params.set('q', searchQuery);
        if (filterParam) params.set('filter', filterParam);
        if (cursorParam) params.set('cursor', cursorParam);

        const res = await fetch(`/api/v1/families?${params.toString()}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`Failed to load families (${res.status})`);
        }

        const data: {
          families?: FamilyListItem[];
          data?: FamilyListItem[];
          next_cursor?: string;
        } = await res.json();
        const items: FamilyListItem[] = data.families ?? data.data ?? [];
        setFamilies((prev) => (append ? [...prev, ...items] : items));
        setCursor(data.next_cursor ?? null);
        setHasMore(!!data.next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load families');
        if (!append) setFamilies([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchFamilies(query, filter, null, false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filter, fetchFamilies]);

  const loadMore = () => {
    if (cursor && !isLoading) {
      fetchFamilies(query, filter, cursor, true);
    }
  };

  const showSkeleton = isLoading && families.length === 0;
  const showEmpty = !isLoading && !error && families.length === 0;

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar />}>
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Families</h1>
          <div className={styles.controls}>
            <Input
              className={styles.searchBar}
              placeholder="Search families…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search families"
            />
            <select
              className={styles.filterSelect}
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterValue)}
              aria-label="Filter families"
            >
              <option value="">All families</option>
              <option value="unlinked">Unlinked only</option>
            </select>
            {canCreate && (
              <Button variant="primary" size="sm" onClick={() => navigate('/families/new')}>
                + Add Family
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchFamilies(query, filter, null, false)}
            >
              Retry
            </Button>
          </div>
        )}

        {showSkeleton ? (
          <div className={styles.grid}>
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div key={i} className={`${styles.card} ${styles.skeleton}`} aria-hidden="true" />
            ))}
          </div>
        ) : showEmpty ? (
          <div className={styles.empty}>
            {query || filter
              ? 'No families match your search.'
              : 'No families yet. Add one to get started!'}
          </div>
        ) : (
          <div className={styles.grid}>
            {families.map((family) => (
              <div
                key={family.id}
                className={styles.card}
                onClick={() => navigate(`/families/${family.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/families/${family.id}`);
                  }
                }}
              >
                <div className={styles.familyIcon} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className={styles.cardInfo}>
                  <div className={styles.cardTitle}>{familyTitle(family)}</div>
                  {family.marriage_date && (
                    <div className={styles.cardMeta}>m. {family.marriage_date}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <div className={styles.loadMore}>
            <Button variant="ghost" size="sm" onClick={loadMore} loading={isLoading}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default FamiliesPage;
