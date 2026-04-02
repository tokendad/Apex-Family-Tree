import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Avatar from '@/components/Avatar/Avatar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import styles from './PeoplePage.module.css';

interface PersonListItem {
  id: string;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;
}

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

const PeoplePage: React.FC = () => {
  const navigate = useNavigate();
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchPeople = useCallback(
    async (searchQuery: string, cursorParam: string | null, append: boolean) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (searchQuery) params.set('q', searchQuery);
        if (cursorParam) params.set('cursor', cursorParam);

        const res = await fetch(`/api/v1/people?${params.toString()}`, {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          const items: PersonListItem[] = data.people ?? data.data ?? [];
          setPeople((prev) => (append ? [...prev, ...items] : items));
          setCursor(data.next_cursor ?? null);
          setHasMore(!!data.next_cursor);
        }
      } catch {
        // Silently handle
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Initial load + debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPeople(query, null, false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchPeople]);

  const loadMore = () => {
    if (cursor && !isLoading) {
      fetchPeople(query, cursor, true);
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar />}>
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>People</h1>
          <Input
            className={styles.searchBar}
            placeholder="Search people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {people.length === 0 && !isLoading && (
          <div className={styles.empty}>
            {query ? 'No people match your search.' : 'No people yet. Add someone to get started!'}
          </div>
        )}

        <div className={styles.grid}>
          {people.map((person) => (
            <div
              key={person.id}
              className={styles.card}
              onClick={() => navigate(`/?person=${person.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/?person=${person.id}`);
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
