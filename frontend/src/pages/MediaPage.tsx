import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  DragEvent,
  ChangeEvent,
} from 'react';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './MediaPage.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  title: string | null;
  description: string | null;
  date_taken: string | null;
  uploaded_by: string;
  created_at: string;
}

type EditableField = 'title' | 'description' | 'date_taken';

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const LIMIT = 50;
const SKELETON_COUNT = 12;
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp,application/pdf';
const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function displayTitle(item: MediaItem): string {
  return item.title ?? item.original_filename;
}

function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared SVG icons
// ─────────────────────────────────────────────────────────────────────────────

const CloseIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PencilIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
  </svg>
);

const DocIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const CheckCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// ThumbCard sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface ThumbCardProps {
  item: MediaItem;
  onClick: () => void;
}

const ThumbCard: React.FC<ThumbCardProps> = ({ item, onClick }) => {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const pdf = isPdf(item.mime_type);
  const showPdfFallback = pdf || imgError;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={styles.thumbCard}
      role="button"
      tabIndex={0}
      aria-label={`View ${displayTitle(item)}`}
      onClick={onClick}
      onKeyDown={handleKey}
    >
      {showPdfFallback ? (
        <div className={styles.pdfPlaceholder}>
          <DocIcon className={styles.pdfIcon} />
          <span className={styles.pdfLabel}>PDF</span>
          <span className={styles.pdfFilename}>{item.original_filename}</span>
        </div>
      ) : (
        <div className={styles.thumbImgWrap}>
          {!loaded && <div className={styles.imgSkeleton} aria-hidden="true" />}
          <img
            src={`/api/v1/media/${item.id}`}
            alt={displayTitle(item)}
            className={`${styles.thumbImg} ${loaded ? styles.thumbImgLoaded : ''}`}
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        </div>
      )}
      <div className={styles.thumbOverlay} aria-hidden="true">
        <div className={styles.overlayTitle}>{displayTitle(item)}</div>
        <div className={styles.overlaySub}>
          {formatBytes(item.file_size)} · {formatDate(item.created_at)}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EditableDetailField sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface EditableDetailFieldProps {
  label: string;
  value: string | null;
  emptyText: string;
  fieldKey: EditableField;
  canEdit: boolean;
  isEditing: boolean;
  editValue: string;
  isSaving: boolean;
  multiline?: boolean;
  inputType?: string;
  onStartEdit: () => void;
  onChangeValue: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const EditableDetailField: React.FC<EditableDetailFieldProps> = ({
  label,
  value,
  emptyText,
  canEdit,
  isEditing,
  editValue,
  isSaving,
  multiline = false,
  inputType = 'text',
  onStartEdit,
  onChangeValue,
  onSave,
  onCancel,
}) => (
  <div className={styles.detailField}>
    <span className={styles.detailFieldLabel}>{label}</span>
    {isEditing ? (
      <div className={styles.editInputWrap}>
        {multiline ? (
          <textarea
            className={styles.formTextarea}
            value={editValue}
            onChange={(e) => onChangeValue(e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}…`}
            rows={3}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            disabled={isSaving}
          />
        ) : (
          <Input
            type={inputType}
            value={editValue}
            onChange={(e) => onChangeValue(e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}…`}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            disabled={isSaving}
          />
        )}
        <div className={styles.editActions}>
          <Button variant="primary" size="sm" onClick={onSave} loading={isSaving}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        </div>
      </div>
    ) : (
      <div className={styles.editableRow}>
        <span
          className={[
            styles.detailFieldValue,
            !value ? styles.detailFieldEmpty : '',
            canEdit ? styles.editableValue : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={canEdit ? onStartEdit : undefined}
          role={canEdit ? 'button' : undefined}
          tabIndex={canEdit ? 0 : undefined}
          onKeyDown={
            canEdit
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onStartEdit();
                  }
                }
              : undefined
          }
          aria-label={canEdit ? `Edit ${label.toLowerCase()}` : undefined}
        >
          {value ?? emptyText}
        </span>
        {canEdit && (
          <span className={styles.editPencilWrap} aria-hidden="true">
            <PencilIcon />
          </span>
        )}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MediaPage
// ─────────────────────────────────────────────────────────────────────────────

const MediaPage: React.FC = () => {
  const { canCreate, canEdit, canDelete } = usePermissions();

  // ── Gallery state ──────────────────────────────────────────────────────────
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Upload panel state ────────────────────────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadDateTaken, setUploadDateTaken] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Detail panel state ────────────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch media ────────────────────────────────────────────────────────────

  const fetchMedia = useCallback(async (cursorParam: string | null, append: boolean) => {
    setIsLoading(true);
    if (!append) setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (cursorParam) params.set('cursor', cursorParam);

      const res = await fetch(`/api/v1/media?${params.toString()}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Failed to load media (${res.status})`);
      }

      const data: {
        media?: MediaItem[];
        data?: MediaItem[];
        next_cursor?: string | null;
      } = await res.json();

      const items: MediaItem[] = data.media ?? data.data ?? [];
      setMediaItems((prev) => (append ? [...prev, ...items] : items));
      setCursor(data.next_cursor ?? null);
      setHasMore(!!data.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media');
      if (!append) setMediaItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedia(null, false);
  }, [fetchMedia]);

  const loadMore = () => {
    if (cursor && !isLoading) {
      fetchMedia(cursor, true);
    }
  };

  // ── Upload handlers ────────────────────────────────────────────────────────

  const openUpload = () => {
    setUploadFile(null);
    setUploadTitle('');
    setUploadDescription('');
    setUploadDateTaken('');
    setUploadError(null);
    setUploadProgress(0);
    setShowUpload(true);
  };

  const closeUpload = () => {
    if (isUploading) return;
    setShowUpload(false);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    setUploadError(null);
    // Reset so same file can be re-selected
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (ACCEPTED_MIME.includes(file.type)) {
      setUploadFile(file);
      setUploadError(null);
    } else {
      setUploadError('Unsupported file type. Please upload JPEG, PNG, GIF, WebP, or PDF.');
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (uploadTitle.trim()) formData.append('title', uploadTitle.trim());
      if (uploadDescription.trim()) formData.append('description', uploadDescription.trim());
      if (uploadDateTaken) formData.append('date_taken', uploadDateTaken);

      // Use XHR for upload progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const resp = JSON.parse(xhr.responseText) as { message?: string };
              reject(new Error(resp.message ?? `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.open('POST', '/api/v1/media/upload');
        xhr.withCredentials = true;
        xhr.send(formData);
      });

      setShowUpload(false);
      await fetchMedia(null, false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Detail panel handlers ──────────────────────────────────────────────────

  const openDetail = (item: MediaItem) => {
    setSelectedItem(item);
    setDeleteConfirm(false);
    setDeleteError(null);
    setEditingField(null);
    setSaveError(null);
  };

  const closeDetail = () => {
    if (isDeleting || isSaving) return;
    setSelectedItem(null);
    setDeleteConfirm(false);
    setEditingField(null);
  };

  const startEdit = (field: EditableField) => {
    if (!selectedItem) return;
    setEditingField(field);
    setEditValue(selectedItem[field] ?? '');
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setSaveError(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedItem || !editingField) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, string | null> = {
        [editingField]: editValue.trim() || null,
      };
      const res = await fetch(`/api/v1/media/${selectedItem.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(errData.message ?? `Failed to save (${res.status})`);
      }
      const updated: MediaItem = await res.json();
      setSelectedItem(updated);
      setMediaItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditingField(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/v1/media/${selectedItem.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to delete (${res.status})`);
      }
      setMediaItems((prev) => prev.filter((m) => m.id !== selectedItem.id));
      setSelectedItem(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ── Keyboard: close detail drawer on Escape ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showUpload) closeUpload();
        else if (selectedItem) closeDetail();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUpload, selectedItem, isUploading, isDeleting, isSaving]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const showSkeleton = isLoading && mediaItems.length === 0;
  const showEmpty = !isLoading && !error && mediaItems.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar />}>
      <div className={styles.page}>
        {/* ── Page header ── */}
        <div className={styles.header}>
          <h1 className={styles.title}>Media Gallery</h1>
          {canCreate && (
            <Button variant="primary" size="sm" onClick={openUpload}>
              Upload Media
            </Button>
          )}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => fetchMedia(null, false)}>
              Retry
            </Button>
          </div>
        )}

        {/* ── Gallery ── */}
        {showSkeleton ? (
          <div className={styles.gallery} aria-busy="true" aria-label="Loading media…">
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div key={i} className={styles.skeleton} aria-hidden="true" />
            ))}
          </div>
        ) : showEmpty ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">🖼️</span>
            <p className={styles.emptyText}>
              No media uploaded yet.
              {canCreate && " Click 'Upload Media' to add photos and documents."}
            </p>
          </div>
        ) : (
          <div className={styles.gallery}>
            {mediaItems.map((item) => (
              <ThumbCard key={item.id} item={item} onClick={() => openDetail(item)} />
            ))}
          </div>
        )}

        {/* ── Load more ── */}
        {hasMore && (
          <div className={styles.loadMore}>
            <Button variant="ghost" size="sm" onClick={loadMore} loading={isLoading}>
              Load more
            </Button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Upload Modal
      ══════════════════════════════════════════════════════════════════════ */}
      {showUpload && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Upload media"
        >
          {/* Backdrop click-to-close */}
          <div className={styles.modalBackdropOverlay} onClick={closeUpload} />

          <div className={styles.uploadModal}>
            {/* Modal header */}
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Upload Media</h2>
              <button
                className={styles.modalClose}
                type="button"
                onClick={closeUpload}
                disabled={isUploading}
                aria-label="Close upload panel"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className={styles.uploadForm}>
              {/* Drop zone / selected file */}
              {!uploadFile ? (
                <div
                  className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Drop files here or click to select"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                >
                  <UploadIcon className={styles.dropZoneIcon} />
                  <span className={styles.dropZoneText}>Drop file here or click to browse</span>
                  <span className={styles.dropZoneHint}>JPEG · PNG · GIF · WebP · PDF</span>
                </div>
              ) : (
                <div className={styles.selectedFile}>
                  <CheckCircleIcon className={styles.selectedFileIcon} />
                  <span className={styles.selectedFileName}>{uploadFile.name}</span>
                  <span className={styles.selectedFileSize}>{formatBytes(uploadFile.size)}</span>
                  <button
                    type="button"
                    className={styles.clearFile}
                    onClick={() => setUploadFile(null)}
                    aria-label="Remove selected file"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className={styles.hiddenInput}
                onChange={handleFileSelect}
                aria-hidden="true"
                tabIndex={-1}
              />

              {/* Title */}
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="upload-title">
                  Title{' '}
                  <span className={styles.formLabelOptional}>(optional)</span>
                </label>
                <Input
                  id="upload-title"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Family portrait 1952"
                  disabled={isUploading}
                />
              </div>

              {/* Description */}
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="upload-desc">
                  Description{' '}
                  <span className={styles.formLabelOptional}>(optional)</span>
                </label>
                <textarea
                  id="upload-desc"
                  className={styles.formTextarea}
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Add a description…"
                  rows={3}
                  disabled={isUploading}
                />
              </div>

              {/* Date taken */}
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="upload-date">
                  Date Taken{' '}
                  <span className={styles.formLabelOptional}>(optional)</span>
                </label>
                <Input
                  id="upload-date"
                  type="date"
                  value={uploadDateTaken}
                  onChange={(e) => setUploadDateTaken(e.target.value)}
                  disabled={isUploading}
                />
              </div>

              {/* Upload progress */}
              {isUploading && (
                <div
                  className={styles.progressWrap}
                  role="progressbar"
                  aria-valuenow={uploadProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Upload progress: ${uploadProgress}%`}
                >
                  <div
                    className={styles.progressFill}
                    style={
                      { '--progress-width': `${uploadProgress}%` } as React.CSSProperties
                    }
                  />
                  <span className={styles.progressLabel}>{uploadProgress}%</span>
                </div>
              )}

              {/* Upload error */}
              {uploadError && (
                <div className={styles.uploadError} role="alert">
                  {uploadError}
                </div>
              )}

              {/* Actions */}
              <div className={styles.modalActions}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeUpload}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={isUploading}
                  disabled={!uploadFile}
                >
                  {isUploading ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Detail Drawer
      ══════════════════════════════════════════════════════════════════════ */}
      {selectedItem && (
        <>
          <div
            className={styles.drawerBackdrop}
            onClick={closeDetail}
            aria-hidden="true"
          />
          <div
            className={styles.detailDrawer}
            role="dialog"
            aria-modal="true"
            aria-label={`Media detail: ${displayTitle(selectedItem)}`}
          >
            {/* Drawer header */}
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>Media Detail</h2>
              <button
                className={styles.drawerClose}
                type="button"
                onClick={closeDetail}
                disabled={isDeleting || isSaving}
                aria-label="Close detail panel"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Drawer body */}
            <div className={styles.drawerBody}>
              {/* Image / PDF preview */}
              {isPdf(selectedItem.mime_type) ? (
                <div className={styles.detailPdfWrap}>
                  <DocIcon className={styles.detailPdfIcon} />
                  <span className={styles.detailPdfName}>{selectedItem.original_filename}</span>
                  <a
                    href={`/api/v1/media/${selectedItem.id}`}
                    className={styles.detailPdfDownload}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={selectedItem.original_filename}
                  >
                    Download PDF
                  </a>
                </div>
              ) : (
                <div className={styles.detailImgWrap}>
                  <img
                    src={`/api/v1/media/${selectedItem.id}`}
                    alt={displayTitle(selectedItem)}
                    className={styles.detailImg}
                  />
                </div>
              )}

              {/* Detail content */}
              <div className={styles.detailContent}>
                {/* Title */}
                <EditableDetailField
                  label="Title"
                  value={selectedItem.title}
                  emptyText="No title"
                  fieldKey="title"
                  canEdit={canEdit}
                  isEditing={editingField === 'title'}
                  editValue={editValue}
                  isSaving={isSaving}
                  onStartEdit={() => startEdit('title')}
                  onChangeValue={setEditValue}
                  onSave={handleSaveEdit}
                  onCancel={cancelEdit}
                />

                {/* Description */}
                <EditableDetailField
                  label="Description"
                  value={selectedItem.description}
                  emptyText="No description"
                  fieldKey="description"
                  canEdit={canEdit}
                  isEditing={editingField === 'description'}
                  editValue={editValue}
                  isSaving={isSaving}
                  multiline
                  onStartEdit={() => startEdit('description')}
                  onChangeValue={setEditValue}
                  onSave={handleSaveEdit}
                  onCancel={cancelEdit}
                />

                {/* Date taken */}
                <EditableDetailField
                  label="Date Taken"
                  value={
                    selectedItem.date_taken ? formatDate(selectedItem.date_taken) : null
                  }
                  emptyText="Unknown date"
                  fieldKey="date_taken"
                  canEdit={canEdit}
                  isEditing={editingField === 'date_taken'}
                  editValue={editValue}
                  isSaving={isSaving}
                  inputType="date"
                  onStartEdit={() => startEdit('date_taken')}
                  onChangeValue={setEditValue}
                  onSave={handleSaveEdit}
                  onCancel={cancelEdit}
                />

                {/* Save error */}
                {saveError && (
                  <div className={styles.saveError} role="alert">
                    {saveError}
                  </div>
                )}

                <div className={styles.divider} />

                {/* File info grid */}
                <div className={styles.detailField}>
                  <span className={styles.detailFieldLabel}>File Info</span>
                  <div className={styles.fileInfoGrid}>
                    <div className={styles.fileInfoItem}>
                      <span className={styles.fileInfoKey}>Filename</span>
                      <span className={styles.fileInfoValue} title={selectedItem.original_filename}>
                        {selectedItem.original_filename}
                      </span>
                    </div>
                    <div className={styles.fileInfoItem}>
                      <span className={styles.fileInfoKey}>Size</span>
                      <span className={styles.fileInfoValue}>
                        {formatBytes(selectedItem.file_size)}
                      </span>
                    </div>
                    <div className={styles.fileInfoItem}>
                      <span className={styles.fileInfoKey}>Type</span>
                      <span className={styles.fileInfoValue}>{selectedItem.mime_type}</span>
                    </div>
                    <div className={styles.fileInfoItem}>
                      <span className={styles.fileInfoKey}>Uploaded</span>
                      <span className={styles.fileInfoValue}>
                        {formatDate(selectedItem.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer footer — delete */}
            {canDelete && (
              <div className={styles.drawerFooter}>
                {deleteError && (
                  <div className={styles.deleteError} role="alert">
                    {deleteError}
                  </div>
                )}
                {deleteConfirm ? (
                  <div className={styles.deleteConfirm}>
                    <p className={styles.deleteConfirmText}>
                      Permanently delete this media item? This cannot be undone.
                    </p>
                    <div className={styles.deleteConfirmActions}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleDelete}
                        loading={isDeleting}
                      >
                        Delete permanently
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(false)}
                        disabled={isDeleting}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteConfirm(true)}
                    fullWidth
                  >
                    Delete Media
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
};

export default MediaPage;
