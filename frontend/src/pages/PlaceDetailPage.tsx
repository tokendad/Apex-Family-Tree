import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './ArtifactsPage.module.css';

interface PlaceRecord {
  id: string;
  title: string;
  summary: string | null;
  privacy_level: 'public' | 'family' | 'private' | 'restricted';
  place_type: string | null;
  address_text: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  notes: string | null;
}

interface ConnectedObject { relationship_id: string; object_id: string; object_type: string; title: string; summary: string | null }

const DetailRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => <div className={styles.detailRow}><span>{label}</span><strong>{value || '-'}</strong></div>;

function formFromPlace(place: PlaceRecord) {
  return {
    title: place.title,
    summary: place.summary ?? '',
    place_type: place.place_type ?? '',
    address_text: place.address_text ?? '',
    locality: place.locality ?? '',
    region: place.region ?? '',
    country: place.country ?? '',
    notes: place.notes ?? '',
    privacy_level: place.privacy_level,
  };
}

const PlaceDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = usePermissions();
  const [place, setPlace] = useState<PlaceRecord | null>(null);
  const [form, setForm] = useState<ReturnType<typeof formFromPlace> | null>(null);
  const [connectedEvents, setConnectedEvents] = useState<ConnectedObject[]>([]);
  const [eventId, setEventId] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlace = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/places/${id}`);
      if (!res.ok) throw new Error('Place not found');
      const json = await res.json() as PlaceRecord;
      setPlace(json);
      setForm(formFromPlace(json));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load place');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const loadConnectedEvents = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/v1/relationships/objects/${id}/connected?type=occurred_at`);
    if (!res.ok) return;
    const json = await res.json() as { data: ConnectedObject[] };
    setConnectedEvents(json.data.filter((object) => object.object_type === 'event'));
  }, [id]);

  useEffect(() => { void loadPlace(); }, [loadPlace]);
  useEffect(() => { void loadConnectedEvents(); }, [loadConnectedEvents]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !form) return;
    const res = await fetch(`/api/v1/places/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      const updated = await res.json() as PlaceRecord;
      setPlace(updated);
      setForm(formFromPlace(updated));
      setEditMode(false);
    }
  };

  const handleConnectEvent = async () => {
    if (!id || !eventId.trim()) return;
    const res = await fetch('/api/v1/relationships', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relationship_type_code: 'occurred_at', members: [{ object_id: eventId.trim(), role: 'event' }, { object_id: id, role: 'place' }] }),
    });
    if (res.ok) {
      setEventId('');
      await loadConnectedEvents();
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this place?')) return;
    const res = await fetch(`/api/v1/places/${id}`, { method: 'DELETE' });
    if (res.ok) navigate('/places');
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="places" />} context="places">
      <div className={styles.page}>
        <Link className={styles.backLink} to="/places">Back to places</Link>
        {isLoading ? <div className={styles.empty}>Loading place...</div> : error || !place || !form ? <div className={styles.error}>{error ?? 'Place not found'}</div> : <>
          <header className={styles.header}><div><p className={styles.eyebrow}>{place.place_type || 'Place'}</p><h1>{place.title}</h1>{place.summary && <p className={styles.subtitle}>{place.summary}</p>}</div><div className={styles.actions}>{canEdit && <Button variant="ghost" onClick={() => setEditMode((value) => !value)}>{editMode ? 'Cancel' : 'Edit'}</Button>}{canDelete && <Button variant="danger" onClick={handleDelete}>Delete</Button>}</div></header>
          {editMode ? <form className={styles.formCard} onSubmit={handleSave}><div className={styles.formGrid}>{(['title', 'place_type', 'address_text', 'locality', 'region', 'country'] as const).map((field) => <label key={field} className={styles.field}><span>{field.replace('_', ' ')}</span><Input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={field === 'title'} /></label>)}</div><label className={styles.field}><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label><div className={styles.actions}><Button type="submit">Save Place</Button></div></form> : <section className={styles.detailCard}><DetailRow label="Address" value={place.address_text} /><DetailRow label="Locality" value={place.locality} /><DetailRow label="Region" value={place.region} /><DetailRow label="Country" value={place.country} /><DetailRow label="Notes" value={place.notes} /></section>}
          <section className={styles.detailCard}><div className={styles.sectionTitleRow}><h2>Connected Events</h2></div>{connectedEvents.length === 0 ? <p className={styles.muted}>No events connected yet.</p> : <div className={styles.connectedList}>{connectedEvents.map((event) => <Link key={`${event.relationship_id}-${event.object_id}`} className={styles.connectedItem} to={`/events/${event.object_id}`}><strong>{event.title}</strong><span>{event.summary}</span></Link>)}</div>}{canEdit && <div className={styles.connectBox}><Input placeholder="Event archive object ID" value={eventId} onChange={(event) => setEventId(event.target.value)} /><Button onClick={handleConnectEvent}>Connect Event</Button></div>}</section>
        </>}
      </div>
    </AppShell>
  );
};

export default PlaceDetailPage;
