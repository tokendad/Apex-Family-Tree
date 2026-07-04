import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import { usePermissions } from '@/hooks/usePermissions';
import { useSearchStore } from '@/stores/searchStore';
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

const EMPTY_FORM = { title: '', summary: '', place_type: '', address_text: '', locality: '', region: '', country: '', notes: '', privacy_level: 'family' as PlaceRecord['privacy_level'] };

const PlacesPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const globalQuery = useSearchStore((state) => state.globalQuery);
  const [places, setPlaces] = useState<PlaceRecord[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlaces = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (globalQuery.trim()) params.set('q', globalQuery.trim());
      const res = await fetch(`/api/v1/places?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load places');
      const json = await res.json() as { data: PlaceRecord[] };
      setPlaces(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load places');
    } finally {
      setIsLoading(false);
    }
  }, [globalQuery]);

  useEffect(() => { void loadPlaces(); }, [loadPlaces]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]))),
      });
      if (!res.ok) throw new Error('Failed to create place');
      const created = await res.json() as PlaceRecord;
      setForm(EMPTY_FORM);
      navigate(`/places/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create place');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="places" />} context="places">
      <div className={styles.page}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Apex Family Legacy</p><h1>Places</h1><p className={styles.subtitle}>Reusable locations connected to events, people, artifacts, and stories.</p></div>
          {canCreate && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'New Place'}</Button>}
        </header>
        {showCreate && (
          <form className={styles.formCard} onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Name</span><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
              <label className={styles.field}><span>Type</span><Input value={form.place_type} onChange={(e) => setForm({ ...form, place_type: e.target.value })} placeholder="city, cemetery, church" /></label>
              <label className={styles.field}><span>Address</span><Input value={form.address_text} onChange={(e) => setForm({ ...form, address_text: e.target.value })} /></label>
              <label className={styles.field}><span>Locality</span><Input value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} /></label>
              <label className={styles.field}><span>Region</span><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></label>
              <label className={styles.field}><span>Country</span><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
            </div>
            <label className={styles.field}><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
            <div className={styles.actions}><Button type="submit" loading={isSaving}>Create Place</Button></div>
          </form>
        )}
        {error && <div className={styles.error}>{error}</div>}
        {isLoading ? <div className={styles.empty}>Loading places...</div> : places.length === 0 ? <div className={styles.empty}>No places yet.</div> : (
          <div className={styles.grid}>{places.map((place) => (
            <Link key={place.id} to={`/places/${place.id}`} className={styles.card}>
              <div className={styles.cardType}>{place.place_type || 'Place'}</div><h2>{place.title}</h2>{place.summary && <p>{place.summary}</p>}
              <div className={styles.meta}>{place.locality && <span>{place.locality}</span>}{place.region && <span>{place.region}</span>}{place.country && <span>{place.country}</span>}</div>
            </Link>
          ))}</div>
        )}
      </div>
    </AppShell>
  );
};

export default PlacesPage;
