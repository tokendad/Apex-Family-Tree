import { BaseRepository } from './base.js';
import type {
  ArchiveObject,
  ArchiveObjectListOptions,
  ArchiveObjectType,
  CreateArchiveObjectInput,
  UpdateArchiveObjectInput,
} from '../types/archive.js';

export class ArchiveObjectRepository extends BaseRepository {
  findById(id: string, options?: { includeDeleted?: boolean }): ArchiveObject | undefined {
    const conditions = ['id = ?'];
    const params: unknown[] = [id];

    if (!options?.includeDeleted) {
      conditions.push('is_deleted = 0');
    }

    return this.db.prepare(`SELECT * FROM archive_objects WHERE ${conditions.join(' AND ')}`).get(...params) as ArchiveObject | undefined;
  }

  findByType(objectType: ArchiveObjectType, options?: ArchiveObjectListOptions): { data: ArchiveObject[]; next_cursor: string | null } {
    const limit = options?.limit ?? 50;
    const conditions = ['object_type = ?'];
    const params: unknown[] = [objectType];

    if (!options?.includeDeleted) {
      conditions.push('is_deleted = 0');
    }

    if (options?.cursor) {
      conditions.push('id > ?');
      params.push(options.cursor);
    }

    params.push(limit + 1);

    const rows = this.db.prepare(
      `SELECT * FROM archive_objects WHERE ${conditions.join(' AND ')} ORDER BY id ASC LIMIT ?`,
    ).all(...params) as ArchiveObject[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return {
      data: rows,
      next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null,
    };
  }

  create(data: CreateArchiveObjectInput): ArchiveObject {
    const id = data.id ?? this.generateId();
    const now = this.now();

    this.db.prepare(
      `INSERT INTO archive_objects (
        id, object_type, title, summary, privacy_level, is_deleted,
        created_at, updated_at, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    ).run(
      id,
      data.object_type,
      data.title.trim(),
      data.summary ?? null,
      data.privacy_level ?? 'family',
      now,
      now,
      data.created_by ?? null,
      data.created_by ?? null,
    );

    return this.findById(id)!;
  }

  update(id: string, data: UpdateArchiveObjectInput): ArchiveObject | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title.trim());
    }

    if (data.summary !== undefined) {
      fields.push('summary = ?');
      values.push(data.summary);
    }

    if (data.privacy_level !== undefined) {
      fields.push('privacy_level = ?');
      values.push(data.privacy_level);
    }

    if (data.updated_by !== undefined) {
      fields.push('updated_by = ?');
      values.push(data.updated_by);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push('updated_at = ?');
    values.push(this.now(), id);

    this.db.prepare(`UPDATE archive_objects SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`).run(...values);
    return this.findById(id);
  }

  softDelete(id: string, updatedBy?: string | null): boolean {
    const result = this.db.prepare(
      `UPDATE archive_objects
       SET is_deleted = 1, updated_at = ?, updated_by = ?
       WHERE id = ? AND is_deleted = 0`,
    ).run(this.now(), updatedBy ?? null, id);

    return result.changes > 0;
  }
}
