import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import PersonEditModal from '@/components/PersonEditModal/PersonEditModal';
import { usePermissions } from '@/hooks/usePermissions';
import { useModal } from '@/components/modals/useModal';
import type { FamilySummary } from '@/types/genealogy';
import { getPersonDisplayName } from '@/utils/entityDisplay';
import styles from './PersonDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type NameType = 'birth' | 'married' | 'aka' | 'nickname' | 'formal' | 'religious';
type SexType = 'M' | 'F' | 'X' | 'U';
type ChildRole = 'child' | 'adopted' | 'foster' | 'step';

interface PersonName {
  id: string;
  name_type: NameType;
  prefix: string | null;
  given_name: string | null;
  middle_name: string | null;
  surname: string | null;
  suffix: string | null;
  nickname: string | null;
  is_primary: 0 | 1;
}

interface PersonEvent {
  id: string;
  event_type: string;
  event_date: string | null;
  event_place: string | null;
  description: string | null;
}

interface PersonDetail {
  id: string;
  sex: SexType;
  is_living: 0 | 1;
  is_private: 0 | 1;
  notes: string | null;
  displayName?: string | null;
  display_name: string | null;
  created_at: string;
  names: PersonName[];
  events: PersonEvent[];
}

interface PersonSummary {
  id: string;
  displayName?: string | null;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
  surname: string | null;
}

interface ChildMember {
  id: string;
  person_id: string;
  displayName?: string | null;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
  surname: string | null;
  role: ChildRole;
}

interface Relationship {
  family_id: string;
  type: 'parent_family' | 'child_family';
  role: 'spouse1' | 'spouse2' | 'child';
  spouse1: PersonSummary | null;
  spouse2: PersonSummary | null;
  children: ChildMember[];
}

interface MediaItem {
  id: string;
  filename?: string;
  file_name?: string;
  media_type?: string;
  url?: string;
  thumbnail_url?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEX_LABELS: Record<SexType, string> = {
  M: 'Male',
  F: 'Female',
  X: 'Non-binary',
  U: 'Unknown',
};

const NAME_TYPE_LABELS: Record<NameType, string> = {
  birth: 'Birth',
  married: 'Married',
  aka: 'AKA',
  nickname: 'Nickname',
  formal: 'Formal',
  religious: 'Religious',
};

const NAME_TYPE_CSS: Record<NameType, string> = {
  birth: styles.nameTypeBirth,
  married: styles.nameTypeMarried,
  aka: styles.nameTypeAka,
  nickname: styles.nameTypeNickname,
  formal: styles.nameTypeFormal,
  religious: styles.nameTypeReligious,
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  birth: 'Birth',
  death: 'Death',
  marriage: 'Marriage',
  burial: 'Burial',
  baptism: 'Baptism',
  christening: 'Christening',
  graduation: 'Graduation',
  military: 'Military Service',
  immigration: 'Immigration',
  emigration: 'Emigration',
  naturalization: 'Naturalization',
  divorce: 'Divorce',
  residence: 'Residence',
  occupation: 'Occupation',
  education: 'Education',
};

/** Events that should appear first, keyed to their sort priority (lower = earlier). */
const EVENT_EARLY_ORDER: Record<string, number> = {
  birth: 0,
  baptism: 1,
  christening: 1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function personName(p: { displayName?: string | null; display_name?: string | null; given_name: string | null; middle_name?: string | null; surname: string | null } | null): string {
  if (!p) return 'Unknown';
  return getPersonDisplayName(p);
}

function fullName(name: PersonName): string {
  const nickname = name.nickname ? `"${name.nickname}"` : null;
  const parts = [name.prefix, name.given_name, name.middle_name, nickname, name.surname, name.suffix].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function primaryName(names: PersonName[]): PersonName | null {
  return names.find((n) => n.is_primary === 1) ?? names[0] ?? null;
}

function formatEventType(type: string): string {
  return (
    EVENT_TYPE_LABELS[type] ??
    type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function sortEvents(events: PersonEvent[]): PersonEvent[] {
  return [...events].sort((a, b) => {
    const aOrder = a.event_type === 'death' ? 999 : (EVENT_EARLY_ORDER[a.event_type] ?? 50);
    const bOrder = b.event_type === 'death' ? 999 : (EVENT_EARLY_ORDER[b.event_type] ?? 50);
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.event_date && b.event_date) return a.event_date.localeCompare(b.event_date);
    if (a.event_date) return -1;
    if (b.event_date) return 1;
    return 0;
  });
}

function mediaDisplayName(item: MediaItem): string {
  return item.filename ?? item.file_name ?? `Media ${item.id.slice(0, 8)}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface InfoRowProps {
  label: string;
  value: string | null;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div className={styles.infoRow}>
    <span className={styles.infoLabel}>{label}</span>
    <span className={value ? styles.infoValue : styles.noInfo}>{value ?? '—'}</span>
  </div>
);

interface MediaThumbProps {
  item: MediaItem;
}

const MediaThumb: React.FC<MediaThumbProps> = ({ item }) => {
  const [imgError, setImgError] = useState(false);
  const src = item.thumbnail_url ?? item.url;

  if (src && !imgError) {
    return (
      <img
        className={styles.mediaThumbImg}
        src={src}
        alt={mediaDisplayName(item)}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    );
  }

  return (
    <div className={styles.mediaThumbPlaceholder} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v10.5a1.5 1.5 0 001.5 1.5z" />
      </svg>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const PersonDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { openModal } = useModal();

  // ── Person ──
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ── Relationships ──
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [relLoading, setRelLoading] = useState(true);

  // ── Media ──
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);

  // ── Delete ──
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Inline post-load error ──
  const [inlineError, setInlineError] = useState<string | null>(null);

  // ── Edit modal ──
  const [showEditModal, setShowEditModal] = useState(false);

  // ─── Fetchers ──────────────────────────────────────────────────────────────

  const fetchPerson = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/v1/people/${id}`, { credentials: 'include' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load person (${res.status})`);
      const data: PersonDetail = await res.json();
      setPerson(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load person');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchRelationships = useCallback(async () => {
    if (!id) return;
    setRelLoading(true);
    try {
      const res = await fetch(`/api/v1/people/${id}/relationships`, { credentials: 'include' });
      if (res.ok) {
        const data: Relationship[] = await res.json();
        setRelationships(data);
      }
    } catch {
      // Non-critical — fail silently, relationships section shows empty state
    } finally {
      setRelLoading(false);
    }
  }, [id]);

  const fetchMedia = useCallback(async () => {
    if (!id) return;
    setMediaLoading(true);
    try {
      const res = await fetch(`/api/v1/media/people/${id}/media`, { credentials: 'include' });
      if (res.ok) {
        const data: MediaItem[] = await res.json();
        setMedia(data);
      }
    } catch {
      // Non-critical — fail silently
    } finally {
      setMediaLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPerson();
    fetchRelationships();
    fetchMedia();
  }, [fetchPerson, fetchRelationships, fetchMedia]);

  // ─── Delete handler ────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/people/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete person (${res.status})`);
      navigate('/people', { replace: true });
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to delete person');
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ─── Guard renders ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppShell navbar={<Navbar />} sidebar={<Sidebar context="people" />}>
        <div className={styles.page}>
          <div className={styles.loadingState} aria-busy="true" aria-label="Loading person…">
            <div className={styles.skeletonHeading} />
            <div className={styles.contentGrid}>
              <div className={styles.leftCol}>
                <div className={styles.skeletonSection} />
                <div className={styles.skeletonSection} />
              </div>
              <div className={styles.rightCol}>
                <div className={styles.skeletonSection} />
                <div className={styles.skeletonSection} />
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell navbar={<Navbar />} sidebar={<Sidebar context="people" />}>
        <div className={styles.page}>
          <div className={styles.centeredState}>
            <div className={styles.centeredIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h2 className={styles.centeredTitle}>Person not found</h2>
            <p className={styles.centeredDesc}>
              This person record does not exist or has been deleted.
            </p>
            <Button variant="primary" size="sm" onClick={() => navigate('/people')}>
              Back to People
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error && !person) {
    return (
      <AppShell navbar={<Navbar />} sidebar={<Sidebar context="people" />}>
        <div className={styles.page}>
          <div className={styles.centeredState}>
            <div className={styles.centeredIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className={styles.centeredTitle}>Something went wrong</h2>
            <p className={styles.centeredDesc}>{error}</p>
            <Button variant="primary" size="sm" onClick={fetchPerson}>
              Try again
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!person) return null;

  // ─── Derived values ────────────────────────────────────────────────────────

  const primary = primaryName(person.names);
  const displayTitle =
    person.displayName?.trim() || person.display_name?.trim() || (primary ? fullName(primary) : 'Unknown Person');

  const sortedEventsList = sortEvents(person.events);
  const childFamilies = relationships.filter((r) => r.type === 'child_family');
  const parentFamilies = relationships.filter((r) => r.type === 'parent_family');

  // ─── Full render ───────────────────────────────────────────────────────────

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="people" />}>
      <div className={styles.page}>

        {/* ── Page header ── */}
        <div className={styles.pageHeader}>
          <button className={styles.backBtn} onClick={() => navigate('/people')}>
            ← People
          </button>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>{displayTitle}</h1>
            <div className={styles.headerActions}>
              {canEdit && !deleteConfirm && (
                <Button variant="ghost" size="sm" onClick={() => setShowEditModal(true)}>
                  Edit Info
                </Button>
              )}
              {canDelete && !deleteConfirm && (
                <Button variant="danger" size="sm" onClick={() => setDeleteConfirm(true)}>
                  Delete
                </Button>
              )}
              {deleteConfirm && (
                <div className={styles.confirmDelete}>
                  <span className={styles.confirmText}>Delete this person?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDelete}
                    loading={isDeleting}
                  >
                    Confirm Delete
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
              )}
            </div>
          </div>
        </div>

        {/* ── Inline error banner ── */}
        {inlineError && (
          <div className={styles.errorBanner} role="alert">
            {inlineError}
          </div>
        )}

        {/* ── Main 2-column content grid ── */}
        <div className={styles.contentGrid}>

          {/* ════════════════ LEFT COLUMN ════════════════ */}
          <div className={styles.leftCol}>

            {/* ── Basic Information ── */}
            <section className={styles.section} aria-labelledby="basic-info-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="basic-info-heading">
                  Basic Information
                </h2>
              </div>

              {/* Read-only info grid */}
              <div className={styles.infoGrid}>
                <InfoRow label="Sex" value={SEX_LABELS[person.sex]} />

                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Status</span>
                  <span
                    className={`${styles.statusBadge} ${
                      person.is_living === 1 ? styles.statusLiving : styles.statusDeceased
                    }`}
                  >
                    {person.is_living === 1 ? 'Living' : 'Deceased'}
                  </span>
                </div>

                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Privacy</span>
                  {person.is_private === 1 ? (
                    <span className={styles.privateBadge}>Private</span>
                  ) : (
                    <span className={styles.infoValue}>Public</span>
                  )}
                </div>

                {person.created_at && (
                  <InfoRow
                    label="Added"
                    value={new Date(person.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  />
                )}
              </div>
            </section>

            {/* ── Names ── */}
            <section className={styles.section} aria-labelledby="names-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="names-heading">
                  Names
                  {person.names.length > 0 && (
                    <span className={styles.countBadge}>{person.names.length}</span>
                  )}
                </h2>
              </div>

              {person.names.length === 0 ? (
                <p className={styles.noInfo}>No names recorded.</p>
              ) : (
                <ul className={styles.namesList}>
                  {person.names.map((name) => (
                    <li key={name.id} className={styles.nameItem}>
                      <div className={styles.nameItemMain}>
                        <span className={styles.nameText}>{fullName(name)}</span>
                        <span
                          className={`${styles.nameTypeBadge} ${NAME_TYPE_CSS[name.name_type]}`}
                        >
                          {NAME_TYPE_LABELS[name.name_type]}
                        </span>
                        {name.is_primary === 1 && (
                          <span className={styles.primaryBadge}>Primary</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Notes (read-only; shown when content exists) ── */}
            {person.notes && (
              <section className={styles.section} aria-labelledby="notes-heading">
                <h2 className={styles.sectionTitle} id="notes-heading">
                  Notes
                </h2>
                <p className={styles.notesText}>{person.notes}</p>
              </section>
            )}
          </div>

          {/* ════════════════ RIGHT COLUMN ════════════════ */}
          <div className={styles.rightCol}>

            {/* ── Events timeline ── */}
            <section className={styles.section} aria-labelledby="events-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="events-heading">
                  Events
                  {sortedEventsList.length > 0 && (
                    <span className={styles.countBadge}>{sortedEventsList.length}</span>
                  )}
                </h2>
              </div>

              {sortedEventsList.length === 0 ? (
                <p className={styles.noInfo}>No events recorded.</p>
              ) : (
                <ol className={styles.eventsList} aria-label="Life events timeline">
                  {sortedEventsList.map((event) => (
                    <li key={event.id} className={styles.eventItem}>
                      <div className={styles.eventDot} aria-hidden="true" />
                      <div className={styles.eventContent}>
                        <div className={styles.eventHeader}>
                          <span className={styles.eventType}>
                            {formatEventType(event.event_type)}
                          </span>
                          <div className={styles.eventHeaderRight}>
                            {event.event_date && (
                              <span className={styles.eventDate}>{event.event_date}</span>
                            )}
                          </div>
                        </div>
                        {event.event_place && (
                          <div className={styles.eventPlace}>📍 {event.event_place}</div>
                        )}
                        {event.description && (
                          <div className={styles.eventDesc}>{event.description}</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── Relationships ── */}
            <section className={styles.section} aria-labelledby="relationships-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="relationships-heading">
                  Relationships
                </h2>
                {canCreate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const result = await openModal<FamilySummary>('FamilyEditor', {
                        mode: 'create',
                        defaults: { spouse1_id: id },
                      });
                      if (result.action === 'created') {
                        navigate(`/families/${result.entity.id}`);
                      }
                    }}
                  >
                    + Add Family
                  </Button>
                )}
              </div>

              {relLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : relationships.length === 0 ? (
                <p className={styles.noInfo}>No family relationships recorded.</p>
              ) : (
                <div className={styles.relGroups}>

                  {/* ── As a child ── */}
                  {childFamilies.length > 0 && (
                    <div className={styles.relGroup}>
                      <h3 className={styles.relGroupTitle}>As a child</h3>
                      {childFamilies.map((rel) => {
                        const parents = [rel.spouse1, rel.spouse2].filter(
                          (p): p is PersonSummary => p !== null,
                        );
                        const siblings = rel.children.filter((c) => c.person_id !== id);

                        return (
                          <div key={rel.family_id} className={styles.relCard}>
                            <div className={styles.relCardSection}>
                              <span className={styles.relRoleLabel}>Parents</span>
                              {parents.length === 0 ? (
                                <span className={styles.noInfo}>Unknown parents</span>
                              ) : (
                                <div className={styles.relPersonList}>
                                  {parents.map((p) => (
                                    <Link
                                      key={p.id}
                                      to={`/people/${p.id}`}
                                      className={styles.relPersonLink}
                                    >
                                      {personName(p)}
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>

                            {siblings.length > 0 && (
                              <div className={styles.relCardSection}>
                                <span className={styles.relRoleLabel}>
                                  Siblings ({siblings.length})
                                </span>
                                <div className={styles.relPersonList}>
                                  {siblings.map((c) => (
                                    <Link
                                      key={c.id}
                                      to={`/people/${c.person_id}`}
                                      className={styles.relPersonLink}
                                    >
                                      {personName(c)}
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── As a spouse / parent ── */}
                  {parentFamilies.length > 0 && (
                    <div className={styles.relGroup}>
                      <h3 className={styles.relGroupTitle}>As a spouse / parent</h3>
                      {parentFamilies.map((rel) => {
                        // Determine which spouse slot this person occupies, show the other
                        const otherSpouse = rel.role === 'spouse1' ? rel.spouse2 : rel.spouse1;

                        return (
                          <div key={rel.family_id} className={styles.relCard}>
                            <div className={styles.relCardSection}>
                              <span className={styles.relRoleLabel}>Spouse</span>
                              {otherSpouse ? (
                                <div className={styles.relPersonList}>
                                  <Link
                                    to={`/people/${otherSpouse.id}`}
                                    className={styles.relPersonLink}
                                  >
                                    {personName(otherSpouse)}
                                  </Link>
                                </div>
                              ) : (
                                <span className={styles.noInfo}>Not recorded</span>
                              )}
                            </div>

                            {rel.children.length > 0 && (
                              <div className={styles.relCardSection}>
                                <span className={styles.relRoleLabel}>
                                  Children ({rel.children.length})
                                </span>
                                <div className={styles.relPersonList}>
                                  {rel.children.map((c) => (
                                    <Link
                                      key={c.id}
                                      to={`/people/${c.person_id}`}
                                      className={styles.relPersonLink}
                                    >
                                      {personName(c)}
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── Media ── */}
            <section className={styles.section} aria-labelledby="media-heading">
              <h2 className={styles.sectionTitle} id="media-heading">
                Media
                {media.length > 0 && (
                  <span className={styles.countBadge}>{media.length}</span>
                )}
              </h2>

              {mediaLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : media.length === 0 ? (
                <p className={styles.noInfo}>No media linked to this person.</p>
              ) : (
                <div className={styles.mediaGrid}>
                  {media.map((item) => (
                    <a
                      key={item.id}
                      href={`/api/v1/media/${item.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.mediaThumbnail}
                      title={mediaDisplayName(item)}
                    >
                      <MediaThumb item={item} />
                      <span className={styles.mediaFilename}>{mediaDisplayName(item)}</span>
                    </a>
                  ))}
                </div>
              )}
            </section>

          </div>
          {/* end rightCol */}
        </div>
        {/* end contentGrid */}

      </div>

      {/* ── Edit modal ── */}
      <PersonEditModal
        open={showEditModal}
        personId={id ?? null}
        displayName={displayTitle}
        onClose={() => setShowEditModal(false)}
        onSaved={() => {
          fetchPerson();
          fetchRelationships();
          fetchMedia();
        }}
      />
    </AppShell>
  );
};

export default PersonDetailPage;
