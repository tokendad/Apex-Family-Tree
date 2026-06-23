import React, { useState, useEffect } from 'react';
import PersonSearch from '@/components/PersonSearch/PersonSearch';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import { useModal } from '@/components/modals/useModal';
import { getPersonDisplayName, getPersonDates } from '@/utils/entityDisplay';
import styles from './PersonPicker.module.css';

interface PersonPickerProps {
  label?: string;
  value?: string | null;
  defaultSearch?: string;
  onSelect: (person: PersonResult) => void;
  onClear?: () => void;
}

interface PersonApiResponse {
  id: string;
  given_name?: string | null;
  surname?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  photo_url?: string | null;
  primary_name?: { given_name: string | null; surname: string | null } | null;
  names?: Array<{ given_name: string | null; surname: string | null; is_primary?: number }>;
}

function toPersonResult(data: PersonApiResponse): PersonResult {
  const primaryName =
    data.primary_name ??
    data.names?.find((name) => name.is_primary === 1) ??
    data.names?.[0] ??
    null;

  return {
    id: data.id,
    given_name: data.given_name ?? primaryName?.given_name ?? null,
    surname: data.surname ?? primaryName?.surname ?? null,
    birth_date: data.birth_date ?? null,
    death_date: data.death_date ?? null,
    photo_url: data.photo_url ?? null,
  };
}

const PersonPicker: React.FC<PersonPickerProps> = ({
  label,
  value,
  defaultSearch,
  onSelect,
  onClear,
}) => {
  const { openModal } = useModal();
  const [isOpen, setIsOpen] = useState(false);
  const [resolvedPerson, setResolvedPerson] = useState<PersonResult | null>(null);

  useEffect(() => {
    if (!value) {
      setResolvedPerson(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/v1/people/${value}`, { credentials: 'include', signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load person');
        return r.json();
      })
      .then((data: PersonApiResponse) => setResolvedPerson(toPersonResult(data)))
      .catch((err) => {
        if (err.name !== 'AbortError') setResolvedPerson(null);
      });
    return () => controller.abort();
  }, [value]);

  const handleSelect = (person: PersonResult) => {
    setResolvedPerson(person);
    setIsOpen(false);
    onSelect(person);
  };

  const handleCreateNew = async () => {
    setIsOpen(false);
    const result = await openModal<PersonResult>('PersonEditor', {
      mode: 'create',
      defaults: defaultSearch ? { given_name: defaultSearch } : undefined,
    });
    if (result.action === 'created' || result.action === 'selected') {
      setResolvedPerson(result.entity);
      onSelect(result.entity);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setResolvedPerson(null);
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
            {resolvedPerson ? (
              <span>
                <span>
                  <span className={styles.selectedName}>
                    {getPersonDisplayName(resolvedPerson)}
                  </span>
                  {getPersonDates(resolvedPerson) && (
                    <span className={styles.selectedDates}>
                      {' '}— {getPersonDates(resolvedPerson)}
                    </span>
                  )}
                </span>
              </span>
            ) : (
              <span className={styles.placeholder}>Select a person…</span>
            )}
          </button>
          {resolvedPerson && onClear && (
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
          <PersonSearch
            onSelect={handleSelect}
            onCreateNew={handleCreateNew}
            placeholder={defaultSearch ?? 'Search for a person…'}
          />
        </div>
      )}
    </div>
  );
};

export default PersonPicker;
