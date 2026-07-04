import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import ArchiveObjectLayout, { type ConnectedGroup } from '@/components/archive-object/ArchiveObjectLayout';
import { type ContextActionItem } from '@/components/archive-object/ContextActionsMenu';
import { usePageActions } from '@/contexts/PageActionsContext';
import { usePermissions } from '@/hooks/usePermissions';
import styles from '@/components/archive-object/ArchiveDetailPage.module.css';

interface EventRecord {
  id: string;
  person_id: string | null;
  family_id: string | null;
  event_type: string;
  event_date: string | null;
  event_place: string | null;
  description: string | null;
}

interface ConnectedObject {
  relationship_id: string;
  relationship_type_code: string;
  object_id: string;
  object_type: string;
  title: string;
  summary: string | null;
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const InfoRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
  <div className={styles.infoRow}>
    <span>{label}</span>
    <strong>{value || '—'}</strong>
  </div>
);

const CONNECTED_GROUP_DEFS: Array<{ type: string; label: string; initials: string; route: string }> = [
  { type: 'person', label: 'People', initials: 'P', route: 'people' },
  { type: 'place', label: 'Places', initials: '⌂', route: 'places' },
  { type: 'artifact', label: 'Artifacts', initials: 'A', route: 'artifacts' },
];

const EventDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = usePermissions();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [form, setForm] = useState({ event_type: '', event_date: '', event_place: '', description: '' });
  const [connected, setConnected] = useState<ConnectedObject[]>([]);
  const [placeId, setPlaceId] = useState('');
  const [artifactId, setArtifactId] = useState('');
  const [personId, setPersonId] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const loadEvent = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/events/${id}`);
      if (!res.ok) throw new Error('Event not found');
      const json = await res.json() as EventRecord;
      setEvent(json);
      setForm({ event_type: json.event_type, event_date: json.event_date ?? '', event_place: json.event_place ?? '', description: json.description ?? '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const loadConnected = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/v1/relationships/objects/${id}/connected`);
    if (!res.ok) return;
    const json = await res.json() as { data: ConnectedObject[] };
    setConnected(json.data);
  }, [id]);

  useEffect(() => { void loadEvent(); }, [loadEvent]);
  useEffect(() => { void loadConnected(); }, [loadConnected]);

  const handleSave = async (eventArg: FormEvent) => {
    eventArg.preventDefault();
    if (!id) return;
    const res = await fetch(`/api/v1/events/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: form.event_type, event_date: form.event_date.trim() || null, event_place: form.event_place.trim() || null, description: form.description.trim() || null }) });
    if (res.ok) {
      const updated = await res.json() as EventRecord;
      setEvent(updated);
      setEditMode(false);
    }
  };

  const connect = async (relationship_type_code: string, members: Array<{ object_id: string; role: string }>) => {
    const res = await fetch('/api/v1/relationships', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ relationship_type_code, members }) });
    if (res.ok) await loadConnected();
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this event?')) return;
    const res = await fetch(`/api/v1/events/${id}`, { method: 'DELETE' });
    if (res.ok) navigate('/events');
  };

  const contextActions: ContextActionItem[] = [
    {
      id: 'connect-object',
      label: 'Connect Object',
      description: 'Link a person, place, or artifact',
      disabled: !canEdit,
      onSelect: () => setActiveTab('connections'),
    },
    {
      id: 'edit-event',
      label: 'Edit Event',
      description: 'Update type, date, place, and description',
      group: 'manage',
      disabled: !canEdit,
      onSelect: () => {
        setEditMode(true);
        setActiveTab('overview');
      },
    },
    {
      id: 'delete-event',
      label: 'Delete Event',
      description: 'Remove this event record',
      group: 'manage',
      danger: true,
      disabled: !canDelete,
      onSelect: handleDelete,
    },
  ];

  const eventTitle = event ? formatEventType(event.event_type) : '';
  usePageActions(event ? `Actions for ${eventTitle}` : '', event ? contextActions : []);

  const connectedGroups: ConnectedGroup[] = CONNECTED_GROUP_DEFS.map((def) => ({
    id: def.type,
    label: def.label,
    items: connected
      .filter((object) => object.object_type === def.type)
      .slice(0, 8)
      .map((object) => ({
        id: object.object_id,
        title: object.title,
        subtitle: object.relationship_type_code.replace(/_/g, ' '),
        href: `/${def.route}/${object.object_id}`,
        initials: def.initials,
      })),
  })).filter((group) => group.items.length > 0);

  return (
    <AppShell navbar={<Navbar />} context="events">
      <div className={styles.page}>
        <div className={styles.pageInner}>
          {isLoading ? (
            <div className={styles.centered}>Loading event...</div>
          ) : error || !event ? (
            <div className={styles.errorBanner} role="alert">{error ?? 'Event not found'}</div>
          ) : (
            <ArchiveObjectLayout
              breadcrumb={<><Link to="/events">Events</Link> / Archive Profile</>}
              title={eventTitle}
              subtitle={[event.event_date ?? 'Undated', event.event_place].filter(Boolean).join(' • ')}
              summary={event.description}
              avatar={<span>◆</span>}
              stats={[
                { label: 'Connections', value: connected.length },
                { label: 'Date', value: event.event_date ?? '—' },
              ]}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'connections', label: 'Connections', count: connected.length },
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              connectedGroups={connectedGroups}
            >
              {activeTab === 'overview' && (
                <div className={styles.tabStack}>
                  {editMode ? (
                    <form className={styles.section} onSubmit={handleSave}>
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Edit Event</h2>
                      </div>
                      <div className={styles.formGrid}>
                        <label className={styles.field}>
                          <span>Type</span>
                          <Input value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} required />
                        </label>
                        <label className={styles.field}>
                          <span>Date</span>
                          <Input value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
                        </label>
                        <label className={styles.field}>
                          <span>Place Text</span>
                          <Input value={form.event_place} onChange={(e) => setForm({ ...form, event_place: e.target.value })} />
                        </label>
                      </div>
                      <label className={styles.field}>
                        <span>Description</span>
                        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
                      </label>
                      <div className={styles.formActions}>
                        <Button variant="ghost" type="button" onClick={() => setEditMode(false)}>Cancel</Button>
                        <Button type="submit">Save Event</Button>
                      </div>
                    </form>
                  ) : (
                    <section className={styles.section} aria-labelledby="event-details-heading">
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle} id="event-details-heading">Event Details</h2>
                      </div>
                      <div className={styles.infoGrid}>
                        <InfoRow label="Type" value={formatEventType(event.event_type)} />
                        <InfoRow label="Date" value={event.event_date} />
                        <InfoRow label="Place Text" value={event.event_place} />
                        <InfoRow label="Description" value={event.description} />
                      </div>
                    </section>
                  )}
                </div>
              )}

              {activeTab === 'connections' && (
                <section className={styles.section} aria-labelledby="event-connections-heading">
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle} id="event-connections-heading">Connected Objects</h2>
                  </div>
                  {connected.length === 0 ? (
                    <p className={styles.muted}>No relationships connected yet.</p>
                  ) : (
                    <div className={styles.linkList}>
                      {connected.map((object) => (
                        <Link key={`${object.relationship_id}-${object.object_id}`} className={styles.linkItem} to={`/${object.object_type}s/${object.object_id}`}>
                          <strong>{object.title}</strong>
                          <span>{object.relationship_type_code.replace(/_/g, ' ')}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div className={styles.connectBox}>
                      <Input placeholder="Place ID" value={placeId} onChange={(inputEvent) => setPlaceId(inputEvent.target.value)} />
                      <Button onClick={() => id && placeId.trim() && connect('occurred_at', [{ object_id: id, role: 'event' }, { object_id: placeId.trim(), role: 'place' }])}>Connect Place</Button>
                      <Input placeholder="Artifact ID" value={artifactId} onChange={(inputEvent) => setArtifactId(inputEvent.target.value)} />
                      <Button onClick={() => id && artifactId.trim() && connect('depicts_event', [{ object_id: artifactId.trim(), role: 'artifact' }, { object_id: id, role: 'event' }])}>Connect Artifact</Button>
                      <Input placeholder="Person ID" value={personId} onChange={(inputEvent) => setPersonId(inputEvent.target.value)} />
                      <Button onClick={() => id && personId.trim() && connect('associated_with', [{ object_id: personId.trim(), role: 'item' }, { object_id: id, role: 'item' }])}>Connect Person</Button>
                    </div>
                  )}
                </section>
              )}
            </ArchiveObjectLayout>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default EventDetailPage;
