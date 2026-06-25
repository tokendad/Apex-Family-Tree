import React, { useState } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import type { ModalEditorProps } from '@/components/modals/modalTypes';
import styles from './MarriageEditor.module.css';

interface MarriageEditorProps extends ModalEditorProps {
  personId: string;
  personName: string;
  onSaved?: () => void;
}

interface ActiveMarriage {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  marriage_date: string | null;
}

const MarriageEditor: React.FC<MarriageEditorProps> = ({
  personId,
  personName,
  onSaved,
  modalId,
  onClose,
}) => {
  const [spouse, setSpouse] = useState<PersonResult | null>(null);
  const [marriageDate, setMarriageDate] = useState('');
  const [marriagePlace, setMarriagePlace] = useState('');
  const [notes, setNotes] = useState('');
  const [activeMarriages, setActiveMarriages] = useState<ActiveMarriage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSpouseSelect = async (person: PersonResult) => {
    setSpouse(person);
    try {
      const res = await fetch(`/api/v1/families/person/${person.id}/active`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setActiveMarriages(data.activeMarriages ?? []);
      }
    } catch {
      setActiveMarriages([]);
    }
  };

  const handleSpouseClear = () => {
    setSpouse(null);
    setActiveMarriages([]);
  };

  const handleCancel = () => onClose({ action: 'cancelled' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Always create the marriage event
      const eventRes = await fetch(`/api/v1/events/people/${personId}/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'marriage',
          event_date: marriageDate || null,
          event_place: marriagePlace || null,
          description: notes || null,
        }),
      });

      if (!eventRes.ok) {
        let message = `HTTP ${eventRes.status}`;
        try {
          const err = await eventRes.json();
          message = err.error ?? message;
        } catch { /* non-JSON */ }
        setError(`Failed to save marriage event: ${message}`);
        return;
      }

      // Create the family record only when a spouse is selected
      if (spouse) {
        const familyRes = await fetch('/api/v1/families', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spouse1_id: personId,
            spouse2_id: spouse.id,
            marriage_date: marriageDate || null,
            marriage_place: marriagePlace || null,
          }),
        });

        if (!familyRes.ok) {
          let message = `HTTP ${familyRes.status}`;
          try {
            const err = await familyRes.json();
            message = err.error ?? message;
          } catch { /* non-JSON */ }
          setError(`Marriage event saved, but failed to create family record: ${message}`);
          return;
        }

        // Best-effort: also record the marriage event on the spouse's timeline
        try {
          await fetch(`/api/v1/events/people/${spouse.id}/events`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_type: 'marriage',
              event_date: marriageDate || null,
              event_place: marriagePlace || null,
              description: notes || null,
            }),
          });
        } catch {
          console.warn('MarriageEditor: failed to record marriage event on spouse timeline');
        }
      }

      onSaved?.();
      onClose({
        action: 'created',
        entityType: 'marriage',
        entity: {
          spouseName: spouse?.displayName ?? null,
          marriageDate: marriageDate || null,
        },
      });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`marriage-editor-title-${modalId}`}
      className={styles.overlay}
    >
      <div className={styles.header}>
        <h2 id={`marriage-editor-title-${modalId}`} className={styles.title}>
          Add Marriage · {personName}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close"
          onClick={handleCancel}
        >
          ×
        </button>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <p className={styles.sectionTitle}>Spouse</p>

        <PersonPicker
          label="Spouse"
          onSelect={handleSpouseSelect}
          onClear={handleSpouseClear}
        />

        {activeMarriages.length > 0 && (
          <p role="status" className={styles.warning}>
            ⚠ <strong>{spouse?.displayName}</strong> already has an active marriage on
            record. You may want to add a Divorce, Death, or Annulment event to that
            relationship first.
          </p>
        )}

        <hr className={styles.divider} />

        <p className={styles.sectionTitle}>Details</p>

        <div className={styles.row}>
          <FormGroup>
            <Label htmlFor={`me-date-${modalId}`}>Marriage Date</Label>
            <Input
              id={`me-date-${modalId}`}
              value={marriageDate}
              onChange={(e) => setMarriageDate(e.target.value)}
              placeholder="e.g. 14 Jun 1910"
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor={`me-place-${modalId}`}>Marriage Place</Label>
            <Input
              id={`me-place-${modalId}`}
              value={marriagePlace}
              onChange={(e) => setMarriagePlace(e.target.value)}
              placeholder="e.g. Boston, MA"
            />
          </FormGroup>
        </div>

        <FormGroup>
          <Label htmlFor={`me-notes-${modalId}`}>Notes</Label>
          <Input
            id={`me-notes-${modalId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details…"
          />
        </FormGroup>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={isLoading}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
};

export default MarriageEditor;
