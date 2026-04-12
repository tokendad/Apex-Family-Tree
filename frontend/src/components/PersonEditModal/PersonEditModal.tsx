import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import Select from '@/components/Form/Select';
import styles from './PersonEditModal.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'basic' | 'relationships' | 'events' | 'media' | 'notes';
type SexType = 'M' | 'F' | 'X' | 'U';
type NameType = 'birth' | 'married' | 'aka' | 'nickname' | 'formal' | 'religious';
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface PersonEditModalProps {
  open: boolean;
  personId: string | null;
  displayName: string;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

const EVENT_EARLY_ORDER: Record<string, number> = {
  birth: 0,
  baptism: 1,
  christening: 1,
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

function formatEventType(type: string): string {
  return (
    EVENT_TYPE_LABELS[type] ??
    type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function mediaDisplayName(item: MediaItem): string {
  return item.filename ?? item.file_name ?? `Media ${item.id.slice(0, 8)}`;
}

// ─── Media thumbnail sub-component ───────────────────────────────────────────

const ModalMediaThumb: React.FC<{ item: MediaItem }> = ({ item }) => {
  const [imgError, setImgError] = useState(false);

  if (!imgError) {
    return (
      <img
        className={styles.mediaThumbnail}
        src={`/api/v1/media/${item.id}?thumb=1`}
        alt={mediaDisplayName(item)}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    );
  }

  return (
    <div className={styles.mediaFileIcon} aria-hidden="true">
      📄
    </div>
  );
};

// ─── Default form states ──────────────────────────────────────────────────────

const DEFAULT_NAME_FORM = {
  name_type: 'birth' as NameType,
  prefix: '',
  given_name: '',
  surname: '',
  suffix: '',
};

const DEFAULT_EVENT_FORM = {
  event_type: 'birth',
  event_date: '',
  event_place: '',
  description: '',
};

// ─── Main component ───────────────────────────────────────────────────────────

const PersonEditModal: React.FC<PersonEditModalProps> = ({
  open,
  personId,
  displayName,
  onClose,
  onSaved,
}) => {
  const TITLE_ID = 'person-edit-modal-title';
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Data state ──
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('basic');

  // ── Identity form ──
  const [identityForm, setIdentityForm] = useState<{
    sex: SexType;
    is_living: '0' | '1';
    is_private: '0' | '1';
  }>({ sex: 'U', is_living: '0', is_private: '0' });
  const [identityDirty, setIdentityDirty] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  // ── Primary name form ──
  const [primaryNameEntry, setPrimaryNameEntry] = useState<PersonName | null>(null);
  const [primaryNameForm, setPrimaryNameForm] = useState({ ...DEFAULT_NAME_FORM });
  const [primaryNameDirty, setPrimaryNameDirty] = useState(false);
  const [primaryNameSaving, setPrimaryNameSaving] = useState(false);
  const [primaryNameSaved, setPrimaryNameSaved] = useState(false);
  const [primaryNameError, setPrimaryNameError] = useState<string | null>(null);

  // ── Alias name editing ──
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [aliasEditForm, setAliasEditForm] = useState({ ...DEFAULT_NAME_FORM });
  const [aliasEditSaving, setAliasEditSaving] = useState(false);
  const [aliasEditError, setAliasEditError] = useState<string | null>(null);

  // ── Add alias form ──
  const [showAddAlias, setShowAddAlias] = useState(false);
  const [addAliasForm, setAddAliasForm] = useState({ ...DEFAULT_NAME_FORM });
  const [addAliasSaving, setAddAliasSaving] = useState(false);
  const [addAliasError, setAddAliasError] = useState<string | null>(null);

  // ── Event editing ──
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventEditForm, setEventEditForm] = useState({ ...DEFAULT_EVENT_FORM });
  const [eventEditSaving, setEventEditSaving] = useState(false);
  const [eventEditError, setEventEditError] = useState<string | null>(null);

  // ── Add event form ──
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [addEventForm, setAddEventForm] = useState({ ...DEFAULT_EVENT_FORM });
  const [addEventSaving, setAddEventSaving] = useState(false);
  const [addEventError, setAddEventError] = useState<string | null>(null);

  // ── Notes ──
  const [notesValue, setNotesValue] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  // ── Home person ──
  const [isSettingHome, setIsSettingHome] = useState(false);
  const [homeSetSuccess, setHomeSetSuccess] = useState(false);

  // ── Dirty check ──
  const isDirty =
    identityDirty ||
    primaryNameDirty ||
    notesDirty ||
    showAddAlias ||
    editingAliasId !== null ||
    showAddEvent ||
    editingEventId !== null;

  // ─── Seed forms from loaded person data ────────────────────────────────────

  const seedForms = useCallback((p: PersonDetail) => {
    setIdentityForm({
      sex: p.sex,
      is_living: String(p.is_living) as '0' | '1',
      is_private: String(p.is_private) as '0' | '1',
    });
    setNotesValue(p.notes ?? '');
    setIdentityDirty(false);
    setPrimaryNameDirty(false);
    setNotesDirty(false);

    const pEntry = p.names.find((n) => n.is_primary === 1) ?? p.names[0] ?? null;
    setPrimaryNameEntry(pEntry);
    if (pEntry) {
      setPrimaryNameForm({
        name_type: pEntry.name_type,
        prefix: pEntry.prefix ?? '',
        given_name: pEntry.given_name ?? '',
        surname: pEntry.surname ?? '',
        suffix: pEntry.suffix ?? '',
      });
    }
  }, []);

  // ─── Refresh person data after name/event CRUD ─────────────────────────────

  const refreshPersonData = useCallback(async () => {
    if (!personId) return;
    try {
      const res = await fetch(`/api/v1/people/${personId}`, { credentials: 'include' });
      if (!res.ok) return;
      const freshPerson: PersonDetail = await res.json();
      setPerson(freshPerson);
      // Re-seed primary name entry & form only (don't overwrite identity/notes in-flight edits)
      const pEntry =
        freshPerson.names.find((n) => n.is_primary === 1) ?? freshPerson.names[0] ?? null;
      setPrimaryNameEntry(pEntry);
      if (pEntry) {
        setPrimaryNameForm({
          name_type: pEntry.name_type,
          prefix: pEntry.prefix ?? '',
          given_name: pEntry.given_name ?? '',
          surname: pEntry.surname ?? '',
          suffix: pEntry.suffix ?? '',
        });
      }
      onSaved();
    } catch {
      // fail silently — parent data will refresh on next onSaved call
    }
  }, [personId, onSaved]);

  // ─── Load data when modal opens ────────────────────────────────────────────

  useEffect(() => {
    if (!open || !personId) return;
    setLoading(true);
    setActiveTab('basic');

    Promise.all([
      fetch(`/api/v1/people/${personId}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`/api/v1/people/${personId}/relationships`, { credentials: 'include' }).then((r) =>
        r.json(),
      ),
      fetch(`/api/v1/media/people/${personId}/media`, { credentials: 'include' }).then((r) =>
        r.json(),
      ),
    ])
      .then(([p, rels, med]) => {
        setPerson(p as PersonDetail);
        setRelationships(Array.isArray(rels) ? (rels as Relationship[]) : []);
        setMedia(Array.isArray(med) ? (med as MediaItem[]) : []);
        seedForms(p as PersonDetail);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, personId, seedForms]);

  // ─── Cleanup on close ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) {
      setPerson(null);
      setRelationships([]);
      setMedia([]);
      setEditingAliasId(null);
      setEditingEventId(null);
      setShowAddAlias(false);
      setShowAddEvent(false);
      setIdentitySaved(false);
      setPrimaryNameSaved(false);
      setNotesSaved(false);
      setHomeSetSuccess(false);
      setIdentityDirty(false);
      setPrimaryNameDirty(false);
      setNotesDirty(false);
      setIdentityError(null);
      setPrimaryNameError(null);
      setNotesError(null);
      setAliasEditError(null);
      setAddAliasError(null);
      setEventEditError(null);
      setAddEventError(null);
    }
  }, [open]);

  // ─── Confirm close ─────────────────────────────────────────────────────────

  const confirmClose = useCallback(() => {
    if (isDirty) {
      const ok = window.confirm('You have unsaved changes. Discard them?');
      if (!ok) return;
    }
    onClose();
  }, [isDirty, onClose]);

  // ─── ESC key ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        confirmClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, confirmClose]);

  // ─── Focus trap ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open || !modalRef.current) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length) focusable[0].focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !modalRef.current) return;
      const els = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // ─── Body scroll prevention ────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ─── Identity save ─────────────────────────────────────────────────────────

  const handleSaveIdentity = async () => {
    if (!personId) return;
    setIdentitySaving(true);
    setIdentityError(null);
    try {
      const body = {
        sex: identityForm.sex,
        is_living: Number(identityForm.is_living),
        is_private: Number(identityForm.is_private),
      };
      const res = await fetch(`/api/v1/people/${personId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message ?? `Failed to save (${res.status})`);
      }
      const updated: PersonDetail = await res.json();
      setPerson(updated);
      setIdentityDirty(false);
      setIdentitySaved(true);
      setTimeout(() => setIdentitySaved(false), 3000);
      onSaved();
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIdentitySaving(false);
    }
  };

  // ─── Primary name save ─────────────────────────────────────────────────────

  const handleSavePrimaryName = async () => {
    if (!personId || !primaryNameEntry) return;
    setPrimaryNameSaving(true);
    setPrimaryNameError(null);
    try {
      const body = {
        name_type: primaryNameForm.name_type,
        given_name: primaryNameForm.given_name || null,
        surname: primaryNameForm.surname || null,
        prefix: primaryNameForm.prefix || null,
        suffix: primaryNameForm.suffix || null,
        is_primary: 1,
      };
      const res = await fetch(`/api/v1/people/${personId}/names/${primaryNameEntry.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message ?? `Failed to save name (${res.status})`);
      }
      setPrimaryNameDirty(false);
      setPrimaryNameSaved(true);
      setTimeout(() => setPrimaryNameSaved(false), 3000);
      await refreshPersonData();
    } catch (err) {
      setPrimaryNameError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setPrimaryNameSaving(false);
    }
  };

  // ─── Alias name handlers ───────────────────────────────────────────────────

  const openAliasEdit = (name: PersonName) => {
    setEditingAliasId(name.id);
    setAliasEditForm({
      name_type: name.name_type,
      prefix: name.prefix ?? '',
      given_name: name.given_name ?? '',
      surname: name.surname ?? '',
      suffix: name.suffix ?? '',
    });
    setAliasEditError(null);
  };

  const handleSaveAlias = async (nameId: string) => {
    if (!personId) return;
    setAliasEditSaving(true);
    setAliasEditError(null);
    try {
      const body = {
        name_type: aliasEditForm.name_type,
        given_name: aliasEditForm.given_name || null,
        surname: aliasEditForm.surname || null,
        prefix: aliasEditForm.prefix || null,
        suffix: aliasEditForm.suffix || null,
        is_primary: 0,
      };
      const res = await fetch(`/api/v1/people/${personId}/names/${nameId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message ?? `Failed to save name (${res.status})`);
      }
      setEditingAliasId(null);
      await refreshPersonData();
    } catch (err) {
      setAliasEditError(err instanceof Error ? err.message : 'Failed to save name');
    } finally {
      setAliasEditSaving(false);
    }
  };

  const handleDeleteAlias = async (nameId: string) => {
    if (!personId) return;
    try {
      const res = await fetch(`/api/v1/people/${personId}/names/${nameId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete name (${res.status})`);
      await refreshPersonData();
    } catch (err) {
      console.error('Delete alias error:', err);
    }
  };

  const handleAddAlias = async () => {
    if (!personId) return;
    setAddAliasSaving(true);
    setAddAliasError(null);
    try {
      const body = {
        name_type: addAliasForm.name_type,
        given_name: addAliasForm.given_name || null,
        surname: addAliasForm.surname || null,
        prefix: addAliasForm.prefix || null,
        suffix: addAliasForm.suffix || null,
        is_primary: 0,
      };
      const res = await fetch(`/api/v1/people/${personId}/names`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message ?? `Failed to add name (${res.status})`);
      }
      setShowAddAlias(false);
      setAddAliasForm({ ...DEFAULT_NAME_FORM });
      setAddAliasError(null);
      await refreshPersonData();
    } catch (err) {
      setAddAliasError(err instanceof Error ? err.message : 'Failed to add name');
    } finally {
      setAddAliasSaving(false);
    }
  };

  // ─── Event handlers ────────────────────────────────────────────────────────

  const openEventEdit = (event: PersonEvent) => {
    setEditingEventId(event.id);
    setEventEditForm({
      event_type: event.event_type,
      event_date: event.event_date ?? '',
      event_place: event.event_place ?? '',
      description: event.description ?? '',
    });
    setEventEditError(null);
  };

  const handleSaveEvent = async (eventId: string) => {
    setEventEditSaving(true);
    setEventEditError(null);
    try {
      const body = {
        event_type: eventEditForm.event_type,
        event_date: eventEditForm.event_date || null,
        event_place: eventEditForm.event_place || null,
        description: eventEditForm.description || null,
      };
      const res = await fetch(`/api/v1/events/${eventId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message ?? `Failed to save event (${res.status})`);
      }
      const updated: PersonEvent = await res.json();
      setPerson((prev) =>
        prev
          ? { ...prev, events: prev.events.map((e) => (e.id === eventId ? updated : e)) }
          : prev,
      );
      setEditingEventId(null);
      onSaved();
    } catch (err) {
      setEventEditError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setEventEditSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      const res = await fetch(`/api/v1/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to delete event (${res.status})`);
      setPerson((prev) =>
        prev ? { ...prev, events: prev.events.filter((e) => e.id !== eventId) } : prev,
      );
      onSaved();
    } catch (err) {
      console.error('Delete event error:', err);
    }
  };

  const handleAddEvent = async () => {
    if (!personId) return;
    setAddEventSaving(true);
    setAddEventError(null);
    try {
      const body = {
        event_type: addEventForm.event_type,
        event_date: addEventForm.event_date || null,
        event_place: addEventForm.event_place || null,
        description: addEventForm.description || null,
      };
      const res = await fetch(`/api/v1/events/people/${personId}/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message ?? `Failed to add event (${res.status})`);
      }
      const newEvent: PersonEvent = await res.json();
      setPerson((prev) =>
        prev ? { ...prev, events: [...prev.events, newEvent] } : prev,
      );
      setShowAddEvent(false);
      setAddEventForm({ ...DEFAULT_EVENT_FORM });
      onSaved();
    } catch (err) {
      setAddEventError(err instanceof Error ? err.message : 'Failed to add event');
    } finally {
      setAddEventSaving(false);
    }
  };

  // ─── Notes save ────────────────────────────────────────────────────────────

  const handleSaveNotes = async () => {
    if (!personId) return;
    setNotesSaving(true);
    setNotesError(null);
    try {
      const body = { notes: notesValue || null };
      const res = await fetch(`/api/v1/people/${personId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message ?? `Failed to save notes (${res.status})`);
      }
      const updated: PersonDetail = await res.json();
      setPerson(updated);
      setNotesDirty(false);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 3000);
      onSaved();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setNotesSaving(false);
    }
  };

  // ─── Home person ───────────────────────────────────────────────────────────

  const handleSetHomePerson = async () => {
    if (!personId) return;
    setIsSettingHome(true);
    try {
      const res = await fetch('/api/v1/home-person', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId }),
      });
      if (!res.ok) throw new Error(`Failed to set home person (${res.status})`);
      setHomeSetSuccess(true);
      setTimeout(() => setHomeSetSuccess(false), 3000);
      onSaved();
    } catch (err) {
      console.error('Set home person error:', err);
    } finally {
      setIsSettingHome(false);
    }
  };

  // ─── Guard ─────────────────────────────────────────────────────────────────

  if (!open) return null;

  // ─── Computed values ───────────────────────────────────────────────────────

  const aliasNames = person
    ? person.names.filter((n) => n.id !== primaryNameEntry?.id)
    : [];
  const sortedEvents = person ? sortEvents(person.events) : [];
  const childFamilies = relationships.filter((r) => r.type === 'child_family');
  const parentFamilies = relationships.filter((r) => r.type === 'parent_family');

  // ─── Tab definitions ───────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'relationships', label: 'Relationships' },
    { id: 'events', label: 'Events' },
    { id: 'media', label: 'Media' },
    { id: 'notes', label: 'Notes' },
  ];

  // ─── Name form fields (shared JSX fragment) ────────────────────────────────

  const renderNameFields = (
    form: typeof DEFAULT_NAME_FORM,
    onChange: (field: keyof typeof DEFAULT_NAME_FORM, value: string) => void,
  ) => (
    <div className={styles.formGrid}>
      <label className={styles.formLabel}>
        Type
        <Select
          value={form.name_type}
          onChange={(e) => onChange('name_type', e.target.value)}
        >
          <option value="birth">Birth</option>
          <option value="married">Married</option>
          <option value="aka">AKA</option>
          <option value="nickname">Nickname</option>
          <option value="formal">Formal</option>
          <option value="religious">Religious</option>
        </Select>
      </label>
      <label className={styles.formLabel}>
        Prefix
        <Input
          value={form.prefix}
          onChange={(e) => onChange('prefix', e.target.value)}
          placeholder="e.g. Dr."
        />
      </label>
      <label className={styles.formLabel}>
        Given Name
        <Input
          value={form.given_name}
          onChange={(e) => onChange('given_name', e.target.value)}
          placeholder="First / given name"
        />
      </label>
      <label className={styles.formLabel}>
        Surname
        <Input
          value={form.surname}
          onChange={(e) => onChange('surname', e.target.value)}
          placeholder="Last / family name"
        />
      </label>
      <label className={styles.formLabel}>
        Suffix
        <Input
          value={form.suffix}
          onChange={(e) => onChange('suffix', e.target.value)}
          placeholder="e.g. Jr."
        />
      </label>
    </div>
  );

  // ─── Tab: Basic Info ───────────────────────────────────────────────────────

  const renderBasicTab = () => (
    <>
      {/* ── Identity section ── */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Identity</h3>
        <div className={styles.formGrid}>
          <label className={styles.formLabel}>
            Sex
            <Select
              value={identityForm.sex}
              onChange={(e) => {
                setIdentityForm((f) => ({ ...f, sex: e.target.value as SexType }));
                setIdentityDirty(true);
              }}
            >
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="X">Non-binary</option>
              <option value="U">Unknown</option>
            </Select>
          </label>

          <label className={styles.formLabel}>
            Living Status
            <Select
              value={identityForm.is_living}
              onChange={(e) => {
                setIdentityForm((f) => ({ ...f, is_living: e.target.value as '0' | '1' }));
                setIdentityDirty(true);
              }}
            >
              <option value="1">Living</option>
              <option value="0">Deceased</option>
            </Select>
          </label>

          <label className={styles.formLabel}>
            Privacy
            <Select
              value={identityForm.is_private}
              onChange={(e) => {
                setIdentityForm((f) => ({ ...f, is_private: e.target.value as '0' | '1' }));
                setIdentityDirty(true);
              }}
            >
              <option value="0">Public</option>
              <option value="1">Private</option>
            </Select>
          </label>

          {person?.created_at && (
            <div className={styles.formLabel}>
              Date Added
              <span className={styles.infoValue}>
                {new Date(person.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>
        <div className={styles.saveRow}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveIdentity}
            loading={identitySaving}
          >
            Save Identity
          </Button>
          {identitySaved && <span className={styles.saveSuccess}>✓ Saved</span>}
          {identityError && <span className={styles.saveError}>{identityError}</span>}
        </div>
      </div>

      {/* ── Primary Name section ── */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Primary Name</h3>
        {primaryNameEntry ? (
          <>
            {renderNameFields(primaryNameForm, (field, value) => {
              setPrimaryNameForm((f) => ({ ...f, [field]: value }));
              setPrimaryNameDirty(true);
            })}
            <div className={styles.saveRow}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSavePrimaryName}
                loading={primaryNameSaving}
              >
                Save Primary Name
              </Button>
              {primaryNameSaved && <span className={styles.saveSuccess}>✓ Saved</span>}
              {primaryNameError && <span className={styles.saveError}>{primaryNameError}</span>}
            </div>
          </>
        ) : (
          <p className={styles.emptyState}>No names recorded yet.</p>
        )}
      </div>

      {/* ── Names & Aliases section ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Names &amp; Aliases</h3>
          {!showAddAlias && (
            <button className={styles.editBtn} onClick={() => setShowAddAlias(true)}>
              + Add Alias Name
            </button>
          )}
        </div>

        {aliasNames.length === 0 && !showAddAlias && (
          <p className={styles.emptyState}>No additional names recorded.</p>
        )}

        {aliasNames.length > 0 && (
          <ul className={styles.namesList}>
            {aliasNames.map((name) => (
              <li key={name.id} className={styles.nameItem}>
                {editingAliasId === name.id ? (
                  <div className={styles.nameEditExpanded}>
                    {renderNameFields(aliasEditForm, (field, value) =>
                      setAliasEditForm((f) => ({ ...f, [field]: value })),
                    )}
                    {aliasEditError && (
                      <span className={styles.saveError} role="alert">
                        {aliasEditError}
                      </span>
                    )}
                    <div className={styles.saveRow}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSaveAlias(name.id)}
                        loading={aliasEditSaving}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingAliasId(null);
                          setAliasEditError(null);
                        }}
                        disabled={aliasEditSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.nameItemMain}>
                      <span
                        className={[
                          styles.nameTypeBadge,
                          NAME_TYPE_CSS[name.name_type],
                        ].join(' ')}
                      >
                        {NAME_TYPE_LABELS[name.name_type]}
                      </span>
                      <span className={styles.nameText}>{fullName(name)}</span>
                    </div>
                    <div className={styles.nameItemActions}>
                      <button
                        className={styles.editBtn}
                        onClick={() => openAliasEdit(name)}
                        aria-label={`Edit name: ${fullName(name)}`}
                      >
                        Edit
                      </button>
                      <button
                        className={styles.removeBtn}
                        onClick={() => handleDeleteAlias(name.id)}
                        aria-label={`Delete name: ${fullName(name)}`}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Add alias form */}
        {showAddAlias && (
          <div className={styles.nameEditExpanded}>
            {renderNameFields(addAliasForm, (field, value) =>
              setAddAliasForm((f) => ({ ...f, [field]: value })),
            )}
            {addAliasError && (
              <span className={styles.saveError} role="alert">
                {addAliasError}
              </span>
            )}
            <div className={styles.saveRow}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddAlias}
                loading={addAliasSaving}
              >
                Add Name
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddAlias(false);
                  setAddAliasError(null);
                  setAddAliasForm({ ...DEFAULT_NAME_FORM });
                }}
                disabled={addAliasSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  // ─── Tab: Relationships ────────────────────────────────────────────────────

  const renderRelationshipsTab = () => {
    if (childFamilies.length === 0 && parentFamilies.length === 0) {
      return <p className={styles.emptyState}>No family relationships recorded.</p>;
    }

    return (
      <>
        {/* As a child */}
        {childFamilies.length > 0 && (
          <div className={styles.relGroup}>
            <h3 className={styles.relGroupTitle}>As a child</h3>
            {childFamilies.map((rel) => {
              const parents = [rel.spouse1, rel.spouse2].filter(
                (p): p is PersonSummary => p !== null,
              );
              const siblings = rel.children.filter((c) => c.person_id !== personId);

              return (
                <div key={rel.family_id} className={styles.relCard}>
                  <div className={styles.relCardSection}>
                    <span className={styles.relRoleLabel}>Parents</span>
                    {parents.length === 0 ? (
                      <span className={styles.emptyState}>Unknown parents</span>
                    ) : (
                      <div className={styles.relPersonList}>
                        {parents.map((p) => (
                          <Link
                            key={p.id}
                            to={`/people/${p.id}`}
                            className={styles.relPersonLink}
                            onClick={onClose}
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
                            onClick={onClose}
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

        {/* As a spouse / parent */}
        {parentFamilies.length > 0 && (
          <div className={styles.relGroup}>
            <h3 className={styles.relGroupTitle}>As a spouse / parent</h3>
            {parentFamilies.map((rel) => {
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
                          onClick={onClose}
                        >
                          {personName(otherSpouse)}
                        </Link>
                      </div>
                    ) : (
                      <span className={styles.emptyState}>Not recorded</span>
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
                            onClick={onClose}
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
      </>
    );
  };

  // ─── Tab: Events ───────────────────────────────────────────────────────────

  const renderEventsTab = () => (
    <>
      <div className={styles.sectionHeader}>
        <span />
        {!showAddEvent && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAddEventForm({ ...DEFAULT_EVENT_FORM });
              setAddEventError(null);
              setShowAddEvent(true);
            }}
          >
            + Add Event
          </Button>
        )}
      </div>

      {sortedEvents.length === 0 && !showAddEvent && (
        <p className={styles.emptyState}>No events recorded.</p>
      )}

      {sortedEvents.length > 0 && (
        <ol className={styles.eventsList} aria-label="Life events timeline">
          {sortedEvents.map((event) => (
            <li key={event.id} className={styles.eventItem}>
              <div className={styles.eventDot} aria-hidden="true" />
              {editingEventId === event.id ? (
                <div className={styles.eventEditForm}>
                  <div className={styles.formGrid}>
                    <label className={styles.formLabel}>
                      Type
                      <Select
                        value={eventEditForm.event_type}
                        onChange={(e) =>
                          setEventEditForm((f) => ({ ...f, event_type: e.target.value }))
                        }
                      >
                        {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className={styles.formLabel}>
                      Date
                      <Input
                        value={eventEditForm.event_date}
                        onChange={(e) =>
                          setEventEditForm((f) => ({ ...f, event_date: e.target.value }))
                        }
                        placeholder="e.g. 1 JAN 1900"
                      />
                    </label>
                    <label className={styles.formLabel}>
                      Place
                      <Input
                        value={eventEditForm.event_place}
                        onChange={(e) =>
                          setEventEditForm((f) => ({ ...f, event_place: e.target.value }))
                        }
                        placeholder="City, State, Country"
                      />
                    </label>
                    <label className={[styles.formLabel, styles.fullWidth].join(' ')}>
                      Description
                      <textarea
                        className={styles.notesTextarea}
                        value={eventEditForm.description}
                        onChange={(e) =>
                          setEventEditForm((f) => ({ ...f, description: e.target.value }))
                        }
                        placeholder="Additional details…"
                        rows={2}
                      />
                    </label>
                  </div>
                  {eventEditError && (
                    <span className={styles.saveError} role="alert">
                      {eventEditError}
                    </span>
                  )}
                  <div className={styles.saveRow}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSaveEvent(event.id)}
                      loading={eventEditSaving}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingEventId(null);
                        setEventEditError(null);
                      }}
                      disabled={eventEditSaving}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.eventBody}>
                  <div className={styles.eventHeader}>
                    <span className={styles.eventType}>
                      {formatEventType(event.event_type)}
                    </span>
                    <div className={styles.eventMeta}>
                      {event.event_date && (
                        <span className={styles.eventDate}>{event.event_date}</span>
                      )}
                      <div className={styles.eventActions}>
                        <button
                          className={styles.editBtn}
                          onClick={() => openEventEdit(event)}
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

      {/* Add event form */}
      {showAddEvent && (
        <div className={[styles.nameEditExpanded, styles.addEventForm].join(' ')}>
          <div className={styles.formGrid}>
            <label className={styles.formLabel}>
              Type
              <Select
                value={addEventForm.event_type}
                onChange={(e) => setAddEventForm((f) => ({ ...f, event_type: e.target.value }))}
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label className={styles.formLabel}>
              Date
              <Input
                value={addEventForm.event_date}
                onChange={(e) => setAddEventForm((f) => ({ ...f, event_date: e.target.value }))}
                placeholder="e.g. 1 JAN 1900"
              />
            </label>
            <label className={styles.formLabel}>
              Place
              <Input
                value={addEventForm.event_place}
                onChange={(e) => setAddEventForm((f) => ({ ...f, event_place: e.target.value }))}
                placeholder="City, State, Country"
              />
            </label>
            <label className={[styles.formLabel, styles.fullWidth].join(' ')}>
              Description
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
            <span className={styles.saveError} role="alert">
              {addEventError}
            </span>
          )}
          <div className={styles.saveRow}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddEvent}
              loading={addEventSaving}
            >
              Add Event
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddEvent(false);
                setAddEventError(null);
              }}
              disabled={addEventSaving}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );

  // ─── Tab: Media ────────────────────────────────────────────────────────────

  const renderMediaTab = () => {
    if (media.length === 0) {
      return <p className={styles.emptyState}>No media linked to this person.</p>;
    }

    return (
      <div className={styles.mediaGrid}>
        {media.map((item) => (
          <a
            key={item.id}
            href={`/api/v1/media/${item.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mediaTile}
            title={mediaDisplayName(item)}
          >
            <ModalMediaThumb item={item} />
            <span className={styles.mediaFilename}>{mediaDisplayName(item)}</span>
          </a>
        ))}
      </div>
    );
  };

  // ─── Tab: Notes ────────────────────────────────────────────────────────────

  const renderNotesTab = () => (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Notes</h3>
      <textarea
        className={styles.notesTextarea}
        value={notesValue}
        onChange={(e) => {
          setNotesValue(e.target.value);
          setNotesDirty(true);
        }}
        placeholder="Add notes about this person…"
        rows={6}
      />
      <div className={styles.saveRow}>
        <Button variant="primary" size="sm" onClick={handleSaveNotes} loading={notesSaving}>
          Save Notes
        </Button>
        {notesSaved && <span className={styles.saveSuccess}>✓ Saved</span>}
        {notesError && <span className={styles.saveError}>{notesError}</span>}
      </div>
    </div>
  );

  // ─── Render tab content ────────────────────────────────────────────────────

  const renderTabContent = () => {
    if (loading) return <div className={styles.loading}>Loading…</div>;
    if (!person) return <div className={styles.emptyState}>No data available.</div>;

    switch (activeTab) {
      case 'basic':
        return renderBasicTab();
      case 'relationships':
        return renderRelationshipsTab();
      case 'events':
        return renderEventsTab();
      case 'media':
        return renderMediaTab();
      case 'notes':
        return renderNotesTab();
      default:
        return null;
    }
  };

  // ─── Final render ──────────────────────────────────────────────────────────

  return (
    <>
      <div className={styles.backdrop} onClick={confirmClose} />
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 id={TITLE_ID} className={styles.headerTitle}>
              Edit: {displayName}
            </h2>
          </div>
          <button className={styles.closeBtn} onClick={confirmClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        {/* Tab strip */}
        <div className={styles.tabStrip} role="tablist" aria-label="Edit sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-btn-${t.id}`}
              aria-selected={activeTab === t.id}
              aria-controls={`tab-panel-${t.id}`}
              className={[styles.tabBtn, activeTab === t.id ? styles.tabBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          className={styles.tabContent}
          role="tabpanel"
          id={`tab-panel-${activeTab}`}
          aria-labelledby={`tab-btn-${activeTab}`}
        >
          {renderTabContent()}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSetHomePerson}
              loading={isSettingHome}
            >
              {homeSetSuccess ? '✓ Set' : '🏠 Set as Home Person'}
            </Button>
          </div>
          <div className={styles.footerRight}>
            <Button variant="ghost" size="sm" onClick={confirmClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default PersonEditModal;
