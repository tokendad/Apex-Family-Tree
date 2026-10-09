import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { objectPath } from '@/utils/objectPath';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '@/components/AppShell/AppShell';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Sidebar/Sidebar';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import ObjectPicker, { ArchiveObjectResult } from '@/components/entity-pickers/ObjectPicker';
import { usePermissions } from '@/hooks/usePermissions';
import styles from './ArtifactsPage.module.css';

interface TagRecord { id: string; name: string }
interface CollectionItem { id: string; item_object_id: string; object_type: string; title: string; summary: string | null; caption: string | null; sort_order: number }
interface CollectionRecord {
  id: string;
  title: string;
  summary: string | null;
  privacy_level: 'public' | 'family' | 'private' | 'restricted';
  collection_type: 'manual' | 'smart';
  description: string | null;
  cover_artifact_id: string | null;
  item_count: number;
  items: CollectionItem[];
  tags: TagRecord[];
}

function formFromCollection(collection: CollectionRecord) {
  return {
    title: collection.title,
    summary: collection.summary ?? '',
    description: collection.description ?? '',
    privacy_level: collection.privacy_level,
    cover_artifact_id: collection.cover_artifact_id,
  };
}

/**
 * A collection's cover image.
 *
 * Migration 045 bridged legacy media into artifacts using the media row's own
 * id, so an artifact that came from media is served at /api/v1/media/<id>.
 * Artifacts with no servable file — and anything not an image — simply render
 * nothing rather than a broken frame; full file display is #22.
 */
const CoverImage: React.FC<{ artifactId: string }> = ({ artifactId }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      className={styles.cover}
      src={`/api/v1/media/${artifactId}`}
      alt="Collection cover"
      onError={() => setFailed(true)}
    />
  );
};

const CollectionDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canEdit, canDelete } = usePermissions();
  const [collection, setCollection] = useState<CollectionRecord | null>(null);
  const [form, setForm] = useState<ReturnType<typeof formFromCollection> | null>(null);
  // An object is chosen through the archive search, not by pasting its id.
  const [pickedItem, setPickedItem] = useState<ArchiveObjectResult | null>(null);
  const [pickedCover, setPickedCover] = useState<ArchiveObjectResult | null>(null);
  const [itemCaption, setItemCaption] = useState('');
  const [tagName, setTagName] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCollection = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/collections/${id}`);
      if (!res.ok) throw new Error('Collection not found');
      const json = await res.json() as CollectionRecord;
      setCollection(json);
      setForm(formFromCollection(json));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collection');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadCollection(); }, [loadCollection]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !form) return;
    const res = await fetch(`/api/v1/collections/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.title.trim(), summary: form.summary.trim() || null, description: form.description.trim() || null, privacy_level: form.privacy_level, cover_artifact_id: form.cover_artifact_id }),
    });
    if (res.ok) {
      setEditMode(false);
      await loadCollection();
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this collection?')) return;
    const res = await fetch(`/api/v1/collections/${id}`, { method: 'DELETE' });
    if (res.ok) navigate('/collections');
  };

  const handleAddItem = async () => {
    if (!id || !pickedItem) return;
    const res = await fetch(`/api/v1/collections/${id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_object_id: pickedItem.id, caption: itemCaption.trim() || null, sort_order: collection?.items.length ?? 0 }),
    });
    if (res.ok) {
      setPickedItem(null);
      setItemCaption('');
      await loadCollection();
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!id) return;
    const res = await fetch(`/api/v1/collections/${id}/items/${itemId}`, { method: 'DELETE' });
    if (res.ok) await loadCollection();
  };

  const handleAddTag = async () => {
    if (!id || !tagName.trim()) return;
    const res = await fetch(`/api/v1/collections/objects/${id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tagName.trim() }),
    });
    if (res.ok) {
      setTagName('');
      await loadCollection();
    }
  };

  return (
    <AppShell navbar={<Navbar />} sidebar={<Sidebar context="collections" />} context="collections">
      <div className={styles.page}>
        <Link className={styles.backLink} to="/collections">Back to collections</Link>
        {isLoading ? <div className={styles.empty}>Loading collection...</div> : error || !collection || !form ? <div className={styles.error}>{error ?? 'Collection not found'}</div> : <>
          <header className={styles.header}>
            <div><p className={styles.eyebrow}>Collection</p><h1>{collection.title}</h1>{collection.summary && <p className={styles.subtitle}>{collection.summary}</p>}</div>
            <div className={styles.actions}>{canEdit && <Button variant="ghost" onClick={() => setEditMode((value) => !value)}>{editMode ? 'Cancel' : 'Edit'}</Button>}{canDelete && <Button variant="danger" onClick={handleDelete}>Delete</Button>}</div>
          </header>

          {editMode ? <form className={styles.formCard} onSubmit={handleSave}>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Title</span><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
              <label className={styles.field}><span>Summary</span><Input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></label>
              <label className={styles.field}><span>Privacy</span><select value={form.privacy_level} onChange={(e) => setForm({ ...form, privacy_level: e.target.value as CollectionRecord['privacy_level'] })}><option value="family">Family</option><option value="private">Private</option><option value="restricted">Restricted</option><option value="public">Public</option></select></label>
            </div>
            <label className={styles.field}><span>Description</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} /></label>
            <div className={styles.field}>
              <span>Cover image</span>
              {form.cover_artifact_id ? (
                <div className={styles.coverRow}>
                  <CoverImage artifactId={form.cover_artifact_id} />
                  <Button variant="ghost" size="sm" onClick={() => { setForm({ ...form, cover_artifact_id: null }); setPickedCover(null); }}>
                    Remove cover
                  </Button>
                </div>
              ) : (
                <ObjectPicker
                  label="Choose an artifact for the cover"
                  objectTypes={['artifact']}
                  value={pickedCover}
                  onSelect={(object) => { setPickedCover(object); setForm({ ...form, cover_artifact_id: object.id }); }}
                  onClear={() => { setPickedCover(null); setForm({ ...form, cover_artifact_id: null }); }}
                />
              )}
            </div>
            <div className={styles.actions}><Button type="submit">Save Collection</Button></div>
          </form> : <section className={styles.detailCard}>{collection.cover_artifact_id && <CoverImage artifactId={collection.cover_artifact_id} />}<div className={styles.detailRow}><span>Description</span><strong>{collection.description || '-'}</strong></div><div className={styles.detailRow}><span>Privacy</span><strong>{collection.privacy_level}</strong></div><div className={styles.detailRow}><span>Items</span><strong>{collection.item_count}</strong></div></section>}

          <section className={styles.detailCard}>
            <div className={styles.sectionTitleRow}><h2>Tags</h2></div>
            <div className={styles.meta}>{collection.tags.length === 0 ? <span>No tags yet</span> : collection.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</div>
            {canEdit && <div className={styles.connectBox}><Input placeholder="Add tag" value={tagName} onChange={(event) => setTagName(event.target.value)} /><Button onClick={handleAddTag}>Add Tag</Button></div>}
          </section>

          <section className={styles.detailCard}>
            <div className={styles.sectionTitleRow}><h2>Collection Items</h2></div>
            {collection.items.length === 0 ? <p className={styles.muted}>No items yet.</p> : <div className={styles.connectedList}>{collection.items.map((item) => <div key={item.id} className={styles.connectedItem}><Link to={objectPath(item.object_type, item.item_object_id)}><strong>{item.title}</strong></Link><span>{item.object_type}{item.caption ? `: ${item.caption}` : ''}</span>{canDelete && <Button variant="ghost" size="sm" onClick={() => void handleRemoveItem(item.id)}>Remove</Button>}</div>)}</div>}
            {canEdit && (
              <div className={styles.connectBox}>
                <ObjectPicker
                  label="Find an object to add"
                  excludeIds={collection.items.map((item) => item.item_object_id)}
                  value={pickedItem}
                  onSelect={setPickedItem}
                  onClear={() => setPickedItem(null)}
                />
                <Input placeholder="Caption" value={itemCaption} onChange={(event) => setItemCaption(event.target.value)} />
                <Button onClick={handleAddItem} disabled={!pickedItem}>Add Item</Button>
              </div>
            )}
          </section>
        </>}
      </div>
    </AppShell>
  );
};

export default CollectionDetailPage;
