import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import Select from '@/components/Form/Select';
import { usePermissions } from '@/hooks/usePermissions';
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
  surname: string | null;
  suffix: string | null;
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
  created_at: string;
  names: PersonName[];
  events: PersonEvent[];
}

interface PersonSummary {
  id: string;
  given_name: string | null;
  surname: string | null;
}

interface ChildMember {
  id: string;
  person_id: string;
  given_name: string | null;
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

interface EditBasicForm {
  sex: SexType;
  is_living: '0' | '1';
  is_private: '0' | '1';
  notes: string;
}

interface AddNameForm {
  name_type: NameType;
  given_name: string;
  surname: string;
  prefix: string;
  suffix: string;
  is_primary: boolean;
}

interface EditNameForm {
  name_type: NameType;
  given_name: string;
  surname: string;
  prefix: string;
  suffix: string;
  is_primary: boolean;
}

interface EventForm {
  event_type: string;
  event_date: string;
  event_place: string;
  description: string;
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

const DEFAULT_ADD_NAME_FORM: AddNameForm = {
  name_type: 'birth',
  given_name: '',
  surname: '',
  prefix: '',
  suffix: '',
  is_primary: false,
};

const DEFAULT_EDIT_NAME_FORM: EditNameForm = {
  name_type: 'birth',
  given_name: '',
  surname: '',
  prefix: '',
  suffix: '',
  is_primary: false,
};

const DEFAULT_EVENT_FORM: EventForm = {
  event_type: 'birth',
  event_date: '',
  event_place: '',
  description: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function personName(p: { given_name: string | null; surname: string | null } | null): string {
  if (!p) return 'Unknown';
  const parts = [p.given_name, p.surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

function fullName(name: PersonName): string {
  const parts = [name.prefix, name.given_name, name.surname, name.suffix].filter(Boolean);
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
  const { canEdit, canDelete } = usePermissions();

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

  // ── Edit basic info ──
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditBasicForm>({
    sex: 'U',
    is_living: '0',
    is_private: '0',
    notes: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Delete ──
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Add name ──
  const [showAddName, setShowAddName] = useState(false);
  const [addNameForm, setAddNameForm] = useState<AddNameForm>(DEFAULT_ADD_NAME_FORM);
  const [isAddingName, setIsAddingName] = useState(false);
  const [addNameError, setAddNameError] = useState<string | null>(null);

  // ── Inline post-load error ──
  const [inlineError, setInlineError] = useState<string | null>(null);

  // ── Edit name inline ──
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameForm, setEditNameForm] = useState<EditNameForm>(DEFAULT_EDIT_NAME_FORM);
  const [isSavingName, setIsSavingName] = useState(false);
  const [editNameError, setEditNameError] = useState<string | null>(null);

  // ── Event management ──
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEventForm, setEditEventForm] = useState<EventForm>(DEFAULT_EVENT_FORM);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [editEventError, setEditEventError] = useState<string | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [addEventForm, setAddEventForm] = useState<EventForm>(DEFAULT_EVENT_FORM);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [addEventError, setAddEventError] = useState<string | null>(null);

  // ── Home person ──
  const [isSettingHome, setIsSettingHome] = useState(false);
  const [homeSetSuccess, setHomeSetSuccess] = useState(false);

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

  // ─── Edit handlers ─────────────────────────────────────────────────────────

  const openEdit = () => {
    if (!person) return;
    setEditForm({
      sex: person.sex,
      is_living: String(person.is_living) as '0' | '1',
      is_private: String(person.is_private) as '0' | '1',
      notes: person.notes ?? '',
    });
    setSaveError(null);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!id || !person) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const body = {
        sex: editForm.sex,
        is_living: Number(editForm.is_living),
        is_private: Number(editForm.is_private),
        notes: editForm.notes || null,
      };
      const res = await fetch(`/api/v1/people/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to save (${res.status})`);
      }
      const updated: PersonDetail = await res.json();
      setPerson(updated);
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

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

  // ─── Name handlers ─────────────────────────────────────────────────────────

  const handleDeleteName = async (nameId: string) => {
    if (!id) return;
    setInlineError(null);
    try {
      const res = await fetch(`/api/v1/people/${id}/names/${nameId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete name (${res.status})`);
      setPerson((prev) =>
        prev ? { ...prev, names: prev.names.filter((n) => n.id !== nameId) } : prev,
      );
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to delete name');
    }
  };

  const handleAddName = async () => {
    if (!id) return;
    setIsAddingName(true);
    setAddNameError(null);
    try {
      const body = {
        name_type: addNameForm.name_type,
        given_name: addNameForm.given_name || null,
        surname: addNameForm.surname || null,
        prefix: addNameForm.prefix || null,
        suffix: addNameForm.suffix || null,
        is_primary: addNameForm.is_primary ? 1 : 0,
      };
      const res = await fetch(`/api/v1/people/${id}/names`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to add name (${res.status})`);
      }
      // Refresh person data so all name fields (including new ID) come from server
      await fetchPerson();
      setShowAddName(false);
      setAddNameForm(DEFAULT_ADD_NAME_FORM);
    } catch (err) {
      setAddNameError(err instanceof Error ? err.message : 'Failed to add name');
    } finally {
      setIsAddingName(false);
    }
  };

  const cancelAddName = () => {
    setShowAddName(false);
    setAddNameError(null);
    setAddNameForm(DEFAULT_ADD_NAME_FORM);
  };

  // ─── Name edit handlers ─────────────────────────────────────────────────

  const openEditName = (name: PersonName) => {
    setEditingNameId(name.id);
    setEditNameForm({
      name_type: name.name_type,
      given_name: name.given_name ?? '',
      surname: name.surname ?? '',
      prefix: name.prefix ?? '',
      suffix: name.suffix ?? '',
      is_primary: name.is_primary === 1,
    });
    setEditNameError(null);
  };

  const cancelEditName = () => {
    setEditingNameId(null);
    setEditNameError(null);
  };

  const handleSaveName = async (nameId: string) => {
    if (!id) return;
    setIsSavingName(true);
    setEditNameError(null);
    try {
      const body = {
        name_type: editNameForm.name_type,
        given_name: editNameForm.given_name || null,
        surname: editNameForm.surname || null,
        prefix: editNameForm.prefix || null,
        suffix: editNameForm.suffix || null,
        is_primary: editNameForm.is_primary ? 1 : 0,
      };
      const res = await fetch(`/api/v1/people/${id}/names/${nameId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to save name (${res.status})`);
      }
      await fetchPerson();
      setEditingNameId(null);
    } catch (err) {
      setEditNameError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setIsSavingName(false);
    }
  };

  // ─── Event handlers ─────────────────────────────────────────────────────

  const openEditEvent = (event: PersonEvent) => {
    setEditingEventId(event.id);
    setEditEventForm({
      event_type: event.event_type,
      event_date: event.event_date ?? '',
      event_place: event.event_place ?? '',
      description: event.description ?? '',
    });
    setEditEventError(null);
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setEditEventError(null);
  };

  const handleSaveEvent = async (eventId: string) => {
    setIsSavingEvent(true);
    setEditEventError(null);
    try {
      const body = {
        event_type: editEventForm.event_type,
        event_date: editEventForm.event_date || null,
        event_place: editEventForm.event_place || null,
        description: editEventForm.description || null,
      };
      const res = await fetch(`/api/v1/events/${eventId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to save event (${res.status})`);
      }
      const updated: PersonEvent = await res.json();
      setPerson((prev) =>
        prev
          ? { ...prev, events: prev.events.map((e) => (e.id === eventId ? updated : e)) }
          : prev,
      );
      setEditingEventId(null);
    } catch (err) {
      setEditEventError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setInlineError(null);
    try {
      const res = await fetch(`/api/v1/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete event (${res.status})`);
      setPerson((prev) =>
        prev ? { ...prev, events: prev.events.filter((e) => e.id !== eventId) } : prev,
      );
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to delete event');
    }
  };

  const openAddEvent = () => {
    setAddEventForm(DEFAULT_EVENT_FORM);
    setAddEventError(null);
    setShowAddEvent(true);
  };

  const cancelAddEvent = () => {
    setShowAddEvent(false);
    setAddEventError(null);
  };

  const handleAddEvent = async () => {
    if (!id) return;
    setIsAddingEvent(true);
    setAddEventError(null);
    try {
      const body = {
        event_type: addEventForm.event_type,
        event_date: addEventForm.event_date || null,
        event_place: addEventForm.event_place || null,
        description: addEventForm.description || null,
      };
      const res = await fetch(`/api/v1/events/people/${id}/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(errData.message ?? `Failed to add event (${res.status})`);
      }
      await fetchPerson();
      setShowAddEvent(false);
    } catch (err) {
      setAddEventError(err instanceof Error ? err.message : 'Failed to add event');
    } finally {
      setIsAddingEvent(false);
    }
  };

  // ─── Home person handler ────────────────────────────────────────────────

  const handleSetHomePerson = async () => {
    if (!id) return;
    setIsSettingHome(true);
    setHomeSetSuccess(false);
    try {
      const res = await fetch('/api/v1/home-person', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: id }),
      });
      if (!res.ok) throw new Error(`Failed to set home person (${res.status})`);
      setHomeSetSuccess(true);
      setTimeout(() => setHomeSetSuccess(false), 3000);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to set home person');
    } finally {
      setIsSettingHome(false);
    }
  };

  // ─── Guard renders ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppShell navbar={<Navbar />} sidebar={<Sidebar />}>
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
      <AppShell navbar={<Navbar />} sidebar={<Sidebar />}>
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
      <AppShell navbar={<Navbar />} sidebar={<Sidebar />}>
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
    primary
      ? [primary.given_name, primary.surname].filter(Boolean).join(' ') || 'Unknown Person'
      : 'Unknown Person';

  const sortedEventsList = sortEvents(person.events);
  const childFamilies = relationships.filter((r) => r.type === 'child_family');
  const parentFamilies = relationships.filter((r) => r.type === 'parent_family');

  // ─── Full render ───────────────────────────────────────────────────────────

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar />}>
      <div className={styles.page}>

        {/* ── Page header ── */}
        <div className={styles.pageHeader}>
          <button className={styles.backBtn} onClick={() => navigate('/people')}>
            ← People
          </button>
          <div className={styles.headerRow}>
            <h1 className={styles.title}>{displayTitle}</h1>
            <div className={styles.headerActions}>
              {canEdit && !editMode && !deleteConfirm && (
                <Button variant="ghost" size="sm" onClick={openEdit}>
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
                {canEdit && !editMode && (
                  <Button variant="ghost" size="sm" onClick={openEdit}>
                    Edit
                  </Button>
                )}
              </div>

              {editMode ? (
                /* ── Edit form ── */
                <div className={styles.editForm}>
                  <div className={styles.editGrid}>
                    <label className={styles.editLabel}>
                      <span>Sex</span>
                      <Select
                        value={editForm.sex}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, sex: e.target.value as SexType }))
                        }
                      >
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                        <option value="X">Non-binary</option>
                        <option value="U">Unknown</option>
                      </Select>
                    </label>

                    <label className={styles.editLabel}>
                      <span>Living Status</span>
                      <Select
                        value={editForm.is_living}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            is_living: e.target.value as '0' | '1',
                          }))
                        }
                      >
                        <option value="1">Living</option>
                        <option value="0">Deceased</option>
                      </Select>
                    </label>

                    <label className={styles.editLabel}>
                      <span>Privacy</span>
                      <Select
                        value={editForm.is_private}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            is_private: e.target.value as '0' | '1',
                          }))
                        }
                      >
                        <option value="0">Public</option>
                        <option value="1">Private</option>
                      </Select>
                    </label>
                  </div>

                  <label className={styles.editLabel}>
                    <span>Notes</span>
                    <textarea
                      className={styles.notesTextarea}
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      placeholder="Add notes about this person…"
                      rows={4}
                    />
                  </label>

                  {saveError && (
                    <div className={styles.saveError} role="alert">
                      {saveError}
                    </div>
                  )}

                  <div className={styles.editActions}>
                    <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSetHomePerson}
                      loading={isSettingHome}
                      disabled={isSaving}
                    >
                      {homeSetSuccess ? '✓ Set as home' : 'Set as Home Person'}
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Read-only info grid ── */
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
              )}
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
                {canEdit && !showAddName && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAddName(true)}>
                    + Add Name
                  </Button>
                )}
              </div>

              {person.names.length === 0 && !showAddName && (
                <p className={styles.noInfo}>No names recorded.</p>
              )}

              {person.names.length > 0 && (
                <ul className={styles.namesList}>
                  {person.names.map((name) => (
                    <li key={name.id} className={styles.nameItem}>
                      {editingNameId === name.id ? (
                        <div className={styles.nameEditForm}>
                          <div className={styles.editGrid}>
                            <label className={styles.editLabel}>
                              <span>Type</span>
                              <Select
                                value={editNameForm.name_type}
                                onChange={(e) =>
                                  setEditNameForm((f) => ({
                                    ...f,
                                    name_type: e.target.value as NameType,
                                  }))
                                }
                              >
                                <option value="birth">Birth</option>
                                <option value="married">Married</option>
                                <option value="aka">AKA</option>
                                <option value="nickname">Nickname</option>
                                <option value="formal">Formal</option>
                                <option value="religious">Religious</option>
                              </Select>
                            </label>
                            <label className={styles.editLabel}>
                              <span>Prefix</span>
                              <Input
                                value={editNameForm.prefix}
                                onChange={(e) =>
                                  setEditNameForm((f) => ({ ...f, prefix: e.target.value }))
                                }
                                placeholder="e.g. Dr."
                              />
                            </label>
                            <label className={styles.editLabel}>
                              <span>Given Name</span>
                              <Input
                                value={editNameForm.given_name}
                                onChange={(e) =>
                                  setEditNameForm((f) => ({ ...f, given_name: e.target.value }))
                                }
                                placeholder="First / given name"
                              />
                            </label>
                            <label className={styles.editLabel}>
                              <span>Surname</span>
                              <Input
                                value={editNameForm.surname}
                                onChange={(e) =>
                                  setEditNameForm((f) => ({ ...f, surname: e.target.value }))
                                }
                                placeholder="Last / family name"
                              />
                            </label>
                            <label className={styles.editLabel}>
                              <span>Suffix</span>
                              <Input
                                value={editNameForm.suffix}
                                onChange={(e) =>
                                  setEditNameForm((f) => ({ ...f, suffix: e.target.value }))
                                }
                                placeholder="e.g. Jr."
                              />
                            </label>
                            <label className={`${styles.editLabel} ${styles.checkboxLabel}`}>
                              <input
                                type="checkbox"
                                checked={editNameForm.is_primary}
                                onChange={(e) =>
                                  setEditNameForm((f) => ({
                                    ...f,
                                    is_primary: e.target.checked,
                                  }))
                                }
                              />
                              <span>Set as primary name</span>
                            </label>
                          </div>
                          {editNameError && (
                            <div className={styles.saveError} role="alert">
                              {editNameError}
                            </div>
                          )}
                          <div className={styles.editActions}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleSaveName(name.id)}
                              loading={isSavingName}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditName}
                              disabled={isSavingName}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
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
                          {canEdit && (
                            <div className={styles.nameItemActions}>
                              <button
                                className={styles.editBtn}
                                onClick={() => openEditName(name)}
                                aria-label={`Edit name: ${fullName(name)}`}
                              >
                                Edit
                              </button>
                              <button
                                className={styles.removeBtn}
                                onClick={() => handleDeleteName(name.id)}
                                aria-label={`Delete name: ${fullName(name)}`}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* ── Add name form ── */}
              {showAddName && (
                <div className={styles.addNameForm}>
                  <div className={styles.editGrid}>
                    <label className={styles.editLabel}>
                      <span>Type</span>
                      <Select
                        value={addNameForm.name_type}
                        onChange={(e) =>
                          setAddNameForm((f) => ({
                            ...f,
                            name_type: e.target.value as NameType,
                          }))
                        }
                      >
                        <option value="birth">Birth</option>
                        <option value="married">Married</option>
                        <option value="aka">AKA</option>
                        <option value="nickname">Nickname</option>
                        <option value="formal">Formal</option>
                        <option value="religious">Religious</option>
                      </Select>
                    </label>

                    <label className={styles.editLabel}>
                      <span>Prefix</span>
                      <Input
                        value={addNameForm.prefix}
                        onChange={(e) =>
                          setAddNameForm((f) => ({ ...f, prefix: e.target.value }))
                        }
                        placeholder="e.g. Dr."
                      />
                    </label>

                    <label className={styles.editLabel}>
                      <span>Given Name</span>
                      <Input
                        value={addNameForm.given_name}
                        onChange={(e) =>
                          setAddNameForm((f) => ({ ...f, given_name: e.target.value }))
                        }
                        placeholder="First / given name"
                      />
                    </label>

                    <label className={styles.editLabel}>
                      <span>Surname</span>
                      <Input
                        value={addNameForm.surname}
                        onChange={(e) =>
                          setAddNameForm((f) => ({ ...f, surname: e.target.value }))
                        }
                        placeholder="Last / family name"
                      />
                    </label>

                    <label className={styles.editLabel}>
                      <span>Suffix</span>
                      <Input
                        value={addNameForm.suffix}
                        onChange={(e) =>
                          setAddNameForm((f) => ({ ...f, suffix: e.target.value }))
                        }
                        placeholder="e.g. Jr."
                      />
                    </label>

                    <label className={`${styles.editLabel} ${styles.checkboxLabel}`}>
                      <input
                        type="checkbox"
                        checked={addNameForm.is_primary}
                        onChange={(e) =>
                          setAddNameForm((f) => ({ ...f, is_primary: e.target.checked }))
                        }
                      />
                      <span>Set as primary name</span>
                    </label>
                  </div>

                  {addNameError && (
                    <div className={styles.saveError} role="alert">
                      {addNameError}
                    </div>
                  )}

                  <div className={styles.editActions}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAddName}
                      loading={isAddingName}
                    >
                      Add Name
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelAddName}
                      disabled={isAddingName}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Notes (read-only; shown outside edit mode when content exists) ── */}
            {!editMode && person.notes && (
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
                {canEdit && !showAddEvent && (
                  <Button variant="ghost" size="sm" onClick={openAddEvent}>
                    + Add Event
                  </Button>
                )}
              </div>

              {sortedEventsList.length === 0 && !showAddEvent ? (
                <p className={styles.noInfo}>No events recorded.</p>
              ) : (
                <ol className={styles.eventsList} aria-label="Life events timeline">
                  {sortedEventsList.map((event) => (
                    <li key={event.id} className={styles.eventItem}>
                      <div className={styles.eventDot} aria-hidden="true" />
                      {editingEventId === event.id ? (
                        <div className={styles.eventEditForm}>
                          <div className={styles.editGrid}>
                            <label className={styles.editLabel}>
                              <span>Type</span>
                              <Select
                                value={editEventForm.event_type}
                                onChange={(e) =>
                                  setEditEventForm((f) => ({
                                    ...f,
                                    event_type: e.target.value,
                                  }))
                                }
                              >
                                {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                                  <option key={val} value={val}>
                                    {label}
                                  </option>
                                ))}
                              </Select>
                            </label>
                            <label className={styles.editLabel}>
                              <span>Date</span>
                              <Input
                                value={editEventForm.event_date}
                                onChange={(e) =>
                                  setEditEventForm((f) => ({
                                    ...f,
                                    event_date: e.target.value,
                                  }))
                                }
                                placeholder="e.g. 1 JAN 1900"
                              />
                            </label>
                            <label className={styles.editLabel}>
                              <span>Place</span>
                              <Input
                                value={editEventForm.event_place}
                                onChange={(e) =>
                                  setEditEventForm((f) => ({
                                    ...f,
                                    event_place: e.target.value,
                                  }))
                                }
                                placeholder="City, State, Country"
                              />
                            </label>
                            <label className={`${styles.editLabel} ${styles.fullWidth}`}>
                              <span>Description</span>
                              <textarea
                                className={styles.notesTextarea}
                                value={editEventForm.description}
                                onChange={(e) =>
                                  setEditEventForm((f) => ({
                                    ...f,
                                    description: e.target.value,
                                  }))
                                }
                                placeholder="Additional details…"
                                rows={2}
                              />
                            </label>
                          </div>
                          {editEventError && (
                            <div className={styles.saveError} role="alert">
                              {editEventError}
                            </div>
                          )}
                          <div className={styles.editActions}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleSaveEvent(event.id)}
                              loading={isSavingEvent}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditEvent}
                              disabled={isSavingEvent}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.eventContent}>
                          <div className={styles.eventHeader}>
                            <span className={styles.eventType}>
                              {formatEventType(event.event_type)}
                            </span>
                            <div className={styles.eventHeaderRight}>
                              {event.event_date && (
                                <span className={styles.eventDate}>{event.event_date}</span>
                              )}
                              {canEdit && (
                                <div className={styles.eventActions}>
                                  <button
                                    className={styles.editBtn}
                                    onClick={() => openEditEvent(event)}
                                    aria-label={`Edit ${event.event_type} event`}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className={styles.removeBtn}
                                    onClick={() => handleDeleteEvent(event.id)}
                                    aria-label={`Delete ${event.event_type} event`}
                                  >
                                    Delete
                                  </button>
                                </div>
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
                      )}
                    </li>
                  ))}
                </ol>
              )}

              {/* ── Add event form ── */}
              {showAddEvent && (
                <div className={styles.addNameForm}>
                  <div className={styles.editGrid}>
                    <label className={styles.editLabel}>
                      <span>Type</span>
                      <Select
                        value={addEventForm.event_type}
                        onChange={(e) =>
                          setAddEventForm((f) => ({ ...f, event_type: e.target.value }))
                        }
                      >
                        {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className={styles.editLabel}>
                      <span>Date</span>
                      <Input
                        value={addEventForm.event_date}
                        onChange={(e) =>
                          setAddEventForm((f) => ({ ...f, event_date: e.target.value }))
                        }
                        placeholder="e.g. 1 JAN 1900"
                      />
                    </label>
                    <label className={styles.editLabel}>
                      <span>Place</span>
                      <Input
                        value={addEventForm.event_place}
                        onChange={(e) =>
                          setAddEventForm((f) => ({ ...f, event_place: e.target.value }))
                        }
                        placeholder="City, State, Country"
                      />
                    </label>
                    <label className={`${styles.editLabel} ${styles.fullWidth}`}>
                      <span>Description</span>
                      <textarea
                        className={styles.notesTextarea}
                        value={addEventForm.description}
                        onChange={(e) =>
                          setAddEventForm((f) => ({ ...f, description: e.target.value }))
                        }
                        placeholder="Additional details…"
                        rows={2}
                      />
                    </label>
                  </div>
                  {addEventError && (
                    <div className={styles.saveError} role="alert">
                      {addEventError}
                    </div>
                  )}
                  <div className={styles.editActions}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAddEvent}
                      loading={isAddingEvent}
                    >
                      Add Event
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelAddEvent}
                      disabled={isAddingEvent}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Relationships ── */}
            <section className={styles.section} aria-labelledby="relationships-heading">
              <h2 className={styles.sectionTitle} id="relationships-heading">
                Relationships
              </h2>

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
    </AppShell>
  );
};

export default PersonDetailPage;
