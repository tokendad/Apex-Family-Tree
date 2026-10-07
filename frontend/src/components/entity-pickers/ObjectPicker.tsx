import React, { useCallback, useEffect, useRef, useState } from 'react';
import Input from '@/components/Form/Input';
import styles from './ObjectPicker.module.css';

export type ArchiveObjectType =
  | 'person'
  | 'artifact'
  | 'event'
  | 'place'
  | 'story'
  | 'collection';

export interface ArchiveObjectResult {
  id: string;
  object_type: ArchiveObjectType;
  title: string;
  summary: string | null;
}

interface ObjectPickerProps {
  label: string;
  /** Restrict results to one kind of object. Omit to search everything. */
  objectType?: ArchiveObjectType;
  /** Objects already connected, so they can be marked rather than offered again. */
  excludeIds?: string[];
  value: ArchiveObjectResult | null;
  onSelect: (object: ArchiveObjectResult) => void;
  onClear: () => void;
}

/**
 * Searches the archive for an object of any type.
 *
 * Built on the existing /api/v1/search index rather than per-type endpoints, so
 * one control can find a person, an event, a place or a collection — which is
 * what connecting an artifact actually needs. Results are filtered client-side
 * by type because the search endpoint returns every object kind.
 */
const ObjectPicker: React.FC<ObjectPickerProps> = ({
  label,
  objectType,
  excludeIds = [],
  value,
  onSelect,
  onClear,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ArchiveObjectResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow earlier request overwriting a newer one's results.
  const requestRef = useRef(0);

  const runSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const requestId = ++requestRef.current;
    setIsSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(trimmed)}&limit=50`);
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json() as { data: ArchiveObjectResult[] };
      if (requestId !== requestRef.current) return;

      setResults(
        json.data.filter((row) => (objectType ? row.object_type === objectType : true)),
      );
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      if (requestId === requestRef.current) setIsSearching(false);
    }
  }, [objectType]);

  // Debounced so typing does not fire a request per keystroke; the search
  // endpoint rebuilds its index on each call.
  useEffect(() => {
    const timer = setTimeout(() => void runSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  if (value) {
    return (
      <div className={styles.selected}>
        <div>
          <span className={styles.selectedType}>{value.object_type}</span>
          <strong>{value.title}</strong>
        </div>
        <button type="button" className={styles.clear} onClick={onClear}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className={styles.picker}>
      <label className={styles.label} htmlFor="object-picker-search">
        {label}
      </label>
      <Input
        id="object-picker-search"
        value={query}
        placeholder={objectType ? `Search ${objectType}s…` : 'Search the archive…'}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error && <p className={styles.error}>{error}</p>}

      {query.trim().length >= 2 && (
        <div className={styles.results} role="listbox" aria-label={label}>
          {isSearching ? (
            <p className={styles.hint}>Searching…</p>
          ) : results.length === 0 ? (
            <p className={styles.hint}>No matches.</p>
          ) : (
            results.map((result) => {
              const already = excludeIds.includes(result.id);
              return (
                <button
                  key={result.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={styles.result}
                  disabled={already}
                  onClick={() => onSelect(result)}
                >
                  <span className={styles.resultTitle}>{result.title}</span>
                  <span className={styles.resultMeta}>
                    {result.object_type}
                    {already && ' — already connected'}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ObjectPicker;
