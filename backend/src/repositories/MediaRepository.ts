import { BaseRepository } from './base.js';
import type { MediaItem, PersonMedia } from '../types/db.js';

export class MediaRepository extends BaseRepository {
  findById(id: string): MediaItem | undefined {
    return this.db.prepare('SELECT * FROM media_items WHERE id = ?').get(id) as MediaItem | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string }): { data: MediaItem[]; next_cursor: string | null } {
    const limit = options?.limit || 50;
    const params: unknown[] = [];
    let query = 'SELECT * FROM media_items';

    if (options?.cursor) {
      query += ' WHERE id > ?';
      params.push(options.cursor);
    }

    query += ' ORDER BY id ASC LIMIT ?';
    params.push(limit + 1);

    const rows = this.db.prepare(query).all(...params) as MediaItem[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return { data: rows, next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null };
  }

  findByPerson(personId: string): MediaItem[] {
    return this.db.prepare(
      `SELECT mi.* FROM media_items mi
       INNER JOIN person_media pm ON mi.id = pm.media_id
       WHERE pm.person_id = ?
       ORDER BY pm.is_primary DESC, pm.sort_order ASC`
    ).all(personId) as MediaItem[];
  }

  create(data: {
    filename: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
    file_path: string;
    thumbnail_path?: string;
    title?: string;
    description?: string;
    date_taken?: string;
    uploaded_by?: string;
  }): MediaItem {
    const id = this.generateId();
    const now = this.now();
    this.db.prepare(
      `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, thumbnail_path, title, description, date_taken, uploaded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.filename, data.original_filename, data.mime_type, data.file_size, data.file_path,
      data.thumbnail_path || null, data.title || null, data.description || null,
      data.date_taken || null, data.uploaded_by || null, now, now,
    );
    return this.findById(id)!;
  }

  update(id: string, data: Partial<Pick<MediaItem, 'title' | 'description' | 'date_taken' | 'thumbnail_path'>>): MediaItem | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return this.findById(id);

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    this.db.prepare(`UPDATE media_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM media_items WHERE id = ?').run(id).changes > 0;
  }

  linkToPerson(mediaId: string, personId: string, isPrimary = false): PersonMedia {
    if (isPrimary) {
      this.db.prepare('UPDATE person_media SET is_primary = 0 WHERE person_id = ?').run(personId);
    }

    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM person_media WHERE person_id = ?'
    ).get(personId) as { next: number };

    this.db.prepare(
      'INSERT INTO person_media (person_id, media_id, is_primary, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(personId, mediaId, isPrimary ? 1 : 0, maxOrder.next, this.now());

    return this.db.prepare(
      'SELECT * FROM person_media WHERE person_id = ? AND media_id = ?'
    ).get(personId, mediaId) as PersonMedia;
  }

  unlinkFromPerson(mediaId: string, personId: string): boolean {
    return this.db.prepare(
      'DELETE FROM person_media WHERE person_id = ? AND media_id = ?'
    ).run(personId, mediaId).changes > 0;
  }
}
