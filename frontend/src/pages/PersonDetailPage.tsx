import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import PersonEditModal from '@/components/PersonEditModal/PersonEditModal';
import ActionDrawer from '@/components/archive-object/ActionDrawer';
import ArchiveObjectLayout from '@/components/archive-object/ArchiveObjectLayout';
import ArtifactCard from '@/components/archive-object/ArtifactCard';
import { type ContextActionItem } from '@/components/archive-object/ContextActionsMenu';
import { usePageActions } from '@/contexts/PageActionsContext';
import ObjectCollections, { CollectionMembership } from '@/components/ObjectCollections/ObjectCollections';
import { usePermissions } from '@/hooks/usePermissions';
import { useModal } from '@/components/modals/useModal';
import type { FamilySummary } from '@/types/genealogy';
import { getPersonDisplayName } from '@/utils/entityDisplay';
import {
  EVENT_EARLY_ORDER,
  formatEventType,
  partitionByKind,
} from '@/utils/eventTypes';
import { lifespanLabel } from '@/utils/personEvents';
import { formatYear, type DateQualifier } from '@/utils/gedcomDate';
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
  /** Comes straight from the events table; the API passes the row through. */
  event_date_qualifier?: DateQualifier;
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

interface ConnectedObject {
  relationship_id: string;
  relationship_type_code: string;
  relationship_type_name: string;
  role: string;
  object_id: string;
  object_type: string;
  title: string;
  summary: string | null;
  artifact_type_name: string | null;
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

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '');
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

  // ── Archive connections ──
  const [connectedObjects, setConnectedObjects] = useState<ConnectedObject[]>([]);
  // Collection membership is collection_items, not a relationship (#26).
  const [memberOf, setMemberOf] = useState<CollectionMembership[]>([]);
  const [connectedObjectsLoading, setConnectedObjectsLoading] = useState(true);

  // ── Delete ──
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Inline post-load error ──
  const [inlineError, setInlineError] = useState<string | null>(null);

  // ── Edit modal ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [drawerMode, setDrawerMode] = useState<'connect-artifact' | 'add-story' | null>(null);

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

  const fetchConnectedObjects = useCallback(async () => {
    if (!id) return;
    setConnectedObjectsLoading(true);
    try {
      const res = await fetch(`/api/v1/relationships/objects/${id}/connected`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json() as { data: ConnectedObject[] };
        setConnectedObjects(json.data ?? []);
      }
    } catch {
      // Non-critical — connected objects can be empty until Phase 4 data exists.
    } finally {
      setConnectedObjectsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPerson();
    fetchRelationships();
    fetchMedia();
    fetchConnectedObjects();
  }, [fetchPerson, fetchRelationships, fetchMedia, fetchConnectedObjects]);

  // ─── Context actions (registered in the global topbar Actions menu) ───────

  const primary = person ? primaryName(person.names) : null;
  const displayTitle = person
    ? person.displayName?.trim() || person.display_name?.trim() || (primary ? fullName(primary) : 'Unknown Person')
    : '';

  const handleAddFamily = async () => {
    const result = await openModal<FamilySummary>('FamilyEditor', {
      mode: 'create',
      defaults: { spouse1_id: id },
    });
    if (result.action === 'created') navigate(`/families/${result.entity.id}`);
  };

  const contextActions: ContextActionItem[] = [
    {
      id: 'connect-artifact',
      label: 'Connect Artifact',
      description: 'Link this person to a preserved item',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('connect-artifact'),
    },
    {
      id: 'add-story',
      label: 'Add Story',
      description: 'Preserve a memory or explanation',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('add-story'),
    },
    {
      id: 'add-family',
      label: 'Add Family',
      description: 'Create a family relationship record',
      disabled: !canCreate,
      onSelect: handleAddFamily,
    },
    {
      id: 'edit-person',
      label: 'Edit Person',
      description: 'Names, privacy, notes, and identity',
      group: 'manage',
      disabled: !canEdit,
      onSelect: () => setShowEditModal(true),
    },
    {
      id: 'delete-person',
      label: 'Delete Person',
      description: 'Remove this person record',
      group: 'manage',
      danger: true,
      disabled: !canDelete,
      onSelect: () => setDeleteConfirm(true),
    },
  ];

  usePageActions(person ? `Actions for ${displayTitle}` : '', person ? contextActions : []);

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
      <AppShell navbar={<Navbar />}>
        <div className={styles.page}>
          <div className={styles.pageInner}>
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
        </div>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell navbar={<Navbar />}>
        <div className={styles.page}>
          <div className={styles.pageInner}>
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
        </div>
      </AppShell>
    );
  }

  if (error && !person) {
    return (
      <AppShell navbar={<Navbar />}>
        <div className={styles.page}>
          <div className={styles.pageInner}>
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
        </div>
      </AppShell>
    );
  }

  if (!person) return null;

  // ─── Derived values ────────────────────────────────────────────────────────

  const sortedEventsList = sortEvents(person.events);
  // Attributes describe the person rather than occurring at a moment, so they
  // are listed separately instead of interleaved into the timeline (#32).
  const { events: timelineEvents, attributes } = partitionByKind(sortedEventsList);
  const childFamilies = relationships.filter((r) => r.type === 'child_family');
  const parentFamilies = relationships.filter((r) => r.type === 'parent_family');

  const connectedArtifacts = connectedObjects.filter((o) => o.object_type === 'artifact');
  const connectedStories = connectedObjects.filter((o) => o.object_type === 'story');

  /**
   * One list of this person's artifacts, merged from the two tables that
   * describe them.
   *
   * person_media is the legacy link and carries the file to display;
   * relationships is the archive model and carries the catalogued title and
   * type. The media-to-artifact bridge gives an artifact the media item's own
   * id, so the two are joined on it. Before 063 backfilled the relationships
   * these lists barely overlapped and the page showed them as separate
   * sections; afterwards that listed every photograph twice, once with a
   * thumbnail and once as a placeholder card.
   *
   * Merging also fixes the placeholders: a connected artifact had no image to
   * show until the media row was joined to it.
   */
  const personArtifacts = ((): Array<{
    id: string;
    title: string;
    typeName: string | null;
    subtitle: string | null;
    media: MediaItem | null;
  }> => {
    const byId = new Map<string, {
      id: string;
      title: string;
      typeName: string | null;
      subtitle: string | null;
      media: MediaItem | null;
    }>();

    for (const object of connectedArtifacts) {
      byId.set(object.object_id, {
        id: object.object_id,
        title: object.title,
        typeName: object.artifact_type_name,
        subtitle: object.artifact_type_name ?? object.relationship_type_name,
        media: null,
      });
    }

    for (const item of media) {
      const existing = byId.get(item.id);
      if (existing) {
        existing.media = item;
        continue;
      }
      // Linked as media but never bridged into the archive model. It still
      // belongs on this tab, so it is listed from what the media row knows.
      byId.set(item.id, {
        id: item.id,
        title: mediaDisplayName(item),
        typeName: null,
        subtitle: null,
        media: item,
      });
    }

    return [...byId.values()];
    // Derived inline rather than with useMemo: this sits below the
    // `if (!person) return null` guard above, so a hook here would change the
    // hook count between renders -- React's "Rendered more hooks than during
    // the previous render". The list is a few dozen items at most.
  })();

  const artifactCount = personArtifacts.length;
  const familyRoles = new Map<string, string>();
  childFamilies.forEach((rel) => {
    [rel.spouse1, rel.spouse2].forEach((p) => {
      if (p) familyRoles.set(p.id, 'Parent');
    });
  });
  parentFamilies.forEach((rel) => {
    const other = rel.role === 'spouse1' ? rel.spouse2 : rel.spouse1;
    if (other) familyRoles.set(other.id, 'Spouse');
    rel.children.forEach((c) => familyRoles.set(c.person_id, 'Child'));
  });

  // ─── Full render ───────────────────────────────────────────────────────────

  return (
    <AppShell navbar={<Navbar />}>
      <div className={styles.page}>
        <div className={styles.pageInner}>
        {/* ── Inline error banner ── */}
        {inlineError && (
          <div className={styles.errorBanner} role="alert">
            {inlineError}
          </div>
        )}

        {deleteConfirm && (
          <div className={styles.errorBanner} role="alert">
            <div className={styles.confirmDelete}>
              <span className={styles.confirmText}>Delete this person?</span>
              <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting}>Confirm Delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)} disabled={isDeleting}>Cancel</Button>
            </div>
          </div>
        )}

        <ArchiveObjectLayout
          breadcrumb={<><Link to="/people">People</Link> / Archive Profile</>}
          title={displayTitle}
          subtitle={[
            lifespanLabel(person.events),
            person.is_living === 1 ? 'Living' : 'Deceased',
            SEX_LABELS[person.sex],
            person.is_private === 1 ? 'Private' : null,
          ].filter(Boolean).join(' • ')}
          summary={person.notes}
          avatar={<span>{initialsFromName(displayTitle)}</span>}
          headerAction={(
            <Button variant="secondary" onClick={() => navigate('/')}>View in Tree</Button>
          )}
          stats={[
            { label: 'Artifacts', value: artifactCount },
            { label: 'Stories', value: connectedStories.length },
            { label: 'Events', value: timelineEvents.length },
            { label: 'Facts', value: attributes.length },
            { label: 'Collections', value: memberOf.length },
            { label: 'Families', value: relationships.length },
          ]}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'timeline', label: 'Timeline', count: timelineEvents.length },
            { id: 'artifacts', label: 'Artifacts', count: artifactCount },
            { id: 'stories', label: 'Stories', count: connectedStories.length },
            { id: 'collections', label: 'Collections', count: memberOf.length },
            { id: 'family', label: 'Family', count: relationships.length },
            { id: 'claims', label: 'Claims' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        >
          {activeTab === 'overview' && (
            <div className={styles.tabStack}>

            {/* ── Recent Artifacts ── */}
            <section className={styles.section} aria-labelledby="recent-artifacts-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="recent-artifacts-heading">
                  Recent Artifacts
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('artifacts')}>
                  View all
                </Button>
              </div>
              {/* Draws on the same merged list as the Artifacts tab, so the
                  overview cannot disagree with it -- and so these cards show
                  the photographs rather than a placeholder glyph. */}
              {connectedObjectsLoading || mediaLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : personArtifacts.length === 0 ? (
                <p className={styles.noInfo}>No artifacts connected yet. Use Actions → Connect Artifact.</p>
              ) : (
                <div className={styles.cardGrid}>
                  {personArtifacts.slice(0, 3).map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      href={`/artifacts/${artifact.id}`}
                      title={artifact.title}
                      subtitle={artifact.subtitle}
                      typeName={artifact.typeName}
                      /* The endpoint serves the generated thumbnail where one
                         exists and the original where it does not. No
                         thumbnail_url fallback: nothing in the backend has
                         ever populated that field. */
                      imageSrc={artifact.media ? `/api/v1/media/${artifact.media.id}/thumbnail` : null}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── Key Life Context ── */}
            <section className={styles.section} aria-labelledby="life-context-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="life-context-heading">
                  Key Life Context
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('timeline')}>
                  Timeline
                </Button>
              </div>
              {timelineEvents.length === 0 ? (
                <p className={styles.noInfo}>No events recorded.</p>
              ) : (
                <ol className={styles.eventsList} aria-label="Key life events">
                  {timelineEvents.slice(0, 3).map((event) => (
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
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

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
                  {person.names.map((name, index) => (
                    <li key={name.id ?? `${name.name_type}-${fullName(name)}-${index}`} className={styles.nameItem}>
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
          )}

          {activeTab === 'timeline' && (
            <div className={styles.tabStack}>
            {/* ── Events timeline ── */}
            <section className={styles.section} aria-labelledby="events-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="events-heading">
                  Events
                  {timelineEvents.length > 0 && (
                    <span className={styles.countBadge}>{timelineEvents.length}</span>
                  )}
                </h2>
              </div>

              {timelineEvents.length === 0 ? (
                <p className={styles.noInfo}>No events recorded.</p>
              ) : (
                <ol className={styles.eventsList} aria-label="Life events timeline">
                  {timelineEvents.map((event) => (
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

            {/* ── Facts & attributes ── */}
            {attributes.length > 0 && (
              <section className={styles.section} aria-labelledby="attributes-heading">
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle} id="attributes-heading">
                    Facts &amp; Attributes
                    <span className={styles.countBadge}>{attributes.length}</span>
                  </h2>
                </div>

                <div className={styles.infoGrid}>
                  {attributes.map((attribute) => (
                    <div key={attribute.id} className={styles.infoRow}>
                      <span className={styles.infoLabel}>
                        {formatEventType(attribute.event_type)}
                      </span>
                      <span className={styles.infoValue}>
                        {attribute.description || '—'}
                        {attribute.event_date && (
                          // Raw GEDCOM reads "BET 1985 AND 1992" on screen; the
                          // shared helper renders that span as "1985–1992" and
                          // carries the other qualifiers as "abt.", "bef." and
                          // so on.
                          <span className={styles.eventDate}>
                            {' · '}
                            {formatYear(attribute.event_date, attribute.event_date_qualifier) || attribute.event_date}
                          </span>
                        )}
                        {attribute.event_place && (
                          <span className={styles.eventPlace}> 📍 {attribute.event_place}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            </div>
          )}

          {activeTab === 'family' && (
            <div className={styles.tabStack}>
            {/* ── Relationships ── */}
            <section className={styles.section} aria-labelledby="relationships-heading">
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle} id="relationships-heading">
                  Relationships
                </h2>
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
            </div>
          )}

          {activeTab === 'artifacts' && (
            <div className={styles.tabStack}>
            {/* ── Artifacts ──
                One section, merged from person_media and the archive model.
                See personArtifacts above for why they are joined rather than
                listed separately. */}
            <section className={styles.section} aria-labelledby="artifacts-heading">
              <h2 className={styles.sectionTitle} id="artifacts-heading">
                Artifacts
                {personArtifacts.length > 0 && (
                  <span className={styles.countBadge}>{personArtifacts.length}</span>
                )}
              </h2>

              {mediaLoading || connectedObjectsLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : personArtifacts.length === 0 ? (
                <p className={styles.noInfo}>No artifacts connected to this person yet.</p>
              ) : (
                <div className={styles.cardGrid}>
                  {personArtifacts.map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      href={`/artifacts/${artifact.id}`}
                      title={artifact.title}
                      subtitle={artifact.subtitle}
                      typeName={artifact.typeName}
                      /* The endpoint serves the generated thumbnail where one
                         exists and the original where it does not. No
                         thumbnail_url fallback: nothing in the backend has
                         ever populated that field. */
                      imageSrc={artifact.media ? `/api/v1/media/${artifact.media.id}/thumbnail` : null}
                    />
                  ))}
                </div>
              )}
            </section>
            </div>
          )}

          {activeTab === 'stories' && (
            <section className={styles.section} aria-labelledby="stories-heading">
              <h2 className={styles.sectionTitle} id="stories-heading">
                Stories
                {connectedStories.length > 0 && (
                  <span className={styles.countBadge}>{connectedStories.length}</span>
                )}
              </h2>

              {connectedObjectsLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : connectedStories.length === 0 ? (
                <p className={styles.noInfo}>No stories connected to this person yet. Use Actions → Add Story.</p>
              ) : (
                <div className={styles.relPersonList}>
                  {connectedStories.map((story) => (
                    <Link
                      key={`${story.relationship_id}-${story.object_id}`}
                      to={`/stories/${story.object_id}`}
                      className={styles.relPersonLink}
                    >
                      {story.title}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'collections' && (
            <section className={styles.section} aria-labelledby="collections-heading">
              <h2 className={styles.sectionTitle} id="collections-heading">
                Collections
                {memberOf.length > 0 && <span className={styles.countBadge}>{memberOf.length}</span>}
              </h2>

              <ObjectCollections
                objectId={person.id}
                canEdit={canEdit}
                canDelete={canDelete}
                onChange={setMemberOf}
              />
            </section>
          )}

          {activeTab === 'claims' && (
            <section className={styles.section} aria-labelledby="claims-heading">
              <h2 className={styles.sectionTitle} id="claims-heading">Claims</h2>
              <p className={styles.noInfo}>Claim summaries for people are not wired into this page yet. Use the Actions menu to add or review claims as the claims UI is expanded.</p>
            </section>
          )}
        </ArchiveObjectLayout>
        </div>
      </div>

      <ActionDrawer
        open={drawerMode !== null}
        title={drawerMode === 'add-story' ? 'Add Story' : 'Connect Artifact'}
        description="This drawer establishes the shared Actions pattern. Searchable pickers will replace raw IDs in the next UI pass."
        onClose={() => setDrawerMode(null)}
      >
        {drawerMode === 'connect-artifact' ? (
          <div className={styles.drawerPlaceholder}>
            <p>Connect an artifact to {displayTitle} using the existing relationship engine.</p>
            <p className={styles.noInfo}>Next step: replace this placeholder with an artifact picker and relationship role selector.</p>
            <Button onClick={() => navigate('/artifacts')}>Browse Artifacts</Button>
          </div>
        ) : (
          <div className={styles.drawerPlaceholder}>
            <p>Preserve a memory, oral history, or explanation connected to {displayTitle}.</p>
            <p className={styles.noInfo}>Next step: launch a story editor with this person preselected as a connected subject.</p>
            <Button onClick={() => navigate('/stories')}>Open Stories</Button>
          </div>
        )}
      </ActionDrawer>

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
          fetchConnectedObjects();
        }}
      />
    </AppShell>
  );
};

export default PersonDetailPage;
