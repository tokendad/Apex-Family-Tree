import { BaseRepository } from './base.js';
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import type { CreatePlaceInput, PlaceAliasRecord, PlaceRecord, UpdatePlaceInput } from '../types/place.js';

function normalizePlaceName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export class PlaceRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();

  findById(id: string): PlaceRecord | undefined {
    return this.db.prepare(
      `SELECT ao.*, p.*
       FROM places p
       INNER JOIN archive_objects ao ON ao.id = p.id
       WHERE p.id = ? AND ao.is_deleted = 0`,
    ).get(id) as PlaceRecord | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string }): { data: PlaceRecord[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit ?? 50;
    const conditions = ['ao.object_type = ?', 'ao.is_deleted = 0'];
    const params: unknown[] = ['place'];

    if (options?.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(ao.title LIKE ? OR ao.summary LIKE ? OR p.address_text LIKE ? OR p.locality LIKE ? OR p.region LIKE ? OR p.country LIKE ? OR p.notes LIKE ?)');
      params.push(term, term, term, term, term, term, term);
    }

    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS cnt
       FROM places p
       INNER JOIN archive_objects ao ON ao.id = p.id
       WHERE ${conditions.join(' AND ')}`,
    ).get(...params) as { cnt: number };

    if (options?.cursor) {
      conditions.push('ao.id > ?');
      params.push(options.cursor);
    }

    params.push(limit + 1);
    const rows = this.db.prepare(
      `SELECT ao.*, p.*
       FROM places p
       INNER JOIN archive_objects ao ON ao.id = p.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ao.id ASC
       LIMIT ?`,
    ).all(...params) as PlaceRecord[];

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return {
      data: rows,
      next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null,
      total_count: countRow.cnt,
    };
  }

  create(data: CreatePlaceInput): PlaceRecord {
    const createPlace = this.db.transaction(() => {
      const archiveObject = this.archiveObjects.create({
        object_type: 'place',
        title: data.title,
        summary: data.summary ?? null,
        privacy_level: data.privacy_level ?? 'family',
        created_by: data.created_by ?? null,
      });

      this.db.prepare(
        `INSERT INTO places (
          id, normalized_name, place_type, address_text, locality, region,
          country, latitude, longitude, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        archiveObject.id,
        data.normalized_name?.trim() || normalizePlaceName(data.title),
        data.place_type ?? null,
        data.address_text ?? data.title,
        data.locality ?? null,
        data.region ?? null,
        data.country ?? null,
        data.latitude ?? null,
        data.longitude ?? null,
        data.notes ?? null,
      );

      this.replaceAliases(archiveObject.id, [data.title, ...(data.aliases ?? [])]);
      return archiveObject.id;
    });

    return this.findById(createPlace())!;
  }

  update(id: string, data: UpdatePlaceInput): PlaceRecord | undefined {
    if (!this.findById(id)) return undefined;

    const updatePlace = this.db.transaction(() => {
      this.archiveObjects.update(id, {
        title: data.title,
        summary: data.summary,
        privacy_level: data.privacy_level,
        updated_by: data.updated_by,
      });

      const fields: string[] = [];
      const values: unknown[] = [];
      for (const key of ['place_type', 'address_text', 'locality', 'region', 'country', 'latitude', 'longitude', 'notes'] as const) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      }

      if (data.normalized_name !== undefined || data.title !== undefined) {
        fields.push('normalized_name = ?');
        values.push(data.normalized_name?.trim() || normalizePlaceName(data.title ?? this.findById(id)!.title));
      }

      if (fields.length > 0) {
        values.push(id);
        this.db.prepare(`UPDATE places SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }

      if (data.aliases !== undefined || data.title !== undefined) {
        const currentTitle = data.title ?? this.findById(id)!.title;
        this.replaceAliases(id, [currentTitle, ...(data.aliases ?? [])]);
      }
    });

    updatePlace();
    return this.findById(id);
  }

  delete(id: string, updatedBy?: string | null): boolean {
    return this.archiveObjects.softDelete(id, updatedBy);
  }

  findAliases(placeId: string): PlaceAliasRecord[] {
    return this.db.prepare('SELECT * FROM place_aliases WHERE place_id = ? ORDER BY sort_order ASC, alias ASC').all(placeId) as PlaceAliasRecord[];
  }

  private replaceAliases(placeId: string, aliases: string[]): void {
    this.db.prepare('DELETE FROM place_aliases WHERE place_id = ?').run(placeId);
    const normalized = [...new Set(aliases.map(alias => alias.trim()).filter(Boolean))];
    normalized.forEach((alias, index) => {
      this.db.prepare('INSERT OR IGNORE INTO place_aliases (place_id, alias, source, sort_order) VALUES (?, ?, ?, ?)')
        .run(placeId, alias, 'user', index);
    });
  }
}
