import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '@/components/Button/Button';
import Input from '@/components/Form/Input';
import ObjectPicker, { ArchiveObjectResult } from '@/components/entity-pickers/ObjectPicker';
import styles from './ObjectCollections.module.css';

export interface CollectionMembership {
  id: string;
  title: string;
  summary: string | null;
  cover_artifact_id: string | null;
  /** The collection_items row, which is what a removal needs. */
  item_id: string;
  caption: string | null;
}

interface ObjectCollectionsProps {
  /** The archive object whose membership is being shown. */
  objectId: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Notified after a change, so a host page can refresh its own counts. */
  onChange?: (collections: CollectionMembership[]) => void;
}

/**
 * The collections an object belongs to, with controls to join and leave.
 *
 * Curating naturally starts from the thing in front of you — "this belongs in
 * Grandpa's Military Service" — not from the collection, so membership has to
 * be reachable from the object's own page and not only from the collection's
 * (#26). The same two-way principle as connections.
 */
const ObjectCollections: React.FC<ObjectCollectionsProps> = ({
  objectId,
  canEdit,
  canDelete,
  onChange,
}) => {
  const [collections, setCollections] = useState<CollectionMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<ArchiveObjectResult | null>(null);
  const [caption, setCaption] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/collections/for-object/${objectId}`);
      if (!res.ok) throw new Error('Failed to load collections');
      const json = (await res.json()) as { data?: CollectionMembership[] };
      // Never let an unexpected response shape put undefined into state — the
      // host page reads .length off whatever onChange hands it.
      const data = Array.isArray(json.data) ? json.data : [];
      setCollections(data);
      setError(null);
      onChange?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setIsLoading(false);
    }
  }, [objectId, onChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    if (!picked) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/v1/collections/${picked.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_object_id: objectId, caption: caption.trim() || null }),
      });
      if (!res.ok) throw new Error('Could not add to that collection');
      setPicked(null);
      setCaption('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to that collection');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (membership: CollectionMembership) => {
    const res = await fetch(`/api/v1/collections/${membership.id}/items/${membership.item_id}`, {
      method: 'DELETE',
    });
    if (res.ok) await load();
    else setError('Could not remove from that collection');
  };

  return (
    <div className={styles.wrap}>
      {error && (
        <p className={styles.error} role="status">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className={styles.muted}>Loading collections…</p>
      ) : collections.length === 0 ? (
        <p className={styles.muted}>Not in any collection yet.</p>
      ) : (
        <ul className={styles.list}>
          {collections.map((collection) => (
            <li key={collection.item_id} className={styles.item}>
              <Link className={styles.itemLink} to={`/collections/${collection.id}`}>
                {collection.title}
              </Link>
              {collection.caption && <span className={styles.caption}>{collection.caption}</span>}
              {canDelete && (
                <Button variant="ghost" size="sm" onClick={() => void handleRemove(collection)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className={styles.addBox}>
          <ObjectPicker
            label="Add to collection"
            objectTypes={['collection']}
            excludeIds={collections.map((c) => c.id)}
            value={picked}
            onSelect={setPicked}
            onClear={() => setPicked(null)}
          />
          <Input
            placeholder="Caption (optional)"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
          <Button onClick={() => void handleAdd()} disabled={!picked || isSaving}>
            {isSaving ? 'Adding…' : 'Add'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ObjectCollections;
