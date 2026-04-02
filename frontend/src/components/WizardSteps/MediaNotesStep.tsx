import React, { useRef, useState } from 'react';
import { FormGroup, Label, Input, Textarea, Select } from '@/components/Form';
import Button from '@/components/Button/Button';
import type { WizardFormData, SourceEntry } from '@/hooks/usePersonWizard';
import styles from './MediaNotesStep.module.css';

interface MediaNotesStepProps {
  data: WizardFormData;
  onChange: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

const MediaNotesStep: React.FC<MediaNotesStepProps> = ({ data, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (files: FileList | File[]) => {
    const valid: File[] = [];
    Array.from(files).forEach((f) => {
      if (!ACCEPTED_TYPES.includes(f.type)) return;
      if (f.size > MAX_FILE_SIZE) return;
      valid.push(f);
    });
    if (valid.length > 0) {
      onChange('mediaFiles', [...data.mediaFiles, ...valid]);
    }
  };

  const removeMedia = (index: number) => {
    const updated = [...data.mediaFiles];
    updated.splice(index, 1);
    onChange('mediaFiles', updated);
  };

  const addSource = () => {
    onChange('sources', [
      ...data.sources,
      { title: '', page: '', quality: 'primary' },
    ]);
  };

  const updateSource = (index: number, field: keyof SourceEntry, value: string) => {
    const updated = [...data.sources];
    updated[index] = { ...updated[index], [field]: value };
    onChange('sources', updated);
  };

  const removeSource = (index: number) => {
    const updated = [...data.sources];
    updated.splice(index, 1);
    onChange('sources', updated);
  };

  const uploadCls = [styles.uploadArea, dragOver ? styles.uploadAreaDragOver : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.section}>
      {/* Media upload */}
      <div>
        <h4 className={styles.sectionLabel}>Media</h4>
        <div
          className={uploadCls}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
        >
          <div className={styles.uploadIcon}>📎</div>
          <div className={styles.uploadHint}>
            Drag and drop images here, or click to browse
          </div>
          <div className={styles.uploadHint}>JPG/PNG, max 10MB</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png"
          multiple
          className={styles.hiddenInput}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {data.mediaFiles.length > 0 && (
          <div className={styles.previewGrid}>
            {data.mediaFiles.map((file, i) => (
              <div key={i} className={styles.previewItem}>
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className={styles.previewImage}
                />
                <button
                  type="button"
                  className={styles.previewRemove}
                  onClick={() => removeMedia(i)}
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <FormGroup>
        <Label>Notes</Label>
        <Textarea
          rows={4}
          placeholder="Add notes about this person…"
          value={data.notes}
          onChange={(e) => onChange('notes', e.target.value)}
        />
      </FormGroup>

      {/* Sources */}
      <div className={styles.sourcesSection}>
        <h4 className={styles.sectionLabel}>Sources</h4>
        {data.sources.map((source, i) => (
          <div key={i} className={styles.sourceEntry}>
            <div className={styles.sourceHeader}>
              <span className={styles.sourceTitle}>Source {i + 1}</span>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeSource(i)}
                aria-label={`Remove source ${i + 1}`}
              >
                ✕
              </button>
            </div>
            <FormGroup>
              <Label>Title</Label>
              <Input
                value={source.title}
                onChange={(e) => updateSource(i, 'title', e.target.value)}
                placeholder="Source title"
              />
            </FormGroup>
            <FormGroup>
              <Label>Page</Label>
              <Input
                value={source.page}
                onChange={(e) => updateSource(i, 'page', e.target.value)}
                placeholder="Page number or reference"
              />
            </FormGroup>
            <FormGroup>
              <Label>Quality</Label>
              <Select
                value={source.quality}
                onChange={(e) => updateSource(i, 'quality', e.target.value)}
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
                <option value="questionable">Questionable</option>
                <option value="unreliable">Unreliable</option>
              </Select>
            </FormGroup>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={addSource}
          className={styles.addSourceBtn}
        >
          + Add Source
        </Button>
      </div>
    </div>
  );
};

export default MediaNotesStep;
