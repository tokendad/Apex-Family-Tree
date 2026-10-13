import React, { useCallback, useEffect, useRef, useState } from 'react';
import Input from '@/components/Form/Input';
import { getFamilyDisplayName, type PersonNameParts } from '@/utils/entityDisplay';
import styles from './FamilyPicker.module.css';

export interface FamilyResult {
  id: string;
  spouse1: PersonNameParts | null;
  spouse2: PersonNameParts | null;
  marriage_date?: string | null;
}

interface FamilyPickerProps {
  label?: string;
  value?: string | null;
  onSelect: (family: FamilyResult) => void;
  onClear?: () => void;
}

/**
 * Finds a family by typing a name, the way PersonPicker does.
 *
 * It replaces a dropdown of every family in the tree, which listed them by id
 * because the list endpoint returns the couple as `spouse1`/`spouse2` and
 * nothing named `display_name` — so the label fell through to the hex id, and
 * the only way to link a photo to a family was to recognise a hash.
 */
const FamilyPicker: React.FC<FamilyPickerProps> = ({ label, value, onSelect, onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [resolved, setResolved] = useState<FamilyResult | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FamilyResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Guards against a slow earlier request overwriting a newer one's results.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!value) {
      setResolved(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/v1/families/${value}`, { credentials: 'include', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load family');
        return res.json();
      })
      .then((data: FamilyResult) => setResolved(data))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setResolved(null);
      });
    return () => controller.abort();
  }, [value]);

  const search = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const requestId = ++requestRef.current;
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/v1/families?q=${encodeURIComponent(trimmed)}&limit=10&sort=surname`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json() as { data: FamilyResult[] };
      if (requestId !== requestRef.current) return;
      setResults(json.data ?? []);
    } catch {
      if (requestId === requestRef.current) setResults([]);
    } finally {
      if (requestId === requestRef.current) setIsSearching(false);
    }
  }, []);

  // Debounced, so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (family: FamilyResult) => {
    setResolved(family);
    setIsOpen(false);
    setQuery('');
    setResults([]);
    onSelect(family);
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    setResolved(null);
    onClear?.();
  };

  return (
    <div className={styles.root}>
      {label && <span className={styles.label}>{label}</span>}

      {!isOpen && (
        <div className={styles.triggerRow}>
          <button
            type="button"
            className={styles.trigger}
            onClick={() => setIsOpen(true)}
            aria-expanded={isOpen}
          >
            {resolved ? (
              <span>
                <span className={styles.selectedName}>{getFamilyDisplayName(resolved)}</span>
                {resolved.marriage_date && (
                  <span className={styles.selectedMeta}> — m. {resolved.marriage_date}</span>
                )}
              </span>
            ) : (
              <span className={styles.placeholder}>Select a family…</span>
            )}
          </button>
          {resolved && onClear && (
            <button
              type="button"
              className={styles.clearBtn}
              aria-label="Clear selection"
              onClick={handleClear}
            >
              ×
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className={styles.searchContainer}>
          <Input
            value={query}
            autoFocus
            placeholder="Search for a family…"
            aria-label="Search for a family"
            onChange={(event) => setQuery(event.target.value)}
          />

          {query.trim().length >= 2 && (
            <div className={styles.results} role="listbox" aria-label="Families">
              {isSearching ? (
                <p className={styles.hint}>Searching…</p>
              ) : results.length === 0 ? (
                <p className={styles.hint}>No families found</p>
              ) : (
                results.map((family) => (
                  <button
                    key={family.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={styles.item}
                    onClick={() => handleSelect(family)}
                  >
                    <span className={styles.itemName}>{getFamilyDisplayName(family)}</span>
                    {family.marriage_date && (
                      <span className={styles.itemMeta}>m. {family.marriage_date}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FamilyPicker;
