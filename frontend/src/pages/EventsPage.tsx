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
import { formatEventType, groupedTypeOptions, isAttributeType } from '@/utils/eventTypes';
import styles from './ArtifactsPage.module.css';

interface EventRecord { id: string; person_id: string | null; family_id: string | null; event_type: string; event_date: string | null; event_place: string | null; description: string | null }

const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null);
  const [form, setForm] = useState({ event_type: 'custom', event_date: '', event_place: '', description: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | 'events' | 'attributes'>('all');
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

  // This page is a flat index across the whole tree, so events and attributes
  // stay in one list and are told apart by a badge and this filter, rather than
  // being split into sections as they are on a person's page (#32).
  const attributeCount = events.filter((event) => isAttributeType(event.event_type)).length;
  const eventCount = events.length - attributeCount;
  const visibleEvents = events.filter((event) => {
    if (kindFilter === 'events') return !isAttributeType(event.event_type);
    if (kindFilter === 'attributes') return isAttributeType(event.event_type);
    return true;
  });

  const KIND_FILTERS: { id: typeof kindFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: events.length },
    { id: 'events', label: 'Events', count: eventCount },
    { id: 'attributes', label: 'Facts & Attributes', count: attributeCount },
  ];

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="events" />} context="events">
      <div className={styles.page}>
        <header className={styles.header}><div><p className={styles.eyebrow}>Apex Family Legacy</p><h1>Events</h1><p className={styles.subtitle}>Legacy genealogy events with archive-object identity for connections to places, artifacts, and people.</p></div>{canCreate && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'New Event'}</Button>}</header>
        {showCreate && <form className={styles.formCard} onSubmit={handleSubmit}><div className={styles.formGrid}><label className={styles.field}><span>Person</span><PersonPicker value={selectedPerson?.id ?? null} onSelect={setSelectedPerson} onClear={() => setSelectedPerson(null)} /></label><label className={styles.field}><span>Type</span><select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} required><optgroup label="Events">{groupedTypeOptions().events.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</optgroup><optgroup label="Facts &amp; Attributes">{groupedTypeOptions().attributes.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</optgroup></select></label><label className={styles.field}><span>Date</span><Input value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} placeholder="ABT 1954" /></label><label className={styles.field}><span>Place Text</span><Input value={form.event_place} onChange={(e) => setForm({ ...form, event_place: e.target.value })} /></label></div><label className={styles.field}><span>Description</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></label><div className={styles.actions}><Button type="submit">Create Event</Button></div></form>}
        {error && <div className={styles.error}>{error}</div>}
        {!isLoading && events.length > 0 && (
          <div className={styles.filterRow} role="group" aria-label="Filter by kind">
            {KIND_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                aria-pressed={kindFilter === filter.id}
                className={`${styles.filterChip} ${kindFilter === filter.id ? styles.filterChipActive : ''}`}
                onClick={() => setKindFilter(filter.id)}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>
        )}
        {isLoading ? (
          <div className={styles.empty}>Loading events...</div>
        ) : events.length === 0 ? (
          <div className={styles.empty}>No events yet.</div>
        ) : visibleEvents.length === 0 ? (
          <div className={styles.empty}>Nothing matches this filter.</div>
        ) : (
          <div className={styles.grid}>
            {visibleEvents.map((event) => (
              <Link key={event.id} to={`/events/${event.id}`} className={styles.card}>
                <div className={styles.cardType}>{formatEventType(event.event_type)}</div>
                <h2>{event.event_date || 'Undated event'}</h2>
                {event.description && <p>{event.description}</p>}
                <div className={styles.meta}>
                  <span>{isAttributeType(event.event_type) ? 'Attribute' : 'Event'}</span>
                  {event.event_place && <span>{event.event_place}</span>}
                  {event.person_id && <span>Person</span>}
                  {event.family_id && <span>Family</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default EventsPage;
