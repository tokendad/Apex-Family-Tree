import React, { useCallback, useEffect, useRef, useState } from 'react';
import Input from '@/components/Form/Input';
import { getEventSubjectName, type PersonNameParts } from '@/utils/entityDisplay';
import { formatEventType } from '@/utils/eventTypes';
import styles from './EventPicker.module.css';

export interface EventResult {
  id: string;
  event_type: string;
  event_date: string | null;
  event_place: string | null;
  person: PersonNameParts | null;
  family: { spouse1: PersonNameParts | null; spouse2: PersonNameParts | null } | null;
}

interface EventPickerProps {
  label?: string;
  value?: string | null;
  onSelect: (event: EventResult) => void;
  onClear?: () => void;
}

/**
 * Finds an event by typing, the way PersonPicker and FamilyPicker do.
 *
 * It replaces a dropdown of every event in the tree, sorted only by
 * "Type - date" — indistinguishable once a tree has more than a handful of
 * wakes or baptisms, since the list carried no hint of whose event it was.
 */
const EventPicker: React.FC<EventPickerProps> = ({ label, value, onSelect, onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [resolved, setResolved] = useState<EventResult | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EventResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Guards against a slow earlier request overwriting a newer one's results.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!value) {
      setResolved(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/v1/events/${value}`, { credentials: 'include', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load event');
        return res.json();
      })
      .then((data: EventResult) => setResolved(data))
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
        `/api/v1/events?q=${encodeURIComponent(trimmed)}&limit=10`,
        { credentials: 'include' },
      );
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json() as { data: EventResult[] };
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

  const handleSelect = (event: EventResult) => {
    setResolved(event);
    setIsOpen(false);
    setQuery('');
    setResults([]);
    onSelect(event);
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    setResolved(null);
    onClear?.();
  };

  const eventMeta = (event: EventResult): string => {
    const parts = [getEventSubjectName(event), event.event_date, event.event_place].filter(Boolean);
    return parts.join(' — ');
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
                <span className={styles.selectedName}>{formatEventType(resolved.event_type)}</span>
                {eventMeta(resolved) && (
                  <span className={styles.selectedMeta}> — {eventMeta(resolved)}</span>
                )}
              </span>
            ) : (
              <span className={styles.placeholder}>Select an event…</span>
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
            placeholder="Search for an event by person, family, type, date or place…"
            aria-label="Search for an event"
            onChange={(event) => setQuery(event.target.value)}
          />

          {query.trim().length >= 2 && (
            <div className={styles.results} role="listbox" aria-label="Events">
              {isSearching ? (
                <p className={styles.hint}>Searching…</p>
              ) : results.length === 0 ? (
                <p className={styles.hint}>No events found</p>
              ) : (
                results.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={styles.item}
                    onClick={() => handleSelect(event)}
                  >
                    <span className={styles.itemName}>{formatEventType(event.event_type)}</span>
                    {eventMeta(event) && (
                      <span className={styles.itemMeta}>{eventMeta(event)}</span>
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

export default EventPicker;
