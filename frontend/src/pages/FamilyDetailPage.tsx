import React, { FormEvent, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import ArchiveObjectLayout, { type ConnectedGroup } from '@/components/archive-object/ArchiveObjectLayout';
import ActionDrawer from '@/components/archive-object/ActionDrawer';
import { type ContextActionItem } from '@/components/archive-object/ContextActionsMenu';
import { usePageActions } from '@/contexts/PageActionsContext';
import { usePermissions } from '@/hooks/usePermissions';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import { getPersonDisplayName } from '@/utils/entityDisplay';
import archiveStyles from '@/components/archive-object/ArchiveDetailPage.module.css';
import styles from './FamilyDetailPage.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonSummary {
  id: string;
  displayName?: string | null;
  display_name?: string | null;
  given_name: string | null;
  middle_name?: string | null;
  surname: string | null;
}

interface PersonWithNames {
  id: string;
  displayName?: string | null;
  display_name?: string | null;
  primary_name?: { given_name: string | null; middle_name?: string | null; surname: string | null } | null;
}

interface ChildMember {
  id: string;
  person_id: string;
  role: 'child' | 'adopted' | 'foster' | 'step';
  person: PersonWithNames | undefined;
}

interface FamilyEvent {
  id: string;
  event_type: string;
  event_date: string | null;
  event_place: string | null;
  description: string | null;
}

interface FamilyDetail {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  marriage_date: string | null;
  marriage_place: string | null;
  divorce_date: string | null;
  divorce_place: string | null;
  spouse1: PersonSummary | null;
  spouse2: PersonSummary | null;
  children: ChildMember[];
  events: FamilyEvent[];
}

interface EditForm {
  marriage_date: string;
  marriage_place: string;
  divorce_date: string;
  divorce_place: string;
}

type PersonLike = { displayName?: string | null; display_name?: string | null; given_name: string | null; middle_name?: string | null; surname: string | null };

const ROLE_LABELS: Record<ChildMember['role'], string> = {
  child: 'Biological',
  adopted: 'Adopted',
  foster: 'Foster',
  step: 'Step',
};

const ROLE_CSS: Record<ChildMember['role'], string> = {
  child: styles.roleChild,
  adopted: styles.roleAdopted,
  foster: styles.roleFoster,
  step: styles.roleStep,
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  marriage: 'Marriage',
  divorce: 'Divorce',
  residence: 'Residence',
  custom: 'Event',
};

function formatEventType(type: string): string {
  return EVENT_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortEvents(events: FamilyEvent[]): FamilyEvent[] {
  return [...events].sort((a, b) => {
    if (a.event_date && b.event_date) return a.event_date.localeCompare(b.event_date);
    if (a.event_date) return -1;
    if (b.event_date) return 1;
    return 0;
  });
}

function personName(p: PersonLike | null): string {
  if (!p) return 'Unknown';
  return getPersonDisplayName(p);
}

function childName(child: ChildMember): string {
  if (!child.person) return 'Unknown';
  return getPersonDisplayName({
    displayName: child.person.displayName,
    display_name: child.person.display_name,
    given_name: child.person.primary_name?.given_name ?? null,
    middle_name: child.person.primary_name?.middle_name ?? null,
    surname: child.person.primary_name?.surname ?? null,
  });
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '');
}

function familyHeading(family: FamilyDetail): string {
  const p1 = personName(family.spouse1);
  const p2 = personName(family.spouse2);
  if (family.spouse1 && family.spouse2) return `${p1} + ${p2}`;
  if (family.spouse1 || family.spouse2) return p1 !== 'Unknown' ? p1 : p2;
  return 'Family Union';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AvatarStackProps {
  spouse1: PersonSummary | null;
  spouse2: PersonSummary | null;
}

const AvatarStack: React.FC<AvatarStackProps> = ({ spouse1, spouse2 }) => (
  <div className={styles.avatarStack} aria-label="Family union avatar">
    <div className={styles.avatarOne}>{spouse1 ? initialsFromName(personName(spouse1)) : '?'}</div>
    <div className={styles.avatarTwo}>{spouse2 ? initialsFromName(personName(spouse2)) : '?'}</div>
    <div className={styles.unionBadge}>Union</div>
  </div>
);

interface PersonCardProps {
  person: PersonLike & { id: string };
  subtitle: string;
}

const PersonCard: React.FC<PersonCardProps> = ({ person, subtitle }) => (
  <Link to={`/people/${person.id}`} className={styles.personCard}>
    <div className={styles.personHead}>
      <span className={styles.miniAvatar}>{initialsFromName(personName(person))}</span>
      <div className={styles.personMeta}>
        <strong>{personName(person)}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  </Link>
);

interface InfoRowProps {
  label: string;
  value: string | null;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div className={archiveStyles.infoRow}>
    <span>{label}</span>
    <strong>{value || '—'}</strong>
  </div>
);

// ─── Main page ─────────────────────────────────────────────────────────────────

const FamilyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canCreate, canEdit, canDelete } = usePermissions();

  const [family, setFamily] = useState<FamilyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    marriage_date: '',
    marriage_place: '',
    divorce_date: '',
    divorce_place: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [drawerMode, setDrawerMode] = useState<'add-child' | 'add-event' | 'connect-person' | 'connect-artifact' | 'add-story' | 'add-claim' | null>(null);
  const [childPerson, setChildPerson] = useState<PersonResult | null>(null);
  const [childRole, setChildRole] = useState<ChildMember['role']>('child');
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);

  const [eventForm, setEventForm] = useState({ event_type: 'residence', event_date: '', event_place: '', description: '' });
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  const fetchFamily = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/v1/families/${id}`, { credentials: 'include' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load family (${res.status})`);
      }
      const data: FamilyDetail = await res.json();
      setFamily(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load family');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchFamily();
  }, [fetchFamily]);

  const handleAssignSpouse = async (slot: 'spouse1' | 'spouse2', personId: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/families/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [slot === 'spouse1' ? 'spouse1_id' : 'spouse2_id']: personId }),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        setError(errData.message ?? `Failed to assign spouse (${res.status})`);
        return;
      }
      await fetchFamily();
    } catch {
      setError('Failed to assign spouse');
    }
  };

  const openEdit = () => {
    if (!family) return;
    setEditForm({
      marriage_date: family.marriage_date ?? '',
      marriage_place: family.marriage_place ?? '',
      divorce_date: family.divorce_date ?? '',
      divorce_place: family.divorce_place ?? '',
    });
    setSaveError(null);
    setEditMode(true);
    setActiveTab('overview');
  };

  const cancelEdit = () => {
    setEditMode(false);
    setSaveError(null);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !family) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const body = {
        marriage_date: editForm.marriage_date || null,
        marriage_place: editForm.marriage_place || null,
        divorce_date: editForm.divorce_date || null,
        divorce_place: editForm.divorce_place || null,
      };
      const res = await fetch(`/api/v1/families/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to save (${res.status})`);
      }
      const updated: FamilyDetail = await res.json();
      setFamily(updated);
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveChild = async (personId: string, name: string) => {
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`/api/v1/families/${id}/members/${personId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to remove ${name} (${res.status})`);
      }
      setFamily((prev) =>
        prev ? { ...prev, children: prev.children.filter((c) => c.person_id !== personId) } : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove child');
    }
  };

  const handleAddChild = async () => {
    if (!id || !childPerson) return;
    setIsAddingChild(true);
    setChildError(null);
    try {
      const res = await fetch(`/api/v1/families/${id}/members`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: childPerson.id, role: childRole }),
      });
      if (!res.ok) {
        const errData: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Failed to add child');
      }
      setChildPerson(null);
      setChildRole('child');
      setDrawerMode(null);
      await fetchFamily();
    } catch (err) {
      setChildError(err instanceof Error ? err.message : 'Failed to add child');
    } finally {
      setIsAddingChild(false);
    }
  };

  const handleAddEvent = async () => {
    if (!id) return;
    setIsAddingEvent(true);
    setEventError(null);
    try {
      const res = await fetch('/api/v1/events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          family_id: id,
          event_type: eventForm.event_type,
          event_date: eventForm.event_date.trim() || null,
          event_place: eventForm.event_place.trim() || null,
          description: eventForm.description.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to add event');
      setEventForm({ event_type: 'residence', event_date: '', event_place: '', description: '' });
      setDrawerMode(null);
      await fetchFamily();
    } catch (err) {
      setEventError(err instanceof Error ? err.message : 'Failed to add event');
    } finally {
      setIsAddingEvent(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/families/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to delete family (${res.status})`);
      }
      navigate('/families', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete family');
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  };

  // ─── Context actions (registered in the global topbar Actions menu) ───────

  const bothSlotsFilled = Boolean(family?.spouse1 && family?.spouse2);

  const contextActions: ContextActionItem[] = [
    {
      id: 'add-partner',
      label: 'Add Partner',
      description: 'Add or connect a partner in this union',
      disabled: !canCreate || bothSlotsFilled,
      onSelect: () => setActiveTab('people'),
    },
    {
      id: 'add-child',
      label: 'Add Child',
      description: 'Add biological, adopted, foster, or step child',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('add-child'),
    },
    {
      id: 'connect-person',
      label: 'Connect Person',
      description: 'Witness, household member, guardian...',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('connect-person'),
    },
    {
      id: 'connect-artifact',
      label: 'Connect Artifact',
      description: 'Link photos, letters, records, objects',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('connect-artifact'),
    },
    {
      id: 'add-event',
      label: 'Add Event',
      description: 'Marriage, residence, reunion, move...',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('add-event'),
    },
    {
      id: 'add-story',
      label: 'Add Story',
      description: 'Preserve family memory',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('add-story'),
    },
    {
      id: 'add-claim',
      label: 'Add Claim',
      description: 'Track evidence and confidence',
      disabled: !canCreate,
      onSelect: () => setDrawerMode('add-claim'),
    },
    {
      id: 'view-tree',
      label: 'View in Tree',
      description: 'Open the tree workspace',
      group: 'manage',
      onSelect: () => navigate('/'),
    },
    {
      id: 'edit-family',
      label: 'Edit Family',
      description: 'Dates, places, notes, privacy',
      group: 'manage',
      disabled: !canEdit,
      onSelect: openEdit,
    },
    {
      id: 'delete-family',
      label: 'Delete Family',
      description: 'Remove this family record',
      group: 'manage',
      danger: true,
      disabled: !canDelete,
      onSelect: () => setDeleteConfirm(true),
    },
  ];

  usePageActions(family ? `Actions for ${familyHeading(family)}` : '', family ? contextActions : []);

  // --- Loading state ---
  if (isLoading) {
    return (
      <AppShell navbar={<Navbar />}>
        <div className={archiveStyles.page}>
          <div className={archiveStyles.pageInner}>
            <div className={archiveStyles.centered} aria-busy="true" aria-label="Loading family…">
              Loading family…
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // --- 404 state ---
  if (notFound) {
    return (
      <AppShell navbar={<Navbar />}>
        <div className={archiveStyles.page}>
          <div className={archiveStyles.pageInner}>
            <div className={archiveStyles.centered}>
              <h2>Family not found</h2>
              <p>This family record does not exist or has been deleted.</p>
              <Button variant="primary" size="sm" onClick={() => navigate('/families')}>
                Back to Families
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // --- Error state (initial load failure) ---
  if (error && !family) {
    return (
      <AppShell navbar={<Navbar />}>
        <div className={archiveStyles.page}>
          <div className={archiveStyles.pageInner}>
            <div className={archiveStyles.centered}>
              <h2>Something went wrong</h2>
              <p>{error}</p>
              <Button variant="primary" size="sm" onClick={fetchFamily}>
                Try again
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!family) return null;

  const sortedEvents = sortEvents(family.events ?? []);
  const childCount = family.children.length;

  const subtitleParts = [
    family.marriage_date ? `Married ${family.marriage_date}` : null,
    family.marriage_place,
    `${childCount} ${childCount === 1 ? 'child' : 'children'}`,
  ].filter(Boolean);

  const connectedGroups: ConnectedGroup[] = [
    {
      id: 'partners',
      label: 'Partners',
      items: [family.spouse1, family.spouse2]
        .filter((p): p is PersonSummary => p !== null)
        .map((p) => ({
          id: p.id,
          title: personName(p),
          subtitle: 'Partner',
          href: `/people/${p.id}`,
          initials: initialsFromName(personName(p)),
        })),
    },
    {
      id: 'children',
      label: 'Children',
      items: family.children.slice(0, 8).map((c) => ({
        id: c.person_id,
        title: childName(c),
        subtitle: ROLE_LABELS[c.role],
        href: `/people/${c.person_id}`,
        initials: initialsFromName(childName(c)),
      })),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <AppShell navbar={<Navbar />}>
      <div className={archiveStyles.page}>
        <div className={archiveStyles.pageInner}>

          {error && (
            <div className={archiveStyles.errorBanner} role="alert">
              {error}
            </div>
          )}

          {deleteConfirm && (
            <div className={archiveStyles.errorBanner} role="alert">
              <span>Delete this family? </span>
              <Button variant="danger" size="sm" onClick={handleDelete} loading={isDeleting}>Confirm Delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)} disabled={isDeleting}>Cancel</Button>
            </div>
          )}

          <ArchiveObjectLayout
            breadcrumb={<><Link to="/families">Families</Link> / Family Union Profile</>}
            title={familyHeading(family)}
            subtitle={subtitleParts.join(' • ')}
            summary="A family union profile collects the people, events, places, artifacts, stories, and claims tied to a family unit."
            avatar={<AvatarStack spouse1={family.spouse1} spouse2={family.spouse2} />}
            headerAction={(
              <Button variant="secondary" onClick={() => navigate('/')}>View in Tree</Button>
            )}
            stats={[
              { label: 'Partners', value: [family.spouse1, family.spouse2].filter(Boolean).length },
              { label: 'Children', value: childCount },
              { label: 'Artifacts', value: 0 },
              { label: 'Stories', value: 0 },
              { label: 'Events', value: sortedEvents.length },
              { label: 'Claims', value: 0 },
            ]}
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'people', label: 'People', count: [family.spouse1, family.spouse2].filter(Boolean).length + childCount },
              { id: 'timeline', label: 'Timeline', count: sortedEvents.length },
              { id: 'artifacts', label: 'Artifacts' },
              { id: 'stories', label: 'Stories' },
              { id: 'claims', label: 'Claims' },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            connectedGroups={connectedGroups}
          >
            {activeTab === 'overview' && (
              <div className={archiveStyles.tabStack}>
                <section className={archiveStyles.section} aria-labelledby="family-summary-heading">
                  <div className={archiveStyles.sectionHeader}>
                    <h2 className={archiveStyles.sectionTitle} id="family-summary-heading">Family Summary</h2>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('people')}>View people</Button>
                  </div>
                  <div className={styles.personGrid}>
                    {[family.spouse1, family.spouse2].filter((p): p is PersonSummary => p !== null).map((p) => (
                      <PersonCard key={p.id} person={p} subtitle="Partner" />
                    ))}
                    {family.children.slice(0, 4).map((c) => (
                      c.person ? (
                        <PersonCard
                          key={c.id}
                          person={{ id: c.person_id, displayName: c.person.displayName, display_name: c.person.display_name, given_name: c.person.primary_name?.given_name ?? null, middle_name: c.person.primary_name?.middle_name ?? null, surname: c.person.primary_name?.surname ?? null }}
                          subtitle={`Child • ${ROLE_LABELS[c.role].toLowerCase()}`}
                        />
                      ) : null
                    ))}
                  </div>
                </section>

                {editMode ? (
                  <form className={archiveStyles.section} onSubmit={handleSave}>
                    <div className={archiveStyles.sectionHeader}>
                      <h2 className={archiveStyles.sectionTitle}>Edit Family</h2>
                    </div>
                    <div className={archiveStyles.formGrid}>
                      <label className={archiveStyles.field}>
                        <span>Marriage Date</span>
                        <Input value={editForm.marriage_date} onChange={(e) => setEditForm((f) => ({ ...f, marriage_date: e.target.value }))} placeholder="e.g. 15 Jun 1990" />
                      </label>
                      <label className={archiveStyles.field}>
                        <span>Marriage Place</span>
                        <Input value={editForm.marriage_place} onChange={(e) => setEditForm((f) => ({ ...f, marriage_place: e.target.value }))} placeholder="e.g. London, England" />
                      </label>
                      <label className={archiveStyles.field}>
                        <span>Divorce Date</span>
                        <Input value={editForm.divorce_date} onChange={(e) => setEditForm((f) => ({ ...f, divorce_date: e.target.value }))} placeholder="e.g. 2 Mar 2005" />
                      </label>
                      <label className={archiveStyles.field}>
                        <span>Divorce Place</span>
                        <Input value={editForm.divorce_place} onChange={(e) => setEditForm((f) => ({ ...f, divorce_place: e.target.value }))} placeholder="e.g. Manchester, England" />
                      </label>
                    </div>
                    {saveError && <div className={archiveStyles.errorBanner} role="alert">{saveError}</div>}
                    <div className={archiveStyles.formActions}>
                      <Button variant="ghost" type="button" onClick={cancelEdit} disabled={isSaving}>Cancel</Button>
                      <Button type="submit" loading={isSaving}>Save Family</Button>
                    </div>
                  </form>
                ) : (
                  <section className={archiveStyles.section} aria-labelledby="marriage-info-heading">
                    <div className={archiveStyles.sectionHeader}>
                      <h2 className={archiveStyles.sectionTitle} id="marriage-info-heading">Marriage &amp; Divorce</h2>
                    </div>
                    <div className={archiveStyles.infoGrid}>
                      <InfoRow label="Marriage Date" value={family.marriage_date} />
                      <InfoRow label="Marriage Place" value={family.marriage_place} />
                      <InfoRow label="Divorce Date" value={family.divorce_date} />
                      <InfoRow label="Divorce Place" value={family.divorce_place} />
                    </div>
                  </section>
                )}

                <section className={archiveStyles.section} aria-labelledby="recent-archive-heading">
                  <div className={archiveStyles.sectionHeader}>
                    <h2 className={archiveStyles.sectionTitle} id="recent-archive-heading">Recent Archive Context</h2>
                  </div>
                  <p className={archiveStyles.muted}>
                    Family-level artifact and story connections aren&rsquo;t wired into the backend yet. Use the Actions menu to preview the planned flow.
                  </p>
                </section>
              </div>
            )}

            {activeTab === 'people' && (
              <section className={archiveStyles.section} aria-labelledby="people-heading">
                <div className={archiveStyles.sectionHeader}>
                  <h2 className={archiveStyles.sectionTitle} id="people-heading">People in this Family</h2>
                </div>

                <h3 className={styles.groupLabel}>Partners</h3>
                <div className={styles.personGrid}>
                  {family.spouse1 ? (
                    <PersonCard person={family.spouse1} subtitle="Partner • spouse" />
                  ) : canEdit ? (
                    <div className={`${styles.personCard} ${styles.personCardEmpty}`}>
                      <PersonPicker label="Spouse 1" onSelect={(p: PersonResult) => void handleAssignSpouse('spouse1', p.id)} />
                    </div>
                  ) : (
                    <div className={`${styles.personCard} ${styles.personCardEmpty}`}>
                      <span className={archiveStyles.muted}>Spouse 1 not recorded</span>
                    </div>
                  )}
                  {family.spouse2 ? (
                    <PersonCard person={family.spouse2} subtitle="Partner • spouse" />
                  ) : canEdit ? (
                    <div className={`${styles.personCard} ${styles.personCardEmpty}`}>
                      <PersonPicker label="Spouse 2" onSelect={(p: PersonResult) => void handleAssignSpouse('spouse2', p.id)} />
                    </div>
                  ) : (
                    <div className={`${styles.personCard} ${styles.personCardEmpty}`}>
                      <span className={archiveStyles.muted}>Spouse 2 not recorded</span>
                    </div>
                  )}
                </div>

                <h3 className={styles.groupLabel}>Children{childCount > 0 ? ` (${childCount})` : ''}</h3>
                {childCount === 0 ? (
                  <p className={archiveStyles.muted}>No children recorded for this family.</p>
                ) : (
                  <div className={styles.personGrid}>
                    {family.children.map((c) => (
                      <div key={c.id} className={styles.personCard}>
                        <Link to={`/people/${c.person_id}`} className={styles.personHead} style={{ textDecoration: 'none', color: 'inherit' }}>
                          <span className={styles.miniAvatar}>{initialsFromName(childName(c))}</span>
                          <div className={styles.personMeta}>
                            <strong>{childName(c)}</strong>
                            <span className={`${styles.roleBadge} ${ROLE_CSS[c.role]}`}>{ROLE_LABELS[c.role]}</span>
                          </div>
                        </Link>
                        {canDelete && (
                          <button className={styles.removeBtn} onClick={() => handleRemoveChild(c.person_id, childName(c))}>
                            Remove from family
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'timeline' && (
              <section className={archiveStyles.section} aria-labelledby="timeline-heading">
                <div className={archiveStyles.sectionHeader}>
                  <h2 className={archiveStyles.sectionTitle} id="timeline-heading">Family Timeline</h2>
                </div>
                {sortedEvents.length === 0 ? (
                  <p className={archiveStyles.muted}>No events recorded for this family.</p>
                ) : (
                  <div className={archiveStyles.tabStack}>
                    {sortedEvents.map((event) => (
                      <div key={event.id} className={archiveStyles.section}>
                        <div className={archiveStyles.sectionHeader}>
                          <strong>{formatEventType(event.event_type)}</strong>
                          {event.event_date && <span className={archiveStyles.muted}>{event.event_date}</span>}
                        </div>
                        {event.event_place && <p className={archiveStyles.muted}>📍 {event.event_place}</p>}
                        {event.description && <p className={archiveStyles.muted}>{event.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'artifacts' && (
              <section className={archiveStyles.section} aria-labelledby="artifacts-heading">
                <h2 className={archiveStyles.sectionTitle} id="artifacts-heading">Connected Artifacts</h2>
                <p className={archiveStyles.muted}>Family-level artifact connections aren&rsquo;t wired into this page yet. Use the Actions menu to preview the planned flow.</p>
              </section>
            )}

            {activeTab === 'stories' && (
              <section className={archiveStyles.section} aria-labelledby="stories-heading">
                <h2 className={archiveStyles.sectionTitle} id="stories-heading">Family Stories</h2>
                <p className={archiveStyles.muted}>Family-level stories aren&rsquo;t wired into this page yet. Use the Actions menu to preview the planned flow.</p>
              </section>
            )}

            {activeTab === 'claims' && (
              <section className={archiveStyles.section} aria-labelledby="claims-heading">
                <h2 className={archiveStyles.sectionTitle} id="claims-heading">Claims and Evidence</h2>
                <p className={archiveStyles.muted}>Claim summaries for families aren&rsquo;t wired into this page yet. Use the Actions menu to add or review claims as the claims UI is expanded.</p>
              </section>
            )}
          </ArchiveObjectLayout>
        </div>
      </div>

      <ActionDrawer
        open={drawerMode === 'add-child'}
        title="Add Child"
        description="Add a child and classify the child relationship."
        onClose={() => setDrawerMode(null)}
      >
        <div className={archiveStyles.field}>
          <span>Child</span>
          <PersonPicker value={childPerson?.id ?? null} onSelect={setChildPerson} onClear={() => setChildPerson(null)} />
        </div>
        <label className={archiveStyles.field}>
          <span>Relationship</span>
          <select value={childRole} onChange={(e) => setChildRole(e.target.value as ChildMember['role'])}>
            <option value="child">Biological child</option>
            <option value="adopted">Adopted child</option>
            <option value="foster">Foster child</option>
            <option value="step">Step child</option>
          </select>
        </label>
        {childError && <div className={archiveStyles.errorBanner} role="alert">{childError}</div>}
        <div className={archiveStyles.formActions}>
          <Button onClick={handleAddChild} loading={isAddingChild} disabled={!childPerson}>Save</Button>
        </div>
      </ActionDrawer>

      <ActionDrawer
        open={drawerMode === 'add-event'}
        title="Add Event"
        description="Add a family-level event such as marriage, residence, reunion, or move."
        onClose={() => setDrawerMode(null)}
      >
        <label className={archiveStyles.field}>
          <span>Type</span>
          <select value={eventForm.event_type} onChange={(e) => setEventForm({ ...eventForm, event_type: e.target.value })}>
            <option value="residence">Residence</option>
            <option value="marriage">Marriage</option>
            <option value="divorce">Divorce</option>
            <option value="custom">Other (reunion, move, custom)</option>
          </select>
        </label>
        <label className={archiveStyles.field}>
          <span>Date</span>
          <Input value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} placeholder="e.g. ABT 1962" />
        </label>
        <label className={archiveStyles.field}>
          <span>Place</span>
          <Input value={eventForm.event_place} onChange={(e) => setEventForm({ ...eventForm, event_place: e.target.value })} placeholder="e.g. 12 Maple Street" />
        </label>
        <label className={archiveStyles.field}>
          <span>Description</span>
          <textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} rows={3} />
        </label>
        {eventError && <div className={archiveStyles.errorBanner} role="alert">{eventError}</div>}
        <div className={archiveStyles.formActions}>
          <Button onClick={handleAddEvent} loading={isAddingEvent}>Save Event</Button>
        </div>
      </ActionDrawer>

      <ActionDrawer
        open={drawerMode === 'connect-person'}
        title="Connect Person"
        description="Witnesses, household members, and guardians aren't wired into the backend yet."
        onClose={() => setDrawerMode(null)}
      >
        <p className={archiveStyles.muted}>Next step: extend family membership roles beyond partner/child to support witnesses, household members, and guardians.</p>
        <Button onClick={() => navigate('/people')}>Browse People</Button>
      </ActionDrawer>

      <ActionDrawer
        open={drawerMode === 'connect-artifact'}
        title="Connect Artifact"
        description="Family-level artifact connections aren't wired into the backend yet."
        onClose={() => setDrawerMode(null)}
      >
        <p className={archiveStyles.muted}>Next step: allow relationships to reference a family union the same way they reference people and artifacts today.</p>
        <Button onClick={() => navigate('/artifacts')}>Browse Artifacts</Button>
      </ActionDrawer>

      <ActionDrawer
        open={drawerMode === 'add-story'}
        title="Add Story"
        description="Family-level stories aren't wired into the backend yet."
        onClose={() => setDrawerMode(null)}
      >
        <p className={archiveStyles.muted}>Next step: launch a story editor with this family union preselected as a connected subject.</p>
        <Button onClick={() => navigate('/stories')}>Open Stories</Button>
      </ActionDrawer>

      <ActionDrawer
        open={drawerMode === 'add-claim'}
        title="Add Claim"
        description="Family-level claims aren't wired into the backend yet."
        onClose={() => setDrawerMode(null)}
      >
        <p className={archiveStyles.muted}>Next step: let claims cite a family union as their subject, alongside people and artifacts.</p>
        <Button onClick={() => navigate('/claims')}>Open Claims</Button>
      </ActionDrawer>
    </AppShell>
  );
};

export default FamilyDetailPage;
