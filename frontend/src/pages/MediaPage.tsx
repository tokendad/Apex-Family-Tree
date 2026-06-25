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
import { useSearchStore } from '@/stores/searchStore';
import { useModal } from '@/components/modals/useModal';
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
  is_external: number;
  created_at: string;
}

interface LinkOption {
  id: string;
  label: string;
}

type MediaFilter = 'all' | 'unlinked';

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
// MediaPage
// ─────────────────────────────────────────────────────────────────────────────

const MediaPage: React.FC = () => {
  const { canCreate, canEdit } = usePermissions();
  const { openModal } = useModal();

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

  // ── Upload entity linking state ───────────────────────────────────────────
  const [uploadPersonId, setUploadPersonId] = useState('');
  const [uploadFamilyId, setUploadFamilyId] = useState('');
  const [uploadEventId, setUploadEventId] = useState('');
  const [personOptions, setPersonOptions] = useState<LinkOption[]>([]);
  const [familyOptions, setFamilyOptions] = useState<LinkOption[]>([]);
  const [eventOptions, setEventOptions] = useState<LinkOption[]>([]);

  // ── Gallery filter & scan state ───────────────────────────────────────────
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const globalQuery = useSearchStore((s) => s.globalQuery);

  // ── Fetch media ────────────────────────────────────────────────────────────

  const fetchMedia = useCallback(async (searchQuery: string, cursorParam: string | null, append: boolean, filter: MediaFilter = 'all') => {
    setIsLoading(true);
    if (!append) setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (searchQuery) params.set('q', searchQuery);
      if (cursorParam) params.set('cursor', cursorParam);
      if (filter === 'unlinked') params.set('filter', 'unlinked');

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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchMedia(globalQuery, null, false, mediaFilter);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [globalQuery, mediaFilter, fetchMedia]);

  const loadMore = () => {
    if (cursor && !isLoading) {
      fetchMedia(globalQuery, cursor, true, mediaFilter);
    }
  };

  // ── Upload handlers ────────────────────────────────────────────────────────

  const openUpload = () => {
    setUploadFile(null);
    setUploadTitle('');
    setUploadDescription('');
    setUploadDateTaken('');
    setUploadPersonId('');
    setUploadFamilyId('');
    setUploadEventId('');
    setUploadError(null);
    setUploadProgress(0);
    setShowUpload(true);
    fetchLinkOptions();
  };

  const fetchLinkOptions = async () => {
    try {
      const [peopleRes, familiesRes, eventsRes] = await Promise.all([
        fetch('/api/v1/people?limit=500', { credentials: 'include' }),
        fetch('/api/v1/families?limit=500', { credentials: 'include' }),
        fetch('/api/v1/events?limit=500', { credentials: 'include' }),
      ]);

      if (peopleRes.ok) {
        const data = await peopleRes.json();
        const items = data.data ?? data.people ?? [];
        setPersonOptions(
          items.map((p: Record<string, unknown>) => ({
            id: p.id as string,
            label: ((p.displayName as string | undefined) ?? `${p.given_name ?? ''} ${p.surname ?? ''}`.trim()) || (p.id as string),
          })),
        );
      }

      if (familiesRes.ok) {
        const data = await familiesRes.json();
        const items = data.data ?? data.families ?? [];
        setFamilyOptions(
          items.map((f: Record<string, unknown>) => ({
            id: f.id as string,
            label: (f as Record<string, unknown>).display_name as string ?? (f.id as string),
          })),
        );
      }

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        const items = data.data ?? data.events ?? [];
        setEventOptions(
          items.map((e: Record<string, unknown>) => ({
            id: e.id as string,
            label: `${(e as Record<string, unknown>).event_type ?? 'Event'} - ${(e as Record<string, unknown>).event_date ?? ''}`.trim(),
          })),
        );
      }
    } catch {
      // Options are non-critical — fail silently
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/v1/media/scan', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const data = await res.json() as { added: number; skipped: number; message: string };
      setScanResult(data.message);
      await fetchMedia(globalQuery, null, false, mediaFilter);
    } catch (err) {
      setScanResult(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsScanning(false);
    }
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
      if (uploadPersonId) formData.append('person_id', uploadPersonId);
      if (uploadFamilyId) formData.append('family_id', uploadFamilyId);
      if (uploadEventId) formData.append('event_id', uploadEventId);

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
      await fetchMedia(globalQuery, null, false, mediaFilter);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Open detail modal ──────────────────────────────────────────────────────

  const handleOpenDetail = useCallback(async (item: MediaItem) => {
    await openModal('MediaEditor', {
      mediaId: item.id,
      initialItem: item,
      onMediaDeleted: () => setMediaItems((prev) => prev.filter((m) => m.id !== item.id)),
      onMediaUpdated: (updated: MediaItem) =>
        setMediaItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m))),
    });
  }, [openModal]);

  // ── Keyboard: close upload panel on Escape ─────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showUpload) closeUpload();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUpload, isUploading]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const showSkeleton = isLoading && mediaItems.length === 0;
  const showEmpty = !isLoading && !error && mediaItems.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="media" />} context="media">
      <div className={styles.page}>
        {/* ── Page header ── */}
        <div className={styles.header}>
          <h1 className={styles.title}>Media Gallery</h1>
          <div className={styles.headerActions}>
            <select
              className={styles.filterSelect}
              value={mediaFilter}
              onChange={(e) => setMediaFilter(e.target.value as MediaFilter)}
              aria-label="Filter media"
            >
              <option value="all">All Media</option>
              <option value="unlinked">Unconnected</option>
            </select>
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={handleScan} loading={isScanning}>
                {isScanning ? 'Scanning…' : 'Scan for Media'}
              </Button>
            )}
            {canCreate && (
              <Button variant="primary" size="sm" onClick={openUpload}>
                Upload Media
              </Button>
            )}
          </div>
        </div>
        {scanResult && (
          <div className={styles.scanBanner} role="status">
            <span>{scanResult}</span>
            <button
              type="button"
              className={styles.scanBannerClose}
              onClick={() => setScanResult(null)}
              aria-label="Dismiss"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        )}

        {/* ── Error banner ── */}
        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={() => fetchMedia(globalQuery, null, false, mediaFilter)}>
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
              <ThumbCard key={item.id} item={item} onClick={() => { void handleOpenDetail(item); }} />
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

              {/* Link to Person */}
              {personOptions.length > 0 && (
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="upload-person">
                    Link to Person{' '}
                    <span className={styles.formLabelOptional}>(optional)</span>
                  </label>
                  <select
                    id="upload-person"
                    className={styles.formSelect}
                    value={uploadPersonId}
                    onChange={(e) => setUploadPersonId(e.target.value)}
                    disabled={isUploading}
                  >
                    <option value="">— None —</option>
                    {personOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Link to Family */}
              {familyOptions.length > 0 && (
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="upload-family">
                    Link to Family{' '}
                    <span className={styles.formLabelOptional}>(optional)</span>
                  </label>
                  <select
                    id="upload-family"
                    className={styles.formSelect}
                    value={uploadFamilyId}
                    onChange={(e) => setUploadFamilyId(e.target.value)}
                    disabled={isUploading}
                  >
                    <option value="">— None —</option>
                    {familyOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Link to Event */}
              {eventOptions.length > 0 && (
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="upload-event">
                    Link to Event{' '}
                    <span className={styles.formLabelOptional}>(optional)</span>
                  </label>
                  <select
                    id="upload-event"
                    className={styles.formSelect}
                    value={uploadEventId}
                    onChange={(e) => setUploadEventId(e.target.value)}
                    disabled={isUploading}
                  >
                    <option value="">— None —</option>
                    {eventOptions.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

    </AppShell>
  );
};

export default MediaPage;
