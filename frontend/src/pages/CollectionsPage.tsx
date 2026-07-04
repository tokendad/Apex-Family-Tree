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

interface CollectionRecord {
  id: string;
  title: string;
  summary: string | null;
  privacy_level: 'public' | 'family' | 'private' | 'restricted';
  collection_type: 'manual' | 'smart';
  description: string | null;
  item_count: number;
}

const EMPTY_FORM = { title: '', summary: '', description: '', privacy_level: 'family' as CollectionRecord['privacy_level'] };

const CollectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { canCreate } = usePermissions();
  const globalQuery = useSearchStore((state) => state.globalQuery);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (globalQuery.trim()) params.set('q', globalQuery.trim());
      const res = await fetch(`/api/v1/collections?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load collections');
      const json = await res.json() as { data: CollectionRecord[] };
      setCollections(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setIsLoading(false);
    }
  }, [globalQuery]);

  useEffect(() => { void loadCollections(); }, [loadCollections]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary.trim() || null,
          description: form.description.trim() || null,
          privacy_level: form.privacy_level,
        }),
      });
      if (!res.ok) throw new Error('Failed to create collection');
      const created = await res.json() as CollectionRecord;
      setForm(EMPTY_FORM);
      navigate(`/collections/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="collections" />} context="collections">
      <div className={styles.page}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Apex Family Legacy</p><h1>Collections</h1><p className={styles.subtitle}>Curate people, artifacts, events, places, and stories into narrative family groupings.</p></div>
          {canCreate && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'New Collection'}</Button>}
        </header>

        {showCreate && (
          <form className={styles.formCard} onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Title</span><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
              <label className={styles.field}><span>Summary</span><Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label>
              <label className={styles.field}>
                <span>Privacy</span>
                <select value={form.privacy_level} onChange={(e) => setForm({ ...form, privacy_level: e.target.value as CollectionRecord['privacy_level'] })}>
                  <option value="family">Family</option><option value="private">Private</option><option value="restricted">Restricted</option><option value="public">Public</option>
                </select>
              </label>
            </div>
            <label className={styles.field}><span>Description</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></label>
            <div className={styles.actions}><Button type="submit" loading={isSaving}>Create Collection</Button></div>
          </form>
        )}

        {error && <div className={styles.error}>{error}</div>}
        {isLoading ? <div className={styles.empty}>Loading collections...</div> : collections.length === 0 ? <div className={styles.empty}>No collections yet. Create one to gather related archive objects into a story.</div> : (
          <div className={styles.grid}>{collections.map((collection) => (
            <Link key={collection.id} to={`/collections/${collection.id}`} className={styles.card}>
              <div className={styles.cardType}>Collection</div><h2>{collection.title}</h2>{collection.summary && <p>{collection.summary}</p>}
              <div className={styles.meta}><span>{collection.item_count} item{collection.item_count === 1 ? '' : 's'}</span><span>{collection.privacy_level}</span></div>
            </Link>
          ))}</div>
        )}
      </div>
    </AppShell>
  );
};

export default CollectionsPage;
