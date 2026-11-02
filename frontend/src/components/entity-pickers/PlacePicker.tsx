import React, { useCallback, useEffect, useRef, useState } from 'react';
import Input from '@/components/Form/Input';
import Button from '@/components/Button/Button';
import PlaceSuggestionList from './PlaceSuggestionList';
import { useDismissOnOutsideClick, usePlaceSuggestions, type PlaceSuggestion } from './placeSuggest';
import styles from './PlaceInput.module.css';

/**
 * Chooses an existing place by id, for the place a place sits inside (#35).
 *
 * parent_place_id has been in the schema and the API since migration 074, and
 * 074's data uses it — a cemetery hangs under its town, a town under its state
 * — but nothing in the interface could set or change it, so a place created by
 * hand had no containment at all.
 *
 * Unlike PlaceInput this does not accept free text: a parent has to be a place
 * that exists, because the column is a foreign key. Clearing it is allowed —
 * a country is inside nothing.
 */

interface PlacePickerProps {
  /** The current parent's id, or null. */
  value: string | null;
  /** Its title, when the caller already knows it, so the field can show
      something before any search has run. */
  valueTitle?: string | null;
  onChange: (place: { id: string; title: string } | null) => void;
  id?: string;
  placeholder?: string;
  /** A place cannot be its own parent, nor can it be offered as one. */
  excludeId?: string;
}

const PlacePicker: React.FC<PlacePickerProps> = ({
  value,
  valueTitle,
  onChange,
  id,
  placeholder,
  excludeId,
}) => {
  const [term, setTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(valueTitle ?? null);
  const rootRef = useRef<HTMLDivElement>(null);

  const suggestions = usePlaceSuggestions(term).filter((suggestion) => suggestion.id !== excludeId);
  const close = useCallback(() => setIsOpen(false), []);
  useDismissOnOutsideClick(rootRef, isOpen, close);

  useEffect(() => {
    setSelectedTitle(valueTitle ?? null);
  }, [valueTitle]);

  // A title the caller did not supply: ask for it, so the field does not show
  // a bare id for a parent that was already set.
  useEffect(() => {
    if (!value || selectedTitle) return;
    const controller = new AbortController();
    void fetch(`/api/v1/places/${value}`, { credentials: 'include', signal: controller.signal })
      .then((res) => (res.ok ? res.json() as Promise<{ title?: string }> : null))
      .then((place) => { if (place?.title) setSelectedTitle(place.title); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [value, selectedTitle]);

  const choose = (suggestion: PlaceSuggestion) => {
    setSelectedTitle(suggestion.title);
    setTerm('');
    setIsOpen(false);
    onChange({ id: suggestion.id, title: suggestion.title });
  };

  const clear = () => {
    setSelectedTitle(null);
    setTerm('');
    onChange(null);
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {value && selectedTitle ? (
        <div className={styles.selectedRow}>
          <span className={styles.selected}>{selectedTitle}</span>
          <Button type="button" size="sm" variant="ghost" onClick={clear}>Clear</Button>
        </div>
      ) : (
        <>
          <Input
            id={id}
            value={term}
            placeholder={placeholder ?? 'Search places…'}
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen && suggestions.length > 0}
            onChange={(event) => {
              setTerm(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => { if (event.key === 'Escape') setIsOpen(false); }}
          />
          {isOpen && suggestions.length > 0 && (
            <PlaceSuggestionList suggestions={suggestions} onChoose={choose} />
          )}
        </>
      )}
    </div>
  );
};

export default PlacePicker;
