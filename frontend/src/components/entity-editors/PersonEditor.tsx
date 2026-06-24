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
  defaults?: {
    prefix?: string;
    given_name?: string;
    middle_name?: string;
    surname?: string;
    suffix?: string;
    nickname?: string;
    display_name?: string;
    sex?: 'M' | 'F' | 'X' | 'U';
  };
}

const toNull = (value: string) => value.trim() || null;

const PersonEditor: React.FC<PersonEditorProps> = ({
  mode,
  defaults,
  modalId,
  onClose,
}) => {
  const [prefix, setPrefix] = useState(defaults?.prefix ?? '');
  const [givenName, setGivenName] = useState(defaults?.given_name ?? '');
  const [middleName, setMiddleName] = useState(defaults?.middle_name ?? '');
  const [surname, setSurname] = useState(defaults?.surname ?? '');
  const [suffix, setSuffix] = useState(defaults?.suffix ?? '');
  const [nickname, setNickname] = useState(defaults?.nickname ?? '');
  const [displayName, setDisplayName] = useState(defaults?.display_name ?? '');
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
          display_name: toNull(displayName),
          names: [
            {
              name_type: 'birth',
              prefix: toNull(prefix),
              given_name: toNull(givenName),
              middle_name: toNull(middleName),
              surname: toNull(surname),
              suffix: toNull(suffix),
              nickname: toNull(nickname),
              is_primary: 1,
            },
          ],
        }),
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

      const primaryName = Array.isArray(data.names)
        ? data.names.find((n: { is_primary: number }) => n.is_primary === 1) ?? data.names[0]
        : null;

      const entity: PersonSummary = {
        id: data.id,
        displayName: data.displayName ?? data.display_name ?? null,
        display_name: data.display_name ?? null,
        given_name: primaryName?.given_name ?? null,
        middle_name: primaryName?.middle_name ?? null,
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
      aria-labelledby={`person-editor-title-${modalId}`}
      className={styles.overlay}
    >
      <div className={styles.header}>
        <h2 id={`person-editor-title-${modalId}`} className={styles.title}>
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
            <Label htmlFor={`pe-prefix-${modalId}`}>Prefix</Label>
            <Input
              id={`pe-prefix-${modalId}`}
              value={prefix}
              maxLength={50}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor={`pe-given-name-${modalId}`}>Given Name</Label>
            <Input
              id={`pe-given-name-${modalId}`}
              value={givenName}
              maxLength={100}
              onChange={(e) => setGivenName(e.target.value)}
              autoFocus
            />
          </FormGroup>
        </div>

        <div className={styles.row}>
          <FormGroup>
            <Label htmlFor={`pe-middle-name-${modalId}`}>Middle Name</Label>
            <Input
              id={`pe-middle-name-${modalId}`}
              value={middleName}
              maxLength={100}
              onChange={(e) => setMiddleName(e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor={`pe-surname-${modalId}`}>Surname</Label>
            <Input
              id={`pe-surname-${modalId}`}
              value={surname}
              maxLength={100}
              onChange={(e) => setSurname(e.target.value)}
            />
          </FormGroup>
        </div>

        <div className={styles.row}>
          <FormGroup>
            <Label htmlFor={`pe-nickname-${modalId}`}>Nickname</Label>
            <Input
              id={`pe-nickname-${modalId}`}
              value={nickname}
              maxLength={100}
              onChange={(e) => setNickname(e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor={`pe-suffix-${modalId}`}>Suffix</Label>
            <Input
              id={`pe-suffix-${modalId}`}
              value={suffix}
              maxLength={50}
              onChange={(e) => setSuffix(e.target.value)}
            />
          </FormGroup>
        </div>

        <FormGroup>
          <Label htmlFor={`pe-display-name-${modalId}`}>Display Name Override</Label>
          <Input
            id={`pe-display-name-${modalId}`}
            value={displayName}
            maxLength={200}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </FormGroup>

        <FormGroup>
          <Label htmlFor={`pe-sex-${modalId}`}>Sex</Label>
          <Select
            id={`pe-sex-${modalId}`}
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
