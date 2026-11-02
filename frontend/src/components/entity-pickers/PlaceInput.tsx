import React, { useCallback, useId, useRef, useState } from 'react';
import Input from '@/components/Form/Input';
import Button from '@/components/Button/Button';
import PlaceSuggestionList from './PlaceSuggestionList';
import { useDismissOnOutsideClick, usePlaceSuggestions, type PlaceSuggestion } from './placeSuggest';
import styles from './PlaceInput.module.css';

/**
 * A place field that offers the places the archive already holds (#35).
 *
 * The value stays free text, because that is what an event stores: the
 * importer, the GEDCOM exporters and EventRepository.syncEventPlace all read
 * events.event_place, and resolveOrCreate turns the string into a place row.
 * What changes is where the string comes from. Choosing a suggestion writes
 * that place's *title*, which is exactly what its normalized_name is derived
 * from, so resolveOrCreate matches the existing row instead of creating a
 * near-duplicate beside it. Writing a chain rebuilt from the components would
 * not: migration 074 deliberately left titles alone, so a place titled
 * "Montréal, Québec, Canada" keeps its accents while its region column reads
 * "Quebec".
 *
 * Typing something new is still allowed -- a place nobody has recorded yet has
 * to be enterable -- but a street address entered as free text is the
 * fragmentation this issue is about, so the control also offers to create it
 * properly: its own place, the street in address_text, and the locality it
 * sits inside as its parent.
 */

interface PlaceInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Offer "add as a new place inside…" when nothing matches exactly. */
  allowCreate?: boolean;
  'aria-label'?: string;
}

const PlaceInput: React.FC<PlaceInputProps> = ({
  value,
  onChange,
  id,
  placeholder,
  required,
  disabled,
  allowCreate = true,
  'aria-label': ariaLabel,
}) => {
  const generatedId = useId();
  const fieldId = id ?? `place-input-${generatedId}`;
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [street, setStreet] = useState('');
  const [parent, setParent] = useState<PlaceSuggestion | null>(null);
  const [parentTerm, setParentTerm] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const suggestions = usePlaceSuggestions(value);
  const parentSuggestions = usePlaceSuggestions(parent ? '' : parentTerm, { containersOnly: true });

  const close = useCallback(() => setIsOpen(false), []);
  useDismissOnOutsideClick(rootRef, isOpen, close);

  const exactMatch = suggestions.some(
    (suggestion) => suggestion.title.trim().toLowerCase() === value.trim().toLowerCase(),
  );
  const offerCreate = allowCreate && Boolean(value.trim()) && !exactMatch;

  const createPlace = async () => {
    const line = street.trim();
    if (!line || !parent) {
      setCreateError('A street line and the place it sits inside are both needed.');
      return;
    }

    setIsSaving(true);
    setCreateError(null);
    try {
      /* The title follows the convention the archive already uses -- the
         street places migration 074 wrote read "714 Main St., Worcester,
         Massachusetts" -- so a place created here is indistinguishable from
         the backfilled ones, and resolveOrCreate matches it on the same
         normalized name when the event is saved. */
      const title = `${line}, ${parent.title}`;
      const res = await fetch('/api/v1/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title,
          place_type: 'address',
          // The street line alone. An address is where mail arrives, which is
          // why 074 had to undo 068's habit of copying the whole name here.
          address_text: line,
          locality: parent.locality ?? null,
          county: parent.county ?? null,
          region: parent.region ?? null,
          country: parent.country ?? null,
          parent_place_id: parent.id,
        }),
      });
      if (!res.ok) throw new Error('Failed to create the place');
      const created = await res.json() as { title?: string };
      onChange(created.title ?? title);
      setIsCreating(false);
      setIsOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create the place');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <Input
        id={fieldId}
        value={value}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen && (suggestions.length > 0 || offerCreate)}
        aria-controls={`${fieldId}-listbox`}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false);
        }}
      />

      {isOpen && !isCreating && (suggestions.length > 0 || offerCreate) && (
        <PlaceSuggestionList
          id={`${fieldId}-listbox`}
          suggestions={suggestions}
          onChoose={(suggestion) => {
            onChange(suggestion.title);
            setIsOpen(false);
          }}
          footer={offerCreate ? (
            <li>
              <button
                type="button"
                className={styles.createOption}
                onClick={() => {
                  setStreet(value.trim());
                  setParent(null);
                  setParentTerm('');
                  setCreateError(null);
                  setIsCreating(true);
                  setIsOpen(false);
                }}
              >
                Add &ldquo;{value.trim()}&rdquo; as a new place inside another&hellip;
              </button>
            </li>
          ) : null}
        />
      )}

      {isCreating && (
        <div className={styles.createPanel}>
          <p className={styles.createHelp}>
            A street address is its own place inside its town, so the town still groups everything
            recorded there.
          </p>
          <label className={styles.field}>
            <span>Street or address line</span>
            <Input value={street} onChange={(event) => setStreet(event.target.value)} placeholder="714 Main St." />
          </label>
          <label className={styles.field}>
            <span>Inside</span>
            <Input
              value={parent ? parent.title : parentTerm}
              onChange={(event) => {
                setParent(null);
                setParentTerm(event.target.value);
              }}
              placeholder="Worcester, Massachusetts"
              autoComplete="off"
            />
            {!parent && parentSuggestions.length > 0 && (
              <PlaceSuggestionList
                suggestions={parentSuggestions}
                onChoose={(suggestion) => {
                  setParent(suggestion);
                  setParentTerm('');
                }}
              />
            )}
          </label>
          {parent && (
            <p className={styles.preview}>
              Will be created as <strong>{`${street.trim() || '…'}, ${parent.title}`}</strong>
            </p>
          )}
          {createError && <p className={styles.error}>{createError}</p>}
          <div className={styles.createActions}>
            <Button type="button" size="sm" loading={isSaving} onClick={() => void createPlace()}>
              Create place
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaceInput;
