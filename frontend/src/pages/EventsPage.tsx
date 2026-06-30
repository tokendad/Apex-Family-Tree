import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './ArtifactsPage.module.css';

interface EventRecord { id: string; person_id: string | null; family_id: string | null; event_type: string; event_date: string | null; event_place: string | null; description: string | null }

const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [form, setForm] = useState({ event_type: 'custom', event_date: '', event_place: '', description: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/events?limit=100');
      if (!res.ok) throw new Error('Failed to load events');
      const json = await res.json() as { data: EventRecord[] };
      setEvents(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPerson) {
      setError('Select a person for this event');
      return;
    }
    const res = await fetch('/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: selectedPerson.id, event_type: form.event_type, event_date: form.event_date.trim() || null, event_place: form.event_place.trim() || null, description: form.description.trim() || null }),
    });
    if (res.ok) {
      const created = await res.json() as EventRecord;
      navigate(`/events/${created.id}`);
    } else {
      setError('Failed to create event');
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="events" />} context="events">
      <div className={styles.page}>
        <header className={styles.header}><div><p className={styles.eyebrow}>Apex Family Legacy</p><h1>Events</h1><p className={styles.subtitle}>Legacy genealogy events with archive-object identity for connections to places, artifacts, and people.</p></div>{canCreate && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'New Event'}</Button>}</header>
        {showCreate && <form className={styles.formCard} onSubmit={handleSubmit}><div className={styles.formGrid}><label className={styles.field}><span>Person</span><PersonPicker value={selectedPerson?.id ?? null} onSelect={setSelectedPerson} onClear={() => setSelectedPerson(null)} /></label><label className={styles.field}><span>Type</span><Input value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} required /></label><label className={styles.field}><span>Date</span><Input value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} placeholder="ABT 1954" /></label><label className={styles.field}><span>Place Text</span><Input value={form.event_place} onChange={(e) => setForm({ ...form, event_place: e.target.value })} /></label></div><label className={styles.field}><span>Description</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></label><div className={styles.actions}><Button type="submit">Create Event</Button></div></form>}
        {error && <div className={styles.error}>{error}</div>}
        {isLoading ? <div className={styles.empty}>Loading events...</div> : events.length === 0 ? <div className={styles.empty}>No events yet.</div> : <div className={styles.grid}>{events.map((event) => <Link key={event.id} to={`/events/${event.id}`} className={styles.card}><div className={styles.cardType}>{event.event_type.replaceAll('_', ' ')}</div><h2>{event.event_date || 'Undated event'}</h2>{event.description && <p>{event.description}</p>}<div className={styles.meta}>{event.event_place && <span>{event.event_place}</span>}{event.person_id && <span>Person event</span>}{event.family_id && <span>Family event</span>}</div></Link>)}</div>}
      </div>
    </AppShell>
  );
};

export default EventsPage;
