import React, { useRef, useState } from 'react';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import type { ModalEditorProps } from '@/components/modals/modalTypes';
import styles from './MediaUploadModal.module.css';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';

interface UploadedMedia {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  title: string | null;
  description: string | null;
  date_taken: string | null;
  created_at: string;
}

export interface MediaUploadModalProps extends ModalEditorProps {
  /** What this upload should attach to. Exactly one is normally set by the
   *  caller; the fields are otherwise identical to the Media page's own
   *  upload panel, which this reuses POST /media/upload with. */
  personId?: string;
  familyId?: string;
  eventId?: string;
  /** Shown in the header so it's clear what the upload is for, e.g. a
   *  person's or family's display name. */
  targetLabel?: string;
  onUploaded?: (media: UploadedMedia) => void;
}

const CloseIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const MediaUploadModal: React.FC<MediaUploadModalProps> = ({
  modalId,
  onClose,
  personId,
  familyId,
  eventId,
  targetLabel,
  onUploaded,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateTaken, setDateTaken] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    if (isUploading) return;
    onClose({ action: 'cancelled' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (title.trim()) formData.append('title', title.trim());
      if (description.trim()) formData.append('description', description.trim());
      if (dateTaken) formData.append('date_taken', dateTaken);
      if (personId) formData.append('person_id', personId);
      if (familyId) formData.append('family_id', familyId);
      if (eventId) formData.append('event_id', eventId);

      const res = await fetch('/api/v1/media/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const uploaded: UploadedMedia = await res.json();
      onUploaded?.(uploaded);
      onClose({ action: 'created', entityType: 'media', entity: uploaded });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`media-upload-title-${modalId}`}
      className={styles.modal}
    >
      <div className={styles.header}>
        <h2 id={`media-upload-title-${modalId}`} className={styles.title}>
          Add media{targetLabel ? ` to ${targetLabel}` : ''}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close"
          onClick={handleClose}
          disabled={isUploading}
        >
          <CloseIcon />
        </button>
      </div>

      <form className={styles.body} onSubmit={handleSubmit}>
        <div
          className={styles.dropZone}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
        >
          {file ? (
            <span className={styles.fileName}>{file.name}</span>
          ) : (
            <span className={styles.dropZoneHint}>Click to choose a photo or document (JPEG, PNG, GIF, WebP, PDF — up to 10MB)</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className={styles.hiddenInput}
            onChange={handleFileChange}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`media-upload-title-input-${modalId}`}>Title</label>
          <Input
            id={`media-upload-title-input-${modalId}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional title"
            disabled={isUploading}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`media-upload-desc-input-${modalId}`}>Description</label>
          <textarea
            id={`media-upload-desc-input-${modalId}`}
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
            disabled={isUploading}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={`media-upload-date-input-${modalId}`}>Date</label>
          <Input
            id={`media-upload-date-input-${modalId}`}
            type="date"
            value={dateTaken}
            onChange={(e) => setDateTaken(e.target.value)}
            disabled={isUploading}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.footer}>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isUploading}>
            Upload
          </Button>
        </div>
      </form>
    </div>
  );
};

export default MediaUploadModal;
