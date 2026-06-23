import React, { useState } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input, Select } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import type { ModalEditorProps, ModalResult } from '@/components/modals/modalTypes';
import type { PersonSummary } from '@/types/genealogy';
import styles from './PersonEditor.module.css';

interface PersonEditorProps extends ModalEditorProps {
  mode: 'create' | 'edit';
  personId?: string;
  defaults?: { given_name?: string; surname?: string; sex?: 'M' | 'F' | 'X' | 'U' };
}

const PersonEditor: React.FC<PersonEditorProps> = ({
  mode,
  defaults,
  modalId: _modalId,
  onClose,
}) => {
  const [givenName, setGivenName] = useState(defaults?.given_name ?? '');
  const [surname, setSurname] = useState(defaults?.surname ?? '');
  const [sex, setSex] = useState<'M' | 'F' | 'X' | 'U'>(defaults?.sex ?? 'U');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const title = mode === 'create' ? 'Add Person' : 'Edit Person';

  const handleCancel = () => onClose({ action: 'cancelled' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sex,
          is_living: 1,
          is_private: 0,
          names: [
            {
              name_type: 'birth',
              given_name: givenName || null,
              surname: surname || null,
              is_primary: 1,
            },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to save person');
        return;
      }

      const primaryName = Array.isArray(data.names)
        ? data.names.find((n: { is_primary: number }) => n.is_primary === 1) ?? data.names[0]
        : null;

      const entity: PersonSummary = {
        id: data.id,
        given_name: primaryName?.given_name ?? null,
        surname: primaryName?.surname ?? null,
        birth_date: null,
        death_date: null,
        photo_url: null,
      };

      const result: ModalResult<PersonSummary> = {
        action: 'created',
        entityType: 'person',
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
      aria-labelledby="person-editor-title"
      className={styles.overlay}
    >
      <div className={styles.header}>
        <h2 id="person-editor-title" className={styles.title}>
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
        <div className={styles.row}>
          <FormGroup>
            <Label htmlFor="pe-given-name">Given Name</Label>
            <Input
              id="pe-given-name"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              autoFocus
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="pe-surname">Surname</Label>
            <Input
              id="pe-surname"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
            />
          </FormGroup>
        </div>

        <FormGroup>
          <Label htmlFor="pe-sex">Sex</Label>
          <Select
            id="pe-sex"
            value={sex}
            onChange={(e) => setSex(e.target.value as typeof sex)}
          >
            <option value="U">Unknown</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="X">Non-binary / Other</option>
          </Select>
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

export default PersonEditor;
