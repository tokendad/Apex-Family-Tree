import React, { useRef } from 'react';
import { FormRow, FormGroup, Label, Input, Select } from '@/components/Form';
import type { WizardFormData } from '@/hooks/usePersonWizard';
import styles from './PersonalInfoStep.module.css';

interface PersonalInfoStepProps {
  data: WizardFormData;
  onChange: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
}

const PersonalInfoStep: React.FC<PersonalInfoStepProps> = ({ data, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onChange('photoFile', file);
    const url = URL.createObjectURL(file);
    onChange('photoPreviewUrl', url);
  };

  const photoCircleCls = [
    styles.photoCircle,
    data.photoPreviewUrl ? styles.photoCircleHasImage : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.section}>
      {/* Photo upload */}
      <div className={styles.photoUpload}>
        <div
          className={photoCircleCls}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
              onChange('photoFile', file);
              onChange('photoPreviewUrl', URL.createObjectURL(file));
            }
          }}
        >
          {data.photoPreviewUrl ? (
            <img src={data.photoPreviewUrl} alt="Photo preview" className={styles.photoPreview} />
          ) : (
            <div className={styles.photoPlaceholder}>
              <span className={styles.photoIcon}>📷</span>
            </div>
          )}
        </div>
        <div>
          <span className={styles.photoHint}>Click or drag to upload a photo</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={handlePhotoSelect}
        />
      </div>

      {/* Name fields */}
      <FormRow>
        <FormGroup>
          <Label>Prefix</Label>
          <Input
            placeholder="Dr., Rev."
            value={data.prefix}
            onChange={(e) => onChange('prefix', e.target.value)}
          />
        </FormGroup>
        <FormGroup>
          <Label required>Given Name</Label>
          <Input
            placeholder="Given name"
            value={data.givenName}
            onChange={(e) => onChange('givenName', e.target.value)}
          />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label required>Surname</Label>
          <Input
            placeholder="Surname"
            value={data.surname}
            onChange={(e) => onChange('surname', e.target.value)}
          />
        </FormGroup>
        <FormGroup>
          <Label>Suffix</Label>
          <Input
            placeholder="Jr., III"
            value={data.suffix}
            onChange={(e) => onChange('suffix', e.target.value)}
          />
        </FormGroup>
      </FormRow>

      <FormRow>
        <FormGroup>
          <Label>Name Type</Label>
          <Select
            value={data.nameType}
            onChange={(e) => onChange('nameType', e.target.value)}
          >
            <option value="birth">Birth Name</option>
            <option value="married">Married Name</option>
            <option value="aka">Also Known As</option>
            <option value="nickname">Nickname</option>
          </Select>
        </FormGroup>
        <FormGroup>
          <Label>Sex</Label>
          <Select
            value={data.sex}
            onChange={(e) => onChange('sex', e.target.value as WizardFormData['sex'])}
          >
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="X">Other</option>
            <option value="U">Unknown</option>
          </Select>
        </FormGroup>
      </FormRow>

      {/* Checkboxes */}
      <div className={styles.checkboxRow}>
        <input
          type="checkbox"
          id="isLiving"
          checked={data.isLiving}
          onChange={(e) => onChange('isLiving', e.target.checked)}
        />
        <label htmlFor="isLiving" className={styles.checkboxLabel}>
          This person is living
        </label>
      </div>

      <div className={styles.checkboxRow}>
        <input
          type="checkbox"
          id="isPrivate"
          checked={data.isPrivate}
          onChange={(e) => onChange('isPrivate', e.target.checked)}
        />
        <label htmlFor="isPrivate" className={styles.checkboxLabel}>
          Mark as private
        </label>
      </div>
    </div>
  );
};

export default PersonalInfoStep;
