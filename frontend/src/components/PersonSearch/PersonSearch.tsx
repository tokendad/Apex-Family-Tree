import React, { useState, useEffect, useRef, useCallback } from 'react';
import Input from '@/components/Form/Input';
import Avatar from '@/components/Avatar/Avatar';
import { getPersonDisplayName, getPersonDates } from '@/utils/entityDisplay';
import styles from './PersonSearch.module.css';

export interface PersonResult {
  id: string;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;
}

interface PersonSearchProps {
  onSelect: (person: PersonResult) => void;
  onCreateNew?: () => void;
  selectedPersons?: PersonResult[];
  onRemove?: (id: string) => void;
  placeholder?: string;
  className?: string;
}

const PersonSearch: React.FC<PersonSearchProps> = ({
  onSelect,
  onCreateNew,
  selectedPersons = [],
  onRemove,
  placeholder = 'Search for a person…',
  className,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/people?q=${encodeURIComponent(q)}&limit=10`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.people ?? data.data ?? []);
        setShowDropdown(true);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (person: PersonResult) => {
    onSelect(person);
    setQuery('');
    setShowDropdown(false);
    setResults([]);
  };

  const cls = [styles.wrapper, className].filter(Boolean).join(' ');

  return (
    <div className={cls} ref={wrapperRef}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        onFocus={() => {
          if (query.length >= 2) setShowDropdown(true);
        }}
      />

      {showDropdown && (
        <div className={styles.dropdown}>
          {isLoading && <div className={styles.loading}>Searching…</div>}
          {!isLoading && results.length === 0 && query.length >= 2 && (
            <div className={styles.noResults}>No results found</div>
          )}
          {results.map((person) => (
            <button
              key={person.id}
              className={styles.item}
              type="button"
              onClick={() => handleSelect(person)}
            >
              <Avatar name={getPersonDisplayName(person)} src={person.photo_url ?? undefined} size="xs" />
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{getPersonDisplayName(person)}</span>
                <span className={styles.itemDates}>{getPersonDates(person)}</span>
              </div>
            </button>
          ))}
          {onCreateNew && (
            <button
              type="button"
              className={styles.createOption}
              onClick={() => {
                onCreateNew();
                setShowDropdown(false);
              }}
            >
              + Create new person
            </button>
          )}
        </div>
      )}

      {selectedPersons.length > 0 && (
        <div className={styles.selectedList}>
          {selectedPersons.map((person) => (
            <div key={person.id} className={styles.miniCard}>
              <Avatar name={getPersonDisplayName(person)} src={person.photo_url ?? undefined} size="xs" />
              <div className={styles.miniCardInfo}>
                <div className={styles.miniCardName}>{getPersonDisplayName(person)}</div>
                <div className={styles.miniCardDates}>{getPersonDates(person)}</div>
              </div>
              {onRemove && (
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => onRemove(person.id)}
                  aria-label={`Remove ${getPersonDisplayName(person)}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PersonSearch;
