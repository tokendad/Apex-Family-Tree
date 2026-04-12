import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Avatar from '@/components/Avatar/Avatar';
import Button from '@/components/Button/Button';
import { usePermissions } from '@/hooks/usePermissions';
import { useSearchStore, hasActiveFilters, filtersToParams } from '@/stores/searchStore';
import styles from './PeoplePage.module.css';

interface PersonListItem {
  id: string;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;
}

type FilterValue = '' | 'unconnected';

function displayName(p: PersonListItem): string {
  const parts = [p.given_name, p.surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function displayDates(p: PersonListItem): string {
  const parts: string[] = [];
  if (p.birth_date) parts.push(`b. ${p.birth_date}`);
  if (p.death_date) parts.push(`d. ${p.death_date}`);
  return parts.join(' — ');
}

const LIMIT = 50;
const SKELETON_COUNT = 12;

const PeoplePage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const searchFilters = useSearchStore();
  const setTotalCount = useSearchStore((s) => s.setTotalCount);
  const filtersActive = hasActiveFilters(searchFilters, 'people');

  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [filter, setFilter] = useState<FilterValue>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchPeople = useCallback(
    async (
      filterParam: FilterValue,
      cursorParam: string | null,
      append: boolean,
    ) => {
      setIsLoading(true);
      if (!append) setError(null);
      try {
        const params = filtersToParams(useSearchStore.getState());
        params.set('limit', String(LIMIT));
        params.set('sort', 'surname');
        if (filterParam) params.set('filter', filterParam);
        if (cursorParam) params.set('cursor', cursorParam);

        const res = await fetch(`/api/v1/people?${params.toString()}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`Failed to load people (${res.status})`);
        }

        const data: {
          people?: PersonListItem[];
          data?: PersonListItem[];
          next_cursor?: string;
          total_count?: number;
        } = await res.json();
        const items: PersonListItem[] = data.people ?? data.data ?? [];
        setPeople((prev) => (append ? [...prev, ...items] : items));
        setCursor(data.next_cursor ?? null);
        setHasMore(!!data.next_cursor);
        if (data.total_count !== undefined) {
          setTotalCount(data.total_count);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load people');
        if (!append) setPeople([]);
      } finally {
        setIsLoading(false);
      }
    },
    [setTotalCount],
  );

  // Reset pagination when filters change and debounce the fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursor(null);
      fetchPeople(filter, null, false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    searchFilters.globalQuery, searchFilters.firstName, searchFilters.lastName,
    searchFilters.nameMatchType, searchFilters.initial, searchFilters.sex,
    searchFilters.dateMode, searchFilters.dateYear, searchFilters.dateYearTo,
    searchFilters.dateApplyToBirth, searchFilters.dateApplyToDeath, searchFilters.dateApplyToMarriage,
    searchFilters.dateQualifier,
    searchFilters.placeCountry, searchFilters.placeState, searchFilters.placeCity,
    searchFilters.hasPhoto, searchFilters.hasSources,
    searchFilters.hasMissingData, searchFilters.isLiving, searchFilters.relationshipType,
    filter, fetchPeople,
  ]);

  const loadMore = () => {
    if (cursor && !isLoading) {
      fetchPeople(filter, cursor, true);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilter(e.target.value as FilterValue);
    setCursor(null);
  };

  const showSkeleton = isLoading && people.length === 0;
  const showEmpty = !isLoading && !error && people.length === 0;

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="people" />} context="people">
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>People</h1>
          <div className={styles.controls}>
            <select
              className={styles.filterSelect}
              value={filter}
              onChange={handleFilterChange}
              aria-label="Filter people"
            >
              <option value="">All people</option>
              <option value="unconnected">Unconnected only</option>
            </select>
            {canCreate && (
              <Button variant="primary" size="sm" onClick={() => navigate('/people/new')}>
                + Add Person
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
              onClick={() => fetchPeople(filter, null, false)}
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
            {filter === 'unconnected'
              ? 'No unconnected persons found.'
              : filtersActive
                ? 'No people match your search.'
                : 'No people yet. Add someone to get started!'}
          </div>
        ) : (
          <div className={styles.grid}>
            {people.map((person) => (
              <div
                key={person.id}
                className={styles.card}
                onClick={() => navigate(`/people/${person.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/people/${person.id}`);
                  }
                }}
              >
                <Avatar
                  name={displayName(person)}
                  src={person.photo_url ?? undefined}
                  size="sm"
                />
                <div className={styles.cardInfo}>
                  <div className={styles.cardName}>{displayName(person)}</div>
                  <div className={styles.cardDates}>{displayDates(person)}</div>
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

export default PeoplePage;
