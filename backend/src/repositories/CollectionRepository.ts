import { BaseRepository } from './base.js';
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import type {
  AddCollectionItemInput,
  CollectionItemRecord,
  CollectionRecord,
  CreateCollectionInput,
  TagRecord,
  UpdateCollectionInput,
} from '../types/collection.js';

export class CollectionRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();

  findById(id: string): CollectionRecord | undefined {
    return this.db.prepare(
      `SELECT ao.*, c.*, COUNT(ci.id) AS item_count
       FROM collections c
       INNER JOIN archive_objects ao ON ao.id = c.id
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       WHERE c.id = ? AND ao.is_deleted = 0
       GROUP BY c.id`,
    ).get(id) as CollectionRecord | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string }): { data: CollectionRecord[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit ?? 50;
    const conditions = ['ao.object_type = ?', 'ao.is_deleted = 0'];
    const params: unknown[] = ['collection'];

    if (options?.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(ao.title LIKE ? OR ao.summary LIKE ? OR c.description LIKE ?)');
      params.push(term, term, term);
    }

    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS cnt
       FROM collections c
       INNER JOIN archive_objects ao ON ao.id = c.id
       WHERE ${conditions.join(' AND ')}`,
    ).get(...params) as { cnt: number };

    if (options?.cursor) {
      conditions.push('ao.id > ?');
      params.push(options.cursor);
    }

    params.push(limit + 1);
    const rows = this.db.prepare(
      `SELECT ao.*, c.*, COUNT(ci.id) AS item_count
       FROM collections c
       INNER JOIN archive_objects ao ON ao.id = c.id
       LEFT JOIN collection_items ci ON ci.collection_id = c.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY c.id
       ORDER BY c.sort_order ASC, ao.title ASC, ao.id ASC
       LIMIT ?`,
    ).all(...params) as CollectionRecord[];

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return {
      data: rows,
      next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null,
      total_count: countRow.cnt,
    };
  }

  create(data: CreateCollectionInput): CollectionRecord {
    const createCollection = this.db.transaction(() => {
      const archiveObject = this.archiveObjects.create({
        object_type: 'collection',
        title: data.title,
        summary: data.summary ?? null,
        privacy_level: data.privacy_level ?? 'family',
        created_by: data.created_by ?? null,
      });

      this.db.prepare(
        `INSERT INTO collections (id, collection_type, description, cover_artifact_id, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        archiveObject.id,
        data.collection_type ?? 'manual',
        data.description ?? null,
        data.cover_artifact_id ?? null,
        data.sort_order ?? 0,
      );

      return archiveObject.id;
    });

    return this.findById(createCollection())!;
  }

  update(id: string, data: UpdateCollectionInput): CollectionRecord | undefined {
    if (!this.findById(id)) return undefined;

    const updateCollection = this.db.transaction(() => {
      this.archiveObjects.update(id, {
        title: data.title,
        summary: data.summary,
        privacy_level: data.privacy_level,
        updated_by: data.updated_by,
      });

      const fields: string[] = [];
      const values: unknown[] = [];
      for (const key of ['collection_type', 'description', 'cover_artifact_id', 'sort_order'] as const) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      }

      if (fields.length > 0) {
        values.push(id);
        this.db.prepare(`UPDATE collections SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }
    });

    updateCollection();
    return this.findById(id);
  }

  delete(id: string, updatedBy?: string | null): boolean {
    return this.archiveObjects.softDelete(id, updatedBy);
  }

  findItems(collectionId: string): CollectionItemRecord[] {
    return this.db.prepare(
      `SELECT ci.*, ao.object_type, ao.title, ao.summary
       FROM collection_items ci
       INNER JOIN archive_objects ao ON ao.id = ci.item_object_id
       WHERE ci.collection_id = ? AND ao.is_deleted = 0
       ORDER BY ci.sort_order ASC, ci.added_at ASC, ci.id ASC`,
    ).all(collectionId) as CollectionItemRecord[];
  }

  addItem(collectionId: string, data: AddCollectionItemInput): CollectionItemRecord {
    const collection = this.findById(collectionId);
    if (!collection) throw new Error('Collection not found');
    const item = this.archiveObjects.findById(data.item_object_id);
    if (!item) throw new Error('Archive object not found');

    const itemId = this.generateId();
    this.db.prepare(
      `INSERT INTO collection_items (id, collection_id, item_object_id, caption, sort_order, added_at, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      itemId,
      collectionId,
      data.item_object_id,
      data.caption ?? null,
      data.sort_order ?? 0,
      this.now(),
      data.added_by ?? null,
    );

    return this.findItems(collectionId).find(row => row.id === itemId)!;
  }

  updateItem(collectionId: string, itemId: string, data: { caption?: string | null; sort_order?: number }): CollectionItemRecord | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.caption !== undefined) {
      fields.push('caption = ?');
      values.push(data.caption);
    }
    if (data.sort_order !== undefined) {
      fields.push('sort_order = ?');
      values.push(data.sort_order);
    }
    if (fields.length === 0) return this.findItems(collectionId).find(row => row.id === itemId);

    values.push(collectionId, itemId);
    this.db.prepare(`UPDATE collection_items SET ${fields.join(', ')} WHERE collection_id = ? AND id = ?`).run(...values);
    return this.findItems(collectionId).find(row => row.id === itemId);
  }

  removeItem(collectionId: string, itemId: string): boolean {
    return this.db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND id = ?').run(collectionId, itemId).changes > 0;
  }

  findTags(): TagRecord[] {
    return this.db.prepare('SELECT * FROM tags ORDER BY name ASC').all() as TagRecord[];
  }

  findTagsForObject(objectId: string): TagRecord[] {
    return this.db.prepare(
      `SELECT t.*
       FROM object_tags ot
       INNER JOIN tags t ON t.id = ot.tag_id
       WHERE ot.object_id = ?
       ORDER BY t.name ASC`,
    ).all(objectId) as TagRecord[];
  }

  addTagToObject(objectId: string, tagName: string): TagRecord {
    const object = this.archiveObjects.findById(objectId);
    if (!object) throw new Error('Archive object not found');
    const name = tagName.trim();
    if (!name) throw new Error('Tag name is required');

    const addTag = this.db.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
      const tag = this.db.prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE').get(name) as TagRecord;
      this.db.prepare('INSERT OR IGNORE INTO object_tags (object_id, tag_id) VALUES (?, ?)').run(objectId, tag.id);
      return tag.id;
    });

    const tagId = addTag();
    return this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId) as TagRecord;
  }

  removeTagFromObject(objectId: string, tagId: string): boolean {
    return this.db.prepare('DELETE FROM object_tags WHERE object_id = ? AND tag_id = ?').run(objectId, tagId).changes > 0;
  }
}
