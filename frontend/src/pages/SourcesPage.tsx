import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import { useSearchStore } from '@/stores/searchStore';
import styles from './SourcesPage.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface Source {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publication_date: string | null;
  url: string | null;
  notes: string | null;
  created_at: string;
}

type QualityValue = 'primary' | 'secondary' | 'questionable' | 'unreliable';

interface Citation {
  id: string;
  person_id: string | null;
  event_id: string | null;
  page: string | null;
  quality: QualityValue | null;
  notes: string | null;
  created_at: string;
}

interface SourceForm {
  title: string;
  author: string;
  publisher: string;
  publication_date: string;
  url: string;
  notes: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const LIMIT = 50;
const SKELETON_COUNT = 6;

function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const m = dateStr.match(/\d{4}/);
  return m ? m[0] : null;
}

const EMPTY_FORM: SourceForm = {
  title: '',
  author: '',
  publisher: '',
  publication_date: '',
  url: '',
  notes: '',
};

function formFromSource(s: Source): SourceForm {
  return {
    title: s.title,
    author: s.author ?? '',
    publisher: s.publisher ?? '',
    publication_date: s.publication_date ?? '',
    url: s.url ?? '',
    notes: s.notes ?? '',
  };
}

// ── Quality badge ────────────────────────────────────────────────────────────

const QUALITY_LABELS: Record<QualityValue, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  questionable: 'Questionable',
  unreliable: 'Unreliable',
};

const QUALITY_CSS: Record<QualityValue, string> = {
  primary: styles.qualityPrimary,
  secondary: styles.qualitySecondary,
  questionable: styles.qualityQuestionable,
  unreliable: styles.qualityUnreliable,
};

interface QualityBadgeProps {
  quality: QualityValue | null;
}

const QualityBadge: React.FC<QualityBadgeProps> = ({ quality }) => {
  if (!quality) return null;
  return (
    <span className={`${styles.qualityBadge} ${QUALITY_CSS[quality]}`}>
      {QUALITY_LABELS[quality]}
    </span>
  );
};

// ── Book icon (SVG) ───────────────────────────────────────────────────────────

const BookIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
  >
    <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

// ── Source card (list) ───────────────────────────────────────────────────────

interface SourceCardProps {
  source: Source;
  citationCount: number | undefined;
  isActive: boolean;
  onClick: () => void;
}

const SourceCard: React.FC<SourceCardProps> = ({
  source,
  citationCount,
  isActive,
  onClick,
}) => {
  const year = extractYear(source.publication_date);
  const metaParts: string[] = [];
  if (source.author) metaParts.push(source.author);
  if (year) metaParts.push(year);

  return (
    <button
      className={`${styles.sourceCard} ${isActive ? styles.sourceCardActive : ''}`}
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`Select source: ${source.title}`}
    >
      <div className={styles.sourceIcon} aria-hidden="true">
        <BookIcon />
      </div>
      <div className={styles.sourceCardBody}>
        <div className={styles.sourceCardTitle}>{source.title}</div>
        {(metaParts.length > 0 || citationCount !== undefined) && (
          <div className={styles.sourceCardMeta}>
            {metaParts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className={styles.sourceCardMetaDot}>·</span>}
                <span className={styles.sourceCardMetaItem}>{part}</span>
              </React.Fragment>
            ))}
            {citationCount !== undefined && (
              <>
                {metaParts.length > 0 && (
                  <span className={styles.sourceCardMetaDot}>·</span>
                )}
                <span className={styles.citationCount}>
                  {citationCount} citation{citationCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  );
};

// ── Info row ─────────────────────────────────────────────────────────────────

interface InfoRowProps {
  label: string;
  value: string | null;
  full?: boolean;
  asLink?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, full = false, asLink = false }) => {
  const cls = full ? styles.infoRowFull : styles.infoRow;
  return (
    <div className={cls}>
      <span className={styles.infoLabel}>{label}</span>
      {value ? (
        asLink ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.infoLink}
          >
            {value}
          </a>
        ) : (
          <span className={styles.infoValue}>{value}</span>
        )
      ) : (
        <span className={styles.infoValueEmpty}>—</span>
      )}
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────

const SourcesPage: React.FC = () => {
  const { canCreate, canEdit, canDelete } = usePermissions();

  // ── List state ─────────────────────────────────────────────────────────────
  const [sources, setSources] = useState<Source[]>([]);
  const globalQuery = useSearchStore((s) => s.globalQuery);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Citation count cache (populated per source on select) ──────────────────
  const [citationCounts, setCitationCounts] = useState<Record<string, number>>({});

  // ── Selected source detail ─────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Source | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Citations ──────────────────────────────────────────────────────────────
  const [citations, setCitations] = useState<Citation[]>([]);
  const [isCitationsLoading, setIsCitationsLoading] = useState(false);
  const [citationsError, setCitationsError] = useState<string | null>(null);

  // ── Add form ───────────────────────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<SourceForm>(EMPTY_FORM);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<SourceForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Delete state ───────────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Fetch list ─────────────────────────────────────────────────────────────

  const fetchSources = useCallback(
    async (searchQuery: string, cursorParam: string | null, append: boolean) => {
      setIsLoading(true);
      if (!append) setError(null);
      try {
        const params = new URLSearchParams({ limit: String(LIMIT) });
        if (searchQuery) params.set('q', searchQuery);
        if (cursorParam) params.set('cursor', cursorParam);

        const res = await fetch(`/api/v1/sources?${params.toString()}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          throw new Error(`Failed to load sources (${res.status})`);
        }

        const data: {
          sources?: Source[];
          data?: Source[];
          next_cursor?: string | null;
        } = await res.json();

        const items: Source[] = data.sources ?? data.data ?? [];

        setSources((prev) => (append ? [...prev, ...items] : items));
        setCursor(data.next_cursor ?? null);
        setHasMore(!!data.next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sources');
        if (!append) setSources([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSources(globalQuery, null, false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [globalQuery, fetchSources]);

  const loadMore = () => {
    if (cursor && !isLoading) {
      fetchSources(globalQuery, cursor, true);
    }
  };

  // ── Fetch detail + citations ───────────────────────────────────────────────

  const fetchDetail = useCallback(async (id: string) => {
    setIsDetailLoading(true);
    setDetailError(null);
    setEditMode(false);
    setSaveError(null);
    setDeleteConfirm(false);
    try {
      const res = await fetch(`/api/v1/sources/${id}`, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load source (${res.status})`);
      }
      const data: Source = await res.json();
      setDetail(data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load source');
      setDetail(null);
    } finally {
      setIsDetailLoading(false);
    }
  }, []);

  const fetchCitations = useCallback(async (id: string) => {
    setIsCitationsLoading(true);
    setCitationsError(null);
    try {
      const res = await fetch(`/api/v1/sources/${id}/citations`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load citations (${res.status})`);
      }
      const data: Citation[] | { citations?: Citation[]; data?: Citation[] } =
        await res.json();
      const items = Array.isArray(data)
        ? data
        : (data.citations ?? data.data ?? []);
      setCitations(items);
      setCitationCounts((prev) => ({ ...prev, [id]: items.length }));
    } catch (err) {
      setCitationsError(
        err instanceof Error ? err.message : 'Failed to load citations',
      );
      setCitations([]);
    } finally {
      setIsCitationsLoading(false);
    }
  }, []);

  const handleSelectSource = (id: string) => {
    if (selectedId === id) return;
    setSelectedId(id);
    setShowAddForm(false);
    setAddError(null);
    setCitations([]);
    fetchDetail(id);
    fetchCitations(id);
  };

  // ── Add form handlers ──────────────────────────────────────────────────────

  const openAddForm = () => {
    setShowAddForm(true);
    setSelectedId(null);
    setDetail(null);
    setAddForm(EMPTY_FORM);
    setAddError(null);
    setEditMode(false);
  };

  const cancelAdd = () => {
    setShowAddForm(false);
    setAddError(null);
  };

  const handleAddFieldChange = (
    field: keyof SourceForm,
    value: string,
  ) => {
    setAddForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdd = async () => {
    if (!addForm.title.trim()) {
      setAddError('Title is required.');
      return;
    }
    setIsAdding(true);
    setAddError(null);
    try {
      const body = {
        title: addForm.title.trim(),
        author: addForm.author.trim() || null,
        publisher: addForm.publisher.trim() || null,
        publication_date: addForm.publication_date.trim() || null,
        url: addForm.url.trim() || null,
        notes: addForm.notes.trim() || null,
      };
      const res = await fetch('/api/v1/sources', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to create source (${res.status})`);
      }
      const newSource: Source = await res.json();
      setSources((prev) => [newSource, ...prev]);
      setShowAddForm(false);
      setAddForm(EMPTY_FORM);
      // Auto-select the new source
      setSelectedId(newSource.id);
      setDetail(newSource);
      setCitations([]);
      setCitationCounts((prev) => ({ ...prev, [newSource.id]: 0 }));
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create source');
    } finally {
      setIsAdding(false);
    }
  };

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const openEdit = () => {
    if (!detail) return;
    setEditForm(formFromSource(detail));
    setSaveError(null);
    setEditMode(true);
    setDeleteConfirm(false);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setSaveError(null);
  };

  const handleEditFieldChange = (field: keyof SourceForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!selectedId || !detail) return;
    if (!editForm.title.trim()) {
      setSaveError('Title is required.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const body = {
        title: editForm.title.trim(),
        author: editForm.author.trim() || null,
        publisher: editForm.publisher.trim() || null,
        publication_date: editForm.publication_date.trim() || null,
        url: editForm.url.trim() || null,
        notes: editForm.notes.trim() || null,
      };
      const res = await fetch(`/api/v1/sources/${selectedId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to save (${res.status})`);
      }
      const updated: Source = await res.json();
      setDetail(updated);
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete handlers ────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!selectedId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/sources/${selectedId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to delete source (${res.status})`);
      }
      setSources((prev) => prev.filter((s) => s.id !== selectedId));
      setSelectedId(null);
      setDetail(null);
      setCitations([]);
      setDeleteConfirm(false);
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : 'Failed to delete source',
      );
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const showSkeleton = isLoading && sources.length === 0;
  const showEmpty = !isLoading && !error && sources.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="sources" />} context="sources">
      <div className={styles.page}>
        <div className={styles.layout}>

          {/* ── Left panel: source list ───────────────────────────────── */}
          <div className={styles.listPanel}>
            <div className={styles.listHeader}>
              <h1 className={styles.listTitle}>Sources</h1>
              <div className={styles.listControls}>
                {canCreate && (
                  <Button variant="primary" size="sm" onClick={openAddForm}>
                    + Add
                  </Button>
                )}
              </div>
            </div>

            {error && (
              <div className={styles.errorBanner} role="alert">
                <span>{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchSources(globalQuery, null, false)}
                >
                  Retry
                </Button>
              </div>
            )}

            <div className={styles.listContent} role="list" aria-label="Sources list">
              {showSkeleton ? (
                Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                  <div
                    key={i}
                    className={styles.skeletonCard}
                    aria-hidden="true"
                    role="presentation"
                  />
                ))
              ) : showEmpty ? (
                <div className={styles.empty}>
                  {globalQuery
                    ? 'No sources match your search.'
                    : 'No sources yet. Add one to get started!'}
                </div>
              ) : (
                sources.map((source) => (
                  <div key={source.id} role="listitem">
                    <SourceCard
                      source={source}
                      citationCount={citationCounts[source.id]}
                      isActive={selectedId === source.id}
                      onClick={() => handleSelectSource(source.id)}
                    />
                  </div>
                ))
              )}
            </div>

            {hasMore && (
              <div className={styles.loadMore}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMore}
                  loading={isLoading}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>

          {/* ── Right panel: detail / add form ───────────────────────── */}
          <div className={styles.detailPanel}>
            {showAddForm ? (
              /* ── Add source form ────────────────────────────────────── */
              <div className={styles.detailContent}>
                <div className={styles.addFormHeader}>
                  <h2 className={styles.addFormTitle}>Add Source</h2>
                  <Button variant="ghost" size="sm" onClick={cancelAdd}>
                    Cancel
                  </Button>
                </div>

                <hr className={styles.divider} />

                <div className={styles.editForm}>
                  <div className={styles.editGrid}>
                    <label className={styles.editLabelFull}>
                      <span>
                        Title<span className={styles.requiredMark}>*</span>
                      </span>
                      <Input
                        value={addForm.title}
                        onChange={(e) => handleAddFieldChange('title', e.target.value)}
                        placeholder="e.g. 1881 England Census"
                        autoFocus
                        required
                      />
                    </label>
                    <label className={styles.editLabel}>
                      <span>Author</span>
                      <Input
                        value={addForm.author}
                        onChange={(e) => handleAddFieldChange('author', e.target.value)}
                        placeholder="e.g. John Smith"
                      />
                    </label>
                    <label className={styles.editLabel}>
                      <span>Publisher</span>
                      <Input
                        value={addForm.publisher}
                        onChange={(e) =>
                          handleAddFieldChange('publisher', e.target.value)
                        }
                        placeholder="e.g. FamilySearch"
                      />
                    </label>
                    <label className={styles.editLabel}>
                      <span>Publication Date</span>
                      <Input
                        value={addForm.publication_date}
                        onChange={(e) =>
                          handleAddFieldChange('publication_date', e.target.value)
                        }
                        placeholder="e.g. 1881"
                      />
                    </label>
                    <label className={styles.editLabel}>
                      <span>URL</span>
                      <Input
                        value={addForm.url}
                        onChange={(e) => handleAddFieldChange('url', e.target.value)}
                        placeholder="https://…"
                        type="url"
                      />
                    </label>
                    <label className={styles.editLabelFull}>
                      <span>Notes</span>
                      <textarea
                        className={styles.textarea}
                        value={addForm.notes}
                        onChange={(e) => handleAddFieldChange('notes', e.target.value)}
                        placeholder="Additional notes about this source…"
                        rows={3}
                      />
                    </label>
                  </div>

                  {addError && (
                    <div className={styles.saveError} role="alert">
                      {addError}
                    </div>
                  )}

                  <div className={styles.editActions}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAdd}
                      loading={isAdding}
                    >
                      Save Source
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelAdd}
                      disabled={isAdding}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : selectedId !== null ? (
              /* ── Source detail ──────────────────────────────────────── */
              isDetailLoading ? (
                <div className={styles.detailSkeleton} aria-busy="true" aria-label="Loading source…">
                  <div className={`${styles.skeletonLine}`} style={{ height: 32, width: '70%' }} />
                  <div className={`${styles.skeletonLine}`} style={{ height: 18, width: '50%' }} />
                  <div className={`${styles.skeletonLine}`} style={{ height: 80 }} />
                  <div className={`${styles.skeletonLine}`} style={{ height: 120 }} />
                </div>
              ) : detailError && !detail ? (
                <div className={styles.detailContent}>
                  <div className={styles.errorBanner} role="alert">
                    <span>{detailError}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchDetail(selectedId)}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              ) : detail ? (
                <div className={styles.detailContent}>
                  {/* Header */}
                  <div className={styles.detailHeader}>
                    <h2 className={styles.detailTitle}>{detail.title}</h2>
                    <div className={styles.detailActions}>
                      {canEdit && !editMode && (
                        <Button variant="ghost" size="sm" onClick={openEdit}>
                          Edit
                        </Button>
                      )}
                      {canDelete && !editMode && (
                        deleteConfirm ? (
                          <div className={styles.confirmDeleteRow}>
                            <span className={styles.confirmDeleteText}>
                              Delete this source?
                            </span>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={handleDelete}
                              loading={isDeleting}
                            >
                              Confirm
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
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setDeleteConfirm(true)}
                          >
                            Delete
                          </Button>
                        )
                      )}
                    </div>
                  </div>

                  {detailError && (
                    <div className={styles.errorBanner} role="alert">
                      {detailError}
                    </div>
                  )}

                  <hr className={styles.divider} />

                  {/* Source fields */}
                  {editMode ? (
                    /* ── Inline edit form ──────────────────────────────── */
                    <div className={styles.section}>
                      <div className={styles.editForm}>
                        <div className={styles.editGrid}>
                          <label className={styles.editLabelFull}>
                            <span>
                              Title<span className={styles.requiredMark}>*</span>
                            </span>
                            <Input
                              value={editForm.title}
                              onChange={(e) =>
                                handleEditFieldChange('title', e.target.value)
                              }
                              autoFocus
                            />
                          </label>
                          <label className={styles.editLabel}>
                            <span>Author</span>
                            <Input
                              value={editForm.author}
                              onChange={(e) =>
                                handleEditFieldChange('author', e.target.value)
                              }
                              placeholder="e.g. John Smith"
                            />
                          </label>
                          <label className={styles.editLabel}>
                            <span>Publisher</span>
                            <Input
                              value={editForm.publisher}
                              onChange={(e) =>
                                handleEditFieldChange('publisher', e.target.value)
                              }
                              placeholder="e.g. FamilySearch"
                            />
                          </label>
                          <label className={styles.editLabel}>
                            <span>Publication Date</span>
                            <Input
                              value={editForm.publication_date}
                              onChange={(e) =>
                                handleEditFieldChange(
                                  'publication_date',
                                  e.target.value,
                                )
                              }
                              placeholder="e.g. 1881"
                            />
                          </label>
                          <label className={styles.editLabel}>
                            <span>URL</span>
                            <Input
                              value={editForm.url}
                              onChange={(e) =>
                                handleEditFieldChange('url', e.target.value)
                              }
                              placeholder="https://…"
                              type="url"
                            />
                          </label>
                          <label className={styles.editLabelFull}>
                            <span>Notes</span>
                            <textarea
                              className={styles.textarea}
                              value={editForm.notes}
                              onChange={(e) =>
                                handleEditFieldChange('notes', e.target.value)
                              }
                              rows={3}
                            />
                          </label>
                        </div>

                        {saveError && (
                          <div className={styles.saveError} role="alert">
                            {saveError}
                          </div>
                        )}

                        <div className={styles.editActions}>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            loading={isSaving}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Read-only view ─────────────────────────────────── */
                    <div className={styles.section}>
                      <div className={styles.infoGrid}>
                        <InfoRow label="Author" value={detail.author} />
                        <InfoRow label="Publisher" value={detail.publisher} />
                        <InfoRow
                          label="Publication Date"
                          value={detail.publication_date}
                        />
                        {detail.url && (
                          <InfoRow
                            label="URL"
                            value={detail.url}
                            full
                            asLink
                          />
                        )}
                        {detail.notes && (
                          <InfoRow label="Notes" value={detail.notes} full />
                        )}
                      </div>
                    </div>
                  )}

                  <hr className={styles.divider} />

                  {/* Citations section */}
                  <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <h3 className={styles.sectionTitle}>
                        Citations
                        {!isCitationsLoading && (
                          <span className={styles.countBadge}>
                            {citations.length}
                          </span>
                        )}
                      </h3>
                    </div>

                    {isCitationsLoading ? (
                      <p className={styles.citationsLoading} aria-live="polite">
                        Loading citations…
                      </p>
                    ) : citationsError ? (
                      <div className={styles.errorBanner} role="alert">
                        <span>{citationsError}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchCitations(selectedId)}
                        >
                          Retry
                        </Button>
                      </div>
                    ) : citations.length === 0 ? (
                      <p className={styles.noInfo}>
                        No citations recorded for this source.
                      </p>
                    ) : (
                      <ul className={styles.citationsList} aria-label="Citations">
                        {citations.map((c) => (
                          <li key={c.id} className={styles.citationItem}>
                            <div className={styles.citationRow}>
                              {c.page && (
                                <span className={styles.citationPage}>
                                  p.&nbsp;{c.page}
                                </span>
                              )}
                              <QualityBadge quality={c.quality} />
                              {c.person_id && (
                                <Link
                                  to={`/people/${c.person_id}`}
                                  className={styles.citationPersonLink}
                                >
                                  <svg
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                    width="12"
                                    height="12"
                                    aria-hidden="true"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                                      clipRule="evenodd"
                                    />
                                  </svg>
                                  View Person
                                </Link>
                              )}
                            </div>
                            {c.notes && (
                              <p className={styles.citationNotes}>{c.notes}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null
            ) : (
              /* ── Placeholder when nothing is selected ───────────────── */
              <div className={styles.detailPlaceholder}>
                <div className={styles.detailPlaceholderIcon} aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <p className={styles.detailPlaceholderText}>
                  Select a source from the list to view details
                  {canCreate ? ', or click "+ Add" to create a new one.' : '.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default SourcesPage;
