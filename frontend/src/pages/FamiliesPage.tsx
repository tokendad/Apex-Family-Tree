import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import { usePermissions } from '@/hooks/usePermissions';
import { useSearchStore } from '@/stores/searchStore';
import { useModal } from '@/components/modals/useModal';
import type { FamilySummary } from '@/types/genealogy';
import { getPersonDisplayName } from '@/utils/entityDisplay';
import styles from './FamiliesPage.module.css';

interface SpouseSummary {
  id: string;
  displayName?: string | null;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
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
  return getPersonDisplayName(p);
}

function familyTitle(family: FamilyListItem): string {
  return `${personName(family.spouse1)} & ${personName(family.spouse2)}`;
}

const LIMIT = 20;
const SKELETON_COUNT = 8;

const FamiliesPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const { openModal } = useModal();

  const [families, setFamilies] = useState<FamilyListItem[]>([]);
  const globalQuery = useSearchStore((s) => s.globalQuery);
  const [filter, setFilter] = useState<FilterValue>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchFamilies = useCallback(
    async (
      searchQuery: string,
      filterParam: FilterValue,
      cursorParam: string | null,
      append: boolean,
    ) => {
      setIsLoading(true);
      // Cleared for an append too, not just a fresh search. The auto-loader
      // below stands down while an error is showing, so leaving a failed
      // page's banner up would keep it stood down even after a later page
      // succeeded.
      setError(null);
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
      fetchFamilies(globalQuery, filter, null, false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [globalQuery, filter, fetchFamilies]);

  const loadMore = useCallback(() => {
    if (cursor && !isLoading) {
      fetchFamilies(globalQuery, filter, cursor, true);
    }
  }, [cursor, isLoading, globalQuery, filter, fetchFamilies]);

  /*
   * Pull the next page in as soon as the end of the list comes into view.
   *
   * The grid is a flex item with flex: 1, so it stretches to the full height
   * of the page whether or not it has enough cards to fill it. With 20 of 74
   * families that left three rows of cards, several hundred pixels of white
   * space, and no scrollbar -- the page looked finished, and "Load more" sat
   * at the bottom of the viewport far enough from the last card to read as
   * page furniture rather than the rest of the list. People concluded that 20
   * was all there was.
   *
   * An IntersectionObserver only fires on a threshold crossing, so if the
   * sentinel is still visible after a page is appended it will not fire a
   * second time by itself. Re-subscribing on every cursor change is what
   * keeps the cascade going: observe() delivers an initial callback for an
   * already-visible target, so the list keeps filling until the viewport is
   * covered or the families run out. The error guard matters for the same
   * reason -- without it a failed fetch would re-arm and retry forever.
   */
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (!hasMore || isLoading || error) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, error, cursor, loadMore]);

  const showSkeleton = isLoading && families.length === 0;
  const showEmpty = !isLoading && !error && families.length === 0;

  return (
    <AppShell navbar={<Navbar />} context="families">
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Families</h1>
          <div className={styles.controls}>
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
              <Button variant="primary" size="sm" onClick={async () => {
                const result = await openModal<FamilySummary>('FamilyEditor', { mode: 'create' });
                if (result.action === 'created') {
                  navigate(`/families/${result.entity.id}`);
                }
              }}>
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
              onClick={() => fetchFamilies(globalQuery, filter, null, false)}
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
            {globalQuery || filter
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
            {hasMore && (
              <div className={styles.loadMore} ref={sentinelRef}>
                <Button variant="ghost" size="sm" onClick={loadMore} loading={isLoading}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default FamiliesPage;
