import React, { useCallback, useEffect, useState } from 'react';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import MediaPersonTagger from '@/components/MediaPersonTagger/MediaPersonTagger';
import { usePermissions } from '@/hooks/usePermissions';
import type { ModalEditorProps, ModalResult } from '@/components/modals/modalTypes';
import styles from './MediaEditor.module.css';

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

interface MediaLinks {
  persons: { person_id: string; name: string; is_primary: number }[];
  families: { family_id: string; label: string }[];
  events: { event_id: string; label: string }[];
}

interface LinkOption {
  id: string;
  label: string;
}

type EditableField = 'title' | 'description' | 'date_taken';

export interface MediaEditorProps extends ModalEditorProps {
  mediaId: string;
  initialItem: MediaItem;
  onMediaDeleted?: () => void;
  onMediaUpdated?: (updated: MediaItem) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

function displayTitle(item: MediaItem): string {
  return item.title ?? item.original_filename;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline SVG icons (matching project style — no lucide dependency)
// ─────────────────────────────────────────────────────────────────────────────

const CloseIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PencilIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
  </svg>
);

const DocIcon: React.FC = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// EditableDetailField
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
    <span className={styles.fieldLabel}>{label}</span>
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
            styles.fieldValue,
            !value ? styles.fieldValueEmpty : '',
            canEdit ? styles.fieldValueEditable : '',
          ].filter(Boolean).join(' ')}
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
          <span className={styles.pencilWrap} aria-hidden="true">
            <PencilIcon />
          </span>
        )}
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MediaEditor
// ─────────────────────────────────────────────────────────────────────────────

const MediaEditor: React.FC<MediaEditorProps> = ({
  mediaId,
  initialItem,
  modalId,
  onClose,
  onMediaDeleted,
  onMediaUpdated,
}) => {
  const { canEdit, canDelete } = usePermissions();

  const [item, setItem] = useState<MediaItem>(initialItem);
  const [links, setLinks] = useState<MediaLinks>({ persons: [], families: [], events: [] });
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);

  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [addLinkType, setAddLinkType] = useState<'person' | 'family' | 'event'>('person');
  const [addLinkId, setAddLinkId] = useState('');

  const [personOptions, setPersonOptions] = useState<LinkOption[]>([]);
  const [familyOptions, setFamilyOptions] = useState<LinkOption[]>([]);
  const [eventOptions, setEventOptions] = useState<LinkOption[]>([]);

  // ── Fetch links ──────────────────────────────────────────────────────────

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/media/${mediaId}/links`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as MediaLinks;
        setLinks(data);
      }
    } catch {
      // non-critical
    } finally {
      setIsLoadingLinks(false);
    }
  }, [mediaId]);

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  // ── Fetch link options ───────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
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
              label: (f.display_name as string | undefined) ?? (f.id as string),
            })),
          );
        }
        if (eventsRes.ok) {
          const data = await eventsRes.json();
          const items = data.data ?? data.events ?? [];
          setEventOptions(
            items.map((e: Record<string, unknown>) => ({
              id: e.id as string,
              label: `${(e.event_type as string | undefined) ?? 'Event'} - ${(e.event_date as string | undefined) ?? ''}`.trim(),
            })),
          );
        }
      } catch {
        // non-critical
      }
    };
    void load();
  }, []);

  // ── Field editing ────────────────────────────────────────────────────────

  const startEdit = (field: EditableField) => {
    setEditingField(field);
    setEditDraft(item[field] ?? '');
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setSaveError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingField) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/v1/media/${mediaId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [editingField]: editDraft.trim() || null }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(errData.message ?? `Failed to save (${res.status})`);
      }
      const updated: MediaItem = await res.json();
      setItem(updated);
      setEditingField(null);
      onMediaUpdated?.(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/v1/media/${mediaId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      onMediaDeleted?.();
      onClose({ action: 'cancelled' });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ── Links ────────────────────────────────────────────────────────────────

  const handleAddLink = async () => {
    if (!addLinkId) return;
    setIsLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(
        `/api/v1/media/${mediaId}/links/${addLinkType}/${addLinkId}`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok) throw new Error(`Failed to add link (${res.status})`);
      setAddLinkId('');
      await fetchLinks();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to add link');
    } finally {
      setIsLinking(false);
    }
  };

  const handleRemoveLink = async (type: 'person' | 'family' | 'event', targetId: string) => {
    setIsLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(
        `/api/v1/media/${mediaId}/links/${type}/${targetId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) throw new Error(`Failed to remove link (${res.status})`);
      await fetchLinks();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to remove link');
    } finally {
      setIsLinking(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const handleClose = () => {
    if (isDeleting || isSaving || isLinking) return;
    onClose({ action: 'cancelled' } as ModalResult<unknown>);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`media-editor-title-${modalId}`}
      className={styles.modal}
    >
      {/* Header */}
      <div className={styles.header}>
        <h2 id={`media-editor-title-${modalId}`} className={styles.title}>
          {displayTitle(item)}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close"
          onClick={handleClose}
          disabled={isDeleting || isSaving}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Scrollable body */}
      <div className={styles.body}>
        {/* ── Image / PDF hero ── */}
        {isPdf(item.mime_type) ? (
          <div className={styles.pdfWrap}>
            <DocIcon />
            <span className={styles.pdfFilename}>{item.original_filename}</span>
            <a
              href={`/api/v1/media/${mediaId}`}
              className={styles.pdfDownload}
              target="_blank"
              rel="noopener noreferrer"
              download={item.original_filename}
            >
              Download PDF
            </a>
          </div>
        ) : (
          <div className={styles.imageWrap}>
            <img
              src={`/api/v1/media/${mediaId}`}
              alt={displayTitle(item)}
              className={styles.image}
            />
          </div>
        )}

        {/* ── People tagger (images only, always-on) ── */}
        {!isPdf(item.mime_type) && (
          <MediaPersonTagger
            mediaId={mediaId}
            mediaSrc={`/api/v1/media/${mediaId}`}
            canEdit={canEdit}
            autoEnable={canEdit}
            onChanged={fetchLinks}
          />
        )}

        {/* ── Metadata fields ── */}
        <div className={styles.section}>
          <EditableDetailField
            label="Title"
            value={item.title}
            emptyText="No title"
            fieldKey="title"
            canEdit={canEdit}
            isEditing={editingField === 'title'}
            editValue={editDraft}
            isSaving={isSaving}
            onStartEdit={() => startEdit('title')}
            onChangeValue={setEditDraft}
            onSave={handleSaveEdit}
            onCancel={cancelEdit}
          />
          <EditableDetailField
            label="Date Taken"
            value={item.date_taken ? formatDate(item.date_taken) : null}
            emptyText="Unknown date"
            fieldKey="date_taken"
            canEdit={canEdit}
            isEditing={editingField === 'date_taken'}
            editValue={editDraft}
            isSaving={isSaving}
            inputType="date"
            onStartEdit={() => startEdit('date_taken')}
            onChangeValue={setEditDraft}
            onSave={handleSaveEdit}
            onCancel={cancelEdit}
          />
          <EditableDetailField
            label="Description"
            value={item.description}
            emptyText="No description"
            fieldKey="description"
            canEdit={canEdit}
            isEditing={editingField === 'description'}
            editValue={editDraft}
            isSaving={isSaving}
            multiline
            onStartEdit={() => startEdit('description')}
            onChangeValue={setEditDraft}
            onSave={handleSaveEdit}
            onCancel={cancelEdit}
          />
          {saveError && <p role="alert" className={styles.errorMsg}>{saveError}</p>}
        </div>

        <div className={styles.divider} />

        {/* ── Connections ── */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Connections</span>
          <div className={styles.chips}>
            {links.persons.map((p) => (
              <span key={p.person_id} className={`${styles.chip} ${styles.chipPerson}`}>
                {p.name.trim() || p.person_id}
                {canEdit && (
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => handleRemoveLink('person', p.person_id)}
                    disabled={isLinking}
                    aria-label={`Remove link to ${p.name.trim()}`}
                  >×</button>
                )}
              </span>
            ))}
            {links.families.map((f) => (
              <span key={f.family_id} className={`${styles.chip} ${styles.chipFamily}`}>
                {f.label.trim() || f.family_id}
                {canEdit && (
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => handleRemoveLink('family', f.family_id)}
                    disabled={isLinking}
                    aria-label={`Remove link to family ${f.label.trim()}`}
                  >×</button>
                )}
              </span>
            ))}
            {links.events.map((ev) => (
              <span key={ev.event_id} className={`${styles.chip} ${styles.chipEvent}`}>
                {ev.label.trim() || ev.event_id}
                {canEdit && (
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => handleRemoveLink('event', ev.event_id)}
                    disabled={isLinking}
                    aria-label={`Remove link to event ${ev.label.trim()}`}
                  >×</button>
                )}
              </span>
            ))}
            {!isLoadingLinks &&
              links.persons.length === 0 &&
              links.families.length === 0 &&
              links.events.length === 0 && (
                <span className={styles.emptyChips}>No connections</span>
              )}
          </div>

          {canEdit && (
            <div className={styles.addLinkRow}>
              <select
                className={styles.select}
                value={addLinkType}
                onChange={(e) => {
                  setAddLinkType(e.target.value as 'person' | 'family' | 'event');
                  setAddLinkId('');
                }}
                aria-label="Link type"
              >
                <option value="person">Person</option>
                <option value="family">Family</option>
                <option value="event">Event</option>
              </select>
              <select
                className={styles.select}
                value={addLinkId}
                onChange={(e) => setAddLinkId(e.target.value)}
                aria-label="Select entity to link"
              >
                <option value="">Select…</option>
                {addLinkType === 'person' && personOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
                {addLinkType === 'family' && familyOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
                {addLinkType === 'event' && eventOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddLink}
                disabled={!addLinkId || isLinking}
                loading={isLinking}
              >
                Add
              </Button>
            </div>
          )}
          {linkError && <p role="alert" className={styles.errorMsg}>{linkError}</p>}
        </div>

        <div className={styles.divider} />

        {/* ── File info ── */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>File Info</span>
          <div className={styles.fileInfoGrid}>
            <span className={styles.fileInfoKey}>Added by</span>
            <span className={styles.fileInfoVal}>{item.uploaded_by}</span>
            <span className={styles.fileInfoKey}>Date Added</span>
            <span className={styles.fileInfoVal}>{formatDate(item.created_at)}</span>
            <span className={styles.fileInfoKey}>Filename</span>
            <span className={styles.fileInfoVal} title={item.original_filename}>{item.original_filename}</span>
          </div>
        </div>
      </div>

      {/* Footer — delete (admin only) */}
      {canDelete && (
        <div className={styles.footer}>
          {deleteError && <p role="alert" className={styles.errorMsg}>{deleteError}</p>}
          {deleteConfirm ? (
            <div className={styles.deleteConfirm}>
              <p className={styles.deleteConfirmText}>Permanently delete this media item? This cannot be undone.</p>
              <div className={styles.deleteConfirmActions}>
                <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting}>
                  Delete permanently
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)} disabled={isDeleting}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(true)}>
              Delete Media
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default MediaEditor;
