import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import PersonEditModal from '@/components/PersonEditModal/PersonEditModal';
import ActionDrawer from '@/components/archive-object/ActionDrawer';
import ArchiveObjectLayout, { type ConnectedGroup } from '@/components/archive-object/ArchiveObjectLayout';
import { type ContextActionItem } from '@/components/archive-object/ContextActionsMenu';
import { usePageActions } from '@/contexts/PageActionsContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useModal } from '@/components/modals/useModal';
import type { FamilySummary } from '@/types/genealogy';
import { getPersonDisplayName } from '@/utils/entityDisplay';
import { lifespanLabel } from '@/utils/personEvents';
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

interface MediaThumbProps {
  item: MediaItem;
}

const MediaThumb: React.FC<MediaThumbProps> = ({ item }) => {
  const [imgError, setImgError] = useState(false);
  const src = item.thumbnail_url ?? item.url ?? (item.id ? `/api/v1/media/${item.id}` : undefined);

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

  // ── Archive connections ──
  const [connectedObjects, setConnectedObjects] = useState<ConnectedObject[]>([]);
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
  const childFamilies = relationships.filter((r) => r.type === 'child_family');
  const parentFamilies = relationships.filter((r) => r.type === 'parent_family');

  const connectedArtifacts = connectedObjects.filter((o) => o.object_type === 'artifact');
  const connectedStories = connectedObjects.filter((o) => o.object_type === 'story');
  const connectedCollections = connectedObjects.filter((o) => o.object_type === 'collection');
  const connectedPlaces = connectedObjects.filter((o) => o.object_type === 'place');

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

  const familyConnections = [
    ...childFamilies.flatMap((rel) => [rel.spouse1, rel.spouse2].filter((p): p is PersonSummary => p !== null)),
    ...parentFamilies.flatMap((rel) => [rel.role === 'spouse1' ? rel.spouse2 : rel.spouse1].filter((p): p is PersonSummary => p !== null)),
    ...parentFamilies.flatMap((rel) =>
      rel.children
        .filter((c) => c.person_id !== id)
        .map((c) => ({ id: c.person_id, displayName: c.displayName, display_name: c.display_name, given_name: c.given_name, middle_name: c.middle_name, surname: c.surname }))),
  ];
  const uniqueFamilyConnections = Array.from(new Map(familyConnections.map((p) => [p.id, p])).values());
  const connectedGroups: ConnectedGroup[] = [
    {
      id: 'family',
      label: 'Family',
      items: uniqueFamilyConnections.slice(0, 8).map((p) => ({
        id: p.id,
        title: personName(p),
        subtitle: familyRoles.get(p.id) ?? 'Family relationship',
        href: `/people/${p.id}`,
        initials: initialsFromName(personName(p)),
      })),
    },
    {
      id: 'collections',
      label: 'Collections',
      items: connectedCollections.slice(0, 6).map((o) => ({
        id: o.object_id,
        title: o.title,
        subtitle: o.relationship_type_name,
        href: `/collections/${o.object_id}`,
        initials: '★',
      })),
    },
    {
      id: 'places',
      label: 'Places',
      items: connectedPlaces.slice(0, 6).map((o) => ({
        id: o.object_id,
        title: o.title,
        subtitle: o.relationship_type_name,
        href: `/places/${o.object_id}`,
        initials: '⌂',
      })),
    },
    {
      id: 'artifacts',
      label: 'Artifacts',
      items: connectedArtifacts.slice(0, 8).map((artifact) => ({
        id: artifact.object_id,
        title: artifact.title,
        subtitle: artifact.artifact_type_name ?? artifact.relationship_type_name,
        href: `/artifacts/${artifact.object_id}`,
        initials: 'A',
      })),
    },
  ].filter((group) => group.items.length > 0);
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
            { label: 'Artifacts', value: connectedArtifacts.length },
            { label: 'Stories', value: connectedStories.length },
            { label: 'Events', value: sortedEventsList.length },
            { label: 'Collections', value: connectedCollections.length },
            { label: 'Families', value: relationships.length },
          ]}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'timeline', label: 'Timeline', count: sortedEventsList.length },
            { id: 'artifacts', label: 'Artifacts', count: connectedArtifacts.length + media.length },
            { id: 'stories', label: 'Stories', count: connectedStories.length },
            { id: 'family', label: 'Family', count: relationships.length },
            { id: 'claims', label: 'Claims' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          connectedGroups={connectedGroups}
        >
          {activeTab === 'overview' && (
            <div className={styles.tabStack}>

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

            {/* ── Connected Artifacts ── */}
            <section className={styles.section} aria-labelledby="connected-artifacts-heading">
              <h2 className={styles.sectionTitle} id="connected-artifacts-heading">
                Connected Artifacts
                {connectedArtifacts.length > 0 && (
                  <span className={styles.countBadge}>{connectedArtifacts.length}</span>
                )}
              </h2>

              {connectedObjectsLoading ? (
                <div className={styles.skeletonLine} aria-hidden="true" />
              ) : connectedArtifacts.length === 0 ? (
                <p className={styles.noInfo}>No artifacts connected to this person yet.</p>
              ) : (
                <div className={styles.relPersonList}>
                  {connectedArtifacts.map((artifact) => (
                    <Link
                      key={`${artifact.relationship_id}-${artifact.object_id}`}
                      to={`/artifacts/${artifact.object_id}`}
                      className={styles.relPersonLink}
                    >
                      {artifact.title}
                      {artifact.artifact_type_name ? ` (${artifact.artifact_type_name})` : ''}
                    </Link>
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
