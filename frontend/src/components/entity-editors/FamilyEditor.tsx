import React, { useState } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import type { ModalEditorProps, ModalResult } from '@/components/modals/modalTypes';
import type { FamilySummary, PersonSummary } from '@/types/genealogy';
import styles from './FamilyEditor.module.css';

interface FamilyEditorProps extends ModalEditorProps {
  mode: 'create';
  defaults?: { spouse1_id?: string; spouse2_id?: string };
}

const FamilyEditor: React.FC<FamilyEditorProps> = ({
  defaults,
  modalId,
  onClose,
}) => {
  const [spouse1, setSpouse1] = useState<PersonResult | null>(null);
  const [spouse2, setSpouse2] = useState<PersonResult | null>(null);
  const [marriageDate, setMarriageDate] = useState('');
  const [marriagePlace, setMarriagePlace] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const title = 'Add Family';

  const handleCancel = () => onClose({ action: 'cancelled' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const body = {
      spouse1_id: spouse1?.id ?? defaults?.spouse1_id ?? null,
      spouse2_id: spouse2?.id ?? defaults?.spouse2_id ?? null,
      marriage_date: marriageDate || null,
      marriage_place: marriagePlace || null,
    };

    try {
      const res = await fetch('/api/v1/families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          message = err.error ?? message;
        } catch { /* non-JSON body */ }
        setError(message);
        return;
      }

      const data = await res.json();

      const toSummary = (p: PersonResult | null): PersonSummary | null =>
        p
          ? { id: p.id, given_name: p.given_name, surname: p.surname, birth_date: p.birth_date, death_date: p.death_date, photo_url: p.photo_url }
          : null;

      const entity: FamilySummary = {
        id: data.id,
        spouse1_id: data.spouse1_id,
        spouse2_id: data.spouse2_id,
        spouse1: toSummary(spouse1),
        spouse2: toSummary(spouse2),
        marriage_date: data.marriage_date,
        marriage_place: data.marriage_place,
      };

      const result: ModalResult<FamilySummary> = {
        action: 'created',
        entityType: 'family',
        entity,
      };
      onClose(result as ModalResult<unknown>);
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
      aria-labelledby={`family-editor-title-${modalId}`}
      className={styles.overlay}
    >
      <div className={styles.header}>
        <h2 id={`family-editor-title-${modalId}`} className={styles.title}>
          {title}
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
        <p className={styles.sectionTitle}>Partners</p>

        <PersonPicker
          label="Spouse 1"
          value={defaults?.spouse1_id}
          onSelect={setSpouse1}
          onClear={() => setSpouse1(null)}
        />

        <PersonPicker
          label="Spouse 2"
          value={defaults?.spouse2_id}
          onSelect={setSpouse2}
          onClear={() => setSpouse2(null)}
        />

        <hr className={styles.divider} />

        <p className={styles.sectionTitle}>Marriage</p>

        <div className={styles.row}>
          <FormGroup>
            <Label htmlFor="fe-marriage-date">Date</Label>
            <Input
              id="fe-marriage-date"
              value={marriageDate}
              onChange={(e) => setMarriageDate(e.target.value)}
              placeholder="e.g. 14 Jun 1910"
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="fe-marriage-place">Place</Label>
            <Input
              id="fe-marriage-place"
              value={marriagePlace}
              onChange={(e) => setMarriagePlace(e.target.value)}
              placeholder="e.g. Boston, MA"
            />
          </FormGroup>
        </div>

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

export default FamilyEditor;
