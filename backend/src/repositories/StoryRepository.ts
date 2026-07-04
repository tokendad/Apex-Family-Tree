import { BaseRepository } from './base.js';
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import { RelationshipRepository } from './RelationshipRepository.js';
import { decodeUpdatedAtCursor, encodeUpdatedAtCursor } from '../utils/cursor.js';
import type { CreateStoryInput, StoryDetail, StoryRecord, UpdateStoryInput } from '../types/story.js';

export class StoryRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();
  private relationships = new RelationshipRepository();

  findById(id: string): StoryRecord | undefined {
    return this.db.prepare(
      `SELECT ao.*, s.*, narrator.title AS narrator_title,
              COUNT(DISTINCT rm.relationship_id) AS connection_count
       FROM stories s
       INNER JOIN archive_objects ao ON ao.id = s.id
       LEFT JOIN archive_objects narrator ON narrator.id = s.narrator_person_id
       LEFT JOIN relationship_members rm ON rm.object_id = s.id
       LEFT JOIN relationships r ON r.id = rm.relationship_id
       LEFT JOIN relationship_types rt ON rt.id = r.relationship_type_id AND rt.code = 'describes'
       WHERE s.id = ? AND ao.is_deleted = 0
       GROUP BY s.id`,
    ).get(id) as StoryRecord | undefined;
  }

  findDetail(id: string): StoryDetail | undefined {
    const story = this.findById(id);
    if (!story) return undefined;
    return { ...story, connected_objects: this.relationships.findConnectedObjects(id, 'describes') };
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string }): { data: StoryRecord[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit ?? 50;
    const conditions = ['ao.object_type = ?', 'ao.is_deleted = 0'];
    const params: unknown[] = ['story'];

    if (options?.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(ao.title LIKE ? OR ao.summary LIKE ? OR s.body_markdown LIKE ? OR s.notes LIKE ?)');
      params.push(term, term, term, term);
    }

    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS cnt
       FROM stories s
       INNER JOIN archive_objects ao ON ao.id = s.id
       WHERE ${conditions.join(' AND ')}`,
    ).get(...params) as { cnt: number };

    if (options?.cursor) {
      const decoded = decodeUpdatedAtCursor(options.cursor);
      if (decoded) {
        conditions.push('(ao.updated_at < ? OR (ao.updated_at = ? AND ao.id > ?))');
        params.push(decoded.updatedAt, decoded.updatedAt, decoded.id);
      }
    }

    params.push(limit + 1);
    const rows = this.db.prepare(
      `SELECT ao.*, s.*, narrator.title AS narrator_title,
              COUNT(DISTINCT rm.relationship_id) AS connection_count
       FROM stories s
       INNER JOIN archive_objects ao ON ao.id = s.id
       LEFT JOIN archive_objects narrator ON narrator.id = s.narrator_person_id
       LEFT JOIN relationship_members rm ON rm.object_id = s.id
       LEFT JOIN relationships r ON r.id = rm.relationship_id
       LEFT JOIN relationship_types rt ON rt.id = r.relationship_type_id AND rt.code = 'describes'
       WHERE ${conditions.join(' AND ')}
       GROUP BY s.id
       ORDER BY ao.updated_at DESC, ao.id ASC
       LIMIT ?`,
    ).all(...params) as StoryRecord[];

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const last = rows[rows.length - 1];
    return {
      data: rows,
      next_cursor: hasMore && last ? encodeUpdatedAtCursor(last.updated_at, last.id) : null,
      total_count: countRow.cnt,
    };
  }

  create(data: CreateStoryInput): StoryRecord {
    const createStory = this.db.transaction(() => {
      const archiveObject = this.archiveObjects.create({
        object_type: 'story',
        title: data.title,
        summary: data.summary ?? null,
        privacy_level: data.privacy_level ?? 'family',
        created_by: data.created_by ?? null,
      });

      this.db.prepare(
        `INSERT INTO stories (
          id, story_type, body_markdown, narrator_person_id, recorded_by_user_id,
          date_text, date_start, date_end, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        archiveObject.id,
        data.story_type ?? 'story',
        data.body_markdown,
        data.narrator_person_id ?? null,
        data.recorded_by_user_id ?? null,
        data.date_text ?? null,
        data.date_start ?? null,
        data.date_end ?? null,
        data.notes ?? null,
      );

      return archiveObject.id;
    });

    return this.findById(createStory())!;
  }

  update(id: string, data: UpdateStoryInput): StoryRecord | undefined {
    if (!this.findById(id)) return undefined;

    const updateStory = this.db.transaction(() => {
      this.archiveObjects.update(id, {
        title: data.title,
        summary: data.summary,
        privacy_level: data.privacy_level,
        updated_by: data.updated_by,
      });

      const fields: string[] = [];
      const values: unknown[] = [];
      for (const key of ['story_type', 'body_markdown', 'narrator_person_id', 'recorded_by_user_id', 'date_text', 'date_start', 'date_end', 'notes'] as const) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      }

      if (fields.length > 0) {
        values.push(id);
        this.db.prepare(`UPDATE stories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }
    });

    updateStory();
    return this.findById(id);
  }

  delete(id: string, updatedBy?: string | null): boolean {
    return this.archiveObjects.softDelete(id, updatedBy);
  }
}
