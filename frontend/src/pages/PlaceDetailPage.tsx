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

interface ConnectedObject {
  relationship_id: string;
  object_id: string;
  object_type: string;
  title: string;
  summary: string | null;
}

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

const InfoRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
  <div className={styles.infoRow}>
    <span>{label}</span>
    <strong>{value || '—'}</strong>
  </div>
);

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
  const [activeTab, setActiveTab] = useState('overview');

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

  const contextActions: ContextActionItem[] = [
    {
      id: 'connect-event',
      label: 'Connect Event',
      description: 'Link an event that occurred at this place',
      disabled: !canEdit,
      onSelect: () => setActiveTab('events'),
    },
    {
      id: 'edit-place',
      label: 'Edit Place',
      description: 'Update location details and notes',
      group: 'manage',
      disabled: !canEdit,
      onSelect: () => {
        setEditMode(true);
        setActiveTab('overview');
      },
    },
    {
      id: 'delete-place',
      label: 'Delete Place',
      description: 'Remove this place record',
      group: 'manage',
      danger: true,
      disabled: !canDelete,
      onSelect: handleDelete,
    },
  ];

  usePageActions(place ? `Actions for ${place.title}` : '', place ? contextActions : []);

  const locationLine = place
    ? [place.locality, place.region, place.country].filter(Boolean).join(', ')
    : '';

  const connectedGroups: ConnectedGroup[] = [
    {
      id: 'events',
      label: 'Events',
      items: connectedEvents.slice(0, 8).map((event) => ({
        id: event.object_id,
        title: event.title,
        subtitle: event.summary ?? 'Occurred here',
        href: `/events/${event.object_id}`,
        initials: 'E',
      })),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <AppShell navbar={<Navbar />} context="places">
      <div className={styles.page}>
        <div className={styles.pageInner}>
          {isLoading ? (
            <div className={styles.centered}>Loading place...</div>
          ) : error || !place || !form ? (
            <div className={styles.errorBanner} role="alert">{error ?? 'Place not found'}</div>
          ) : (
            <ArchiveObjectLayout
              breadcrumb={<><Link to="/places">Places</Link> / Archive Profile</>}
              title={place.title}
              subtitle={[place.place_type, locationLine, place.privacy_level].filter(Boolean).join(' • ')}
              summary={place.summary}
              avatar={<span>⌂</span>}
              stats={[
                { label: 'Events', value: connectedEvents.length },
                { label: 'Privacy', value: place.privacy_level },
              ]}
              tabs={[
                { id: 'overview', label: 'Overview' },
                { id: 'events', label: 'Events', count: connectedEvents.length },
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
                        <h2 className={styles.sectionTitle}>Edit Place</h2>
                      </div>
                      <div className={styles.formGrid}>
                        {(['title', 'place_type', 'address_text', 'locality', 'region', 'country'] as const).map((field) => (
                          <label key={field} className={styles.field}>
                            <span>{field.replace('_', ' ')}</span>
                            <Input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} required={field === 'title'} />
                          </label>
                        ))}
                      </div>
                      <label className={styles.field}>
                        <span>Notes</span>
                        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                      </label>
                      <div className={styles.formActions}>
                        <Button variant="ghost" type="button" onClick={() => setEditMode(false)}>Cancel</Button>
                        <Button type="submit">Save Place</Button>
                      </div>
                    </form>
                  ) : (
                    <section className={styles.section} aria-labelledby="place-details-heading">
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle} id="place-details-heading">Location Details</h2>
                      </div>
                      <div className={styles.infoGrid}>
                        <InfoRow label="Address" value={place.address_text} />
                        <InfoRow label="Locality" value={place.locality} />
                        <InfoRow label="Region" value={place.region} />
                        <InfoRow label="Country" value={place.country} />
                        <InfoRow label="Notes" value={place.notes} />
                      </div>
                    </section>
                  )}
                </div>
              )}

              {activeTab === 'events' && (
                <section className={styles.section} aria-labelledby="place-events-heading">
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle} id="place-events-heading">Connected Events</h2>
                  </div>
                  {connectedEvents.length === 0 ? (
                    <p className={styles.muted}>No events connected yet.</p>
                  ) : (
                    <div className={styles.linkList}>
                      {connectedEvents.map((event) => (
                        <Link key={`${event.relationship_id}-${event.object_id}`} className={styles.linkItem} to={`/events/${event.object_id}`}>
                          <strong>{event.title}</strong>
                          {event.summary && <span>{event.summary}</span>}
                        </Link>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <div className={styles.connectBox}>
                      <Input placeholder="Event archive object ID" value={eventId} onChange={(event) => setEventId(event.target.value)} />
                      <Button onClick={handleConnectEvent}>Connect Event</Button>
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

export default PlaceDetailPage;
