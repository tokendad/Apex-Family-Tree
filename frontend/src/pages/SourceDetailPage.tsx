import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import ArchiveObjectLayout from '@/components/archive-object/ArchiveObjectLayout';
import { type ContextActionItem } from '@/components/archive-object/ContextActionsMenu';
import { usePageActions } from '@/contexts/PageActionsContext';
import { usePermissions } from '@/hooks/usePermissions';
import styles from '@/components/archive-object/ArchiveDetailPage.module.css';
import localStyles from './SourceDetailPage.module.css';

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

function extractYear(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const m = dateStr.match(/\d{4}/);
  return m ? m[0] : null;
}

const QUALITY_LABELS: Record<QualityValue, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  questionable: 'Questionable',
  unreliable: 'Unreliable',
};

const QUALITY_CSS: Record<QualityValue, string> = {
  primary: localStyles.qualityPrimary,
  secondary: localStyles.qualitySecondary,
  questionable: localStyles.qualityQuestionable,
  unreliable: localStyles.qualityUnreliable,
};

const QualityBadge: React.FC<{ quality: QualityValue | null }> = ({ quality }) => {
  if (!quality) return null;
  return (
    <span className={`${localStyles.qualityBadge} ${QUALITY_CSS[quality]}`}>
      {QUALITY_LABELS[quality]}
    </span>
  );
};

const InfoRow: React.FC<{ label: string; value: string | null; asLink?: boolean }> = ({ label, value, asLink = false }) => (
  <div className={styles.infoRow}>
    <span>{label}</span>
    {value && asLink ? (
      <a href={value} target="_blank" rel="noopener noreferrer">{value}</a>
    ) : (
      <strong>{value || '—'}</strong>
    )}
  </div>
);

const SourceDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = usePermissions();

  const [source, setSource] = useState<Source | null>(null);
  const [form, setForm] = useState<SourceForm | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const [citations, setCitations] = useState<Citation[]>([]);
  const [isCitationsLoading, setIsCitationsLoading] = useState(true);
  const [citationPersonId, setCitationPersonId] = useState<PersonResult | null>(null);
  const [citationEventId, setCitationEventId] = useState('');
  const [citationPage, setCitationPage] = useState('');
  const [citationQuality, setCitationQuality] = useState<QualityValue>('secondary');
  const [citationNotes, setCitationNotes] = useState('');
  const [isAddingCitation, setIsAddingCitation] = useState(false);
  const [citationError, setCitationError] = useState<string | null>(null);

  const loadSource = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/sources/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Source not found');
      const json = await res.json() as Source;
      setSource(json);
      setForm(formFromSource(json));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load source');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const loadCitations = useCallback(async () => {
    if (!id) return;
    setIsCitationsLoading(true);
    try {
      const res = await fetch(`/api/v1/sources/${id}/citations`, { credentials: 'include' });
      if (!res.ok) return;
      const data: Citation[] | { citations?: Citation[]; data?: Citation[] } = await res.json();
      setCitations(Array.isArray(data) ? data : (data.citations ?? data.data ?? []));
    } finally {
      setIsCitationsLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadSource(); }, [loadSource]);
  useEffect(() => { void loadCitations(); }, [loadCitations]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !form) return;
    if (!form.title.trim()) return;
    const res = await fetch(`/api/v1/sources/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        author: form.author.trim() || null,
        publisher: form.publisher.trim() || null,
        publication_date: form.publication_date.trim() || null,
        url: form.url.trim() || null,
        notes: form.notes.trim() || null,
      }),
    });
    if (res.ok) {
      const updated = await res.json() as Source;
      setSource(updated);
      setForm(formFromSource(updated));
      setEditMode(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this source?')) return;
    const res = await fetch(`/api/v1/sources/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) navigate('/sources');
  };

  const handleAddCitation = async () => {
    if (!id) return;
    setIsAddingCitation(true);
    setCitationError(null);
    try {
      const res = await fetch(`/api/v1/sources/${id}/citations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: citationPersonId?.id ?? null,
          event_id: citationEventId.trim() || null,
          page: citationPage.trim() || null,
          quality: citationQuality,
          notes: citationNotes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to add citation');
      setCitationPersonId(null);
      setCitationEventId('');
      setCitationPage('');
      setCitationNotes('');
      await loadCitations();
    } catch (err) {
      setCitationError(err instanceof Error ? err.message : 'Failed to add citation');
    } finally {
      setIsAddingCitation(false);
    }
  };

  const contextActions: ContextActionItem[] = [
    {
      id: 'add-citation',
      label: 'Add Citation',
      description: 'Cite this source for a person or event',
      disabled: !canEdit,
      onSelect: () => setActiveTab('citations'),
    },
    {
      id: 'edit-source',
      label: 'Edit Source',
      description: 'Update title, author, and publication details',
      group: 'manage',
      disabled: !canEdit,
      onSelect: () => {
        setEditMode(true);
        setActiveTab('overview');
      },
    },
    {
      id: 'delete-source',
      label: 'Delete Source',
      description: 'Remove this source record',
      group: 'manage',
      danger: true,
      disabled: !canDelete,
      onSelect: handleDelete,
    },
  ];

  usePageActions(source ? `Actions for ${source.title}` : '', source ? contextActions : []);

  const year = source ? extractYear(source.publication_date) : null;

  return (
    <AppShell navbar={<Navbar />} context="sources">
      <div className={styles.page}>
        <div className={styles.pageInner}>
          {isLoading ? (
            <div className={styles.centered}>Loading source...</div>
          ) : error || !source || !form ? (
            <div className={styles.errorBanner} role="alert">{error ?? 'Source not found'}</div>
          ) : (
            <ArchiveObjectLayout
              breadcrumb={<><Link to="/sources">Sources</Link> / Archive Profile</>}
              title={source.title}
              subtitle={[source.author, year].filter(Boolean).join(' • ')}
              avatar={<span>📖</span>}
              stats={[
                { label: 'Citations', value: citations.length },
                { label: 'Publisher', value: source.publisher ?? '—' },
              ]}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'citations', label: 'Citations', count: citations.length },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              connectedGroups={[]}
            >
              {activeTab === 'overview' && (
                <div className={styles.tabStack}>
                  {editMode ? (
                    <form className={styles.section} onSubmit={handleSave}>
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Edit Source</h2>
                      </div>
                      <div className={styles.formGrid}>
                        <label className={styles.field}>
                          <span>Title</span>
                          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                        </label>
                        <label className={styles.field}>
                          <span>Author</span>
                          <Input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="e.g. John Smith" />
                        </label>
                        <label className={styles.field}>
                          <span>Publisher</span>
                          <Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} placeholder="e.g. FamilySearch" />
                        </label>
                        <label className={styles.field}>
                          <span>Publication Date</span>
                          <Input value={form.publication_date} onChange={(e) => setForm({ ...form, publication_date: e.target.value })} placeholder="e.g. 1881" />
                        </label>
                        <label className={styles.field}>
                          <span>URL</span>
                          <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} type="url" placeholder="https://…" />
                        </label>
                      </div>
                      <label className={styles.field}>
                        <span>Notes</span>
                        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                      </label>
                      <div className={styles.formActions}>
                        <Button variant="ghost" type="button" onClick={() => setEditMode(false)}>Cancel</Button>
                        <Button type="submit">Save Source</Button>
                      </div>
                    </form>
                  ) : (
                    <section className={styles.section} aria-labelledby="source-details-heading">
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle} id="source-details-heading">Source Details</h2>
                      </div>
                      <div className={styles.infoGrid}>
                        <InfoRow label="Author" value={source.author} />
                        <InfoRow label="Publisher" value={source.publisher} />
                        <InfoRow label="Publication Date" value={source.publication_date} />
                        {source.url && <InfoRow label="URL" value={source.url} asLink />}
                        {source.notes && <InfoRow label="Notes" value={source.notes} />}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {activeTab === 'citations' && (
                <section className={styles.section} aria-labelledby="citations-heading">
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle} id="citations-heading">Citations</h2>
                  </div>
                  {isCitationsLoading ? (
                    <p className={localStyles.citationsLoading}>Loading citations…</p>
                  ) : citations.length === 0 ? (
                    <p className={styles.muted}>No citations recorded for this source.</p>
                  ) : (
                    <ul className={localStyles.citationsList} aria-label="Citations">
                      {citations.map((c) => (
                        <li key={c.id} className={localStyles.citationItem}>
                          <div className={localStyles.citationRow}>
                            {c.page && <span className={localStyles.citationPage}>p.&nbsp;{c.page}</span>}
                            <QualityBadge quality={c.quality} />
                            {c.person_id && (
                              <Link to={`/people/${c.person_id}`} className={localStyles.citationPersonLink}>
                                View Person
                              </Link>
                            )}
                            {c.event_id && (
                              <Link to={`/events/${c.event_id}`} className={localStyles.citationPersonLink}>
                                View Event
                              </Link>
                            )}
                          </div>
                          {c.notes && <p className={localStyles.citationNotes}>{c.notes}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit && (
                    <div className={styles.connectBox}>
                      <PersonPicker value={citationPersonId?.id ?? null} onSelect={setCitationPersonId} onClear={() => setCitationPersonId(null)} />
                      <Input placeholder="Event ID (optional)" value={citationEventId} onChange={(e) => setCitationEventId(e.target.value)} />
                      <Input placeholder="Page" value={citationPage} onChange={(e) => setCitationPage(e.target.value)} />
                      <select value={citationQuality} onChange={(e) => setCitationQuality(e.target.value as QualityValue)}>
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                        <option value="questionable">Questionable</option>
                        <option value="unreliable">Unreliable</option>
                      </select>
                      <Input placeholder="Notes" value={citationNotes} onChange={(e) => setCitationNotes(e.target.value)} />
                      <Button onClick={handleAddCitation} loading={isAddingCitation}>Add Citation</Button>
                    </div>
                  )}
                  {citationError && <div className={styles.errorBanner} role="alert">{citationError}</div>}
                </section>
              )}
            </ArchiveObjectLayout>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default SourceDetailPage;
