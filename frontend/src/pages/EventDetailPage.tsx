import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './ArtifactsPage.module.css';

interface EventRecord { id: string; person_id: string | null; family_id: string | null; event_type: string; event_date: string | null; event_place: string | null; description: string | null }
interface ConnectedObject { relationship_id: string; relationship_type_code: string; object_id: string; object_type: string; title: string; summary: string | null }

const DetailRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => <div className={styles.detailRow}><span>{label}</span><strong>{value || '-'}</strong></div>;

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

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="events" />} context="events">
      <div className={styles.page}>
        <Link className={styles.backLink} to="/events">Back to events</Link>
        {isLoading ? <div className={styles.empty}>Loading event...</div> : error || !event ? <div className={styles.error}>{error ?? 'Event not found'}</div> : <>
          <header className={styles.header}><div><p className={styles.eyebrow}>{event.event_type.replaceAll('_', ' ')}</p><h1>{event.event_date || 'Undated event'}</h1>{event.description && <p className={styles.subtitle}>{event.description}</p>}</div><div className={styles.actions}>{canEdit && <Button variant="ghost" onClick={() => setEditMode((value) => !value)}>{editMode ? 'Cancel' : 'Edit'}</Button>}{canDelete && <Button variant="danger" onClick={handleDelete}>Delete</Button>}</div></header>
          {editMode ? <form className={styles.formCard} onSubmit={handleSave}><div className={styles.formGrid}><label className={styles.field}><span>Type</span><Input value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} required /></label><label className={styles.field}><span>Date</span><Input value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></label><label className={styles.field}><span>Place Text</span><Input value={form.event_place} onChange={(e) => setForm({ ...form, event_place: e.target.value })} /></label></div><label className={styles.field}><span>Description</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></label><div className={styles.actions}><Button type="submit">Save Event</Button></div></form> : <section className={styles.detailCard}><DetailRow label="Date" value={event.event_date} /><DetailRow label="Place Text" value={event.event_place} /><DetailRow label="Description" value={event.description} /></section>}
          <section className={styles.detailCard}><div className={styles.sectionTitleRow}><h2>Connected Objects</h2></div>{connected.length === 0 ? <p className={styles.muted}>No relationships connected yet.</p> : <div className={styles.connectedList}>{connected.map((object) => <Link key={`${object.relationship_id}-${object.object_id}`} className={styles.connectedItem} to={`/${object.object_type}s/${object.object_id}`}><strong>{object.title}</strong><span>{object.relationship_type_code}</span></Link>)}</div>}{canEdit && <div className={styles.connectBox}><Input placeholder="Place ID" value={placeId} onChange={(inputEvent) => setPlaceId(inputEvent.target.value)} /><Button onClick={() => id && placeId.trim() && connect('occurred_at', [{ object_id: id, role: 'event' }, { object_id: placeId.trim(), role: 'place' }])}>Connect Place</Button><Input placeholder="Artifact ID" value={artifactId} onChange={(inputEvent) => setArtifactId(inputEvent.target.value)} /><Button onClick={() => id && artifactId.trim() && connect('depicts_event', [{ object_id: artifactId.trim(), role: 'artifact' }, { object_id: id, role: 'event' }])}>Connect Artifact</Button><Input placeholder="Person ID" value={personId} onChange={(inputEvent) => setPersonId(inputEvent.target.value)} /><Button onClick={() => id && personId.trim() && connect('associated_with', [{ object_id: personId.trim(), role: 'item' }, { object_id: id, role: 'item' }])}>Connect Person</Button></div>}</section>
        </>}
      </div>
    </AppShell>
  );
};

export default EventDetailPage;
