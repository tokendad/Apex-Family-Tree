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
      conditions.push('(ao.title LIKE ? OR ao.summary LIKE ? OR p.address_text LIKE ? OR p.locality LIKE ? OR p.county LIKE ? OR p.region LIKE ? OR p.country LIKE ? OR p.postal_code LIKE ? OR p.notes LIKE ?)');
      params.push(term, term, term, term, term, term, term, term, term);
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
          id, normalized_name, place_type, address_text, locality, county,
          region, country, postal_code, latitude, longitude, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        archiveObject.id,
        data.normalized_name?.trim() || normalizePlaceName(data.title),
        data.place_type ?? null,
        data.address_text ?? data.title,
        data.locality ?? null,
        data.county ?? null,
        data.region ?? null,
        data.country ?? null,
        data.postal_code ?? null,
        data.latitude ?? null,
        data.longitude ?? null,
        data.notes ?? null,
      );

      this.replaceAliases(archiveObject.id, [data.title, ...(data.aliases ?? [])]);
      return archiveObject.id;
    });

    return this.findById(createPlace())!;
  }

  /** The place this free-text name refers to, creating it only if nothing matches.

      Matches on an alias as well as the normalized name, which is the whole
      point: the archive's 82 legacy spellings were folded into 72 places, and
      every spelling folded away was kept as an alias. Without the alias leg,
      an event typed "Worcester, Worcester, Massachusetts" would miss the
      "Worcester, Massachusetts" row and recreate the duplicate that was just
      merged out.

      A spelling nobody has recorded before becomes its own place. No attempt is
      made to guess that it belongs with an existing one -- the legacy grouping
      was a reviewed list, not a rule, because every rule tried against this
      data merged something it should not have. */
  resolveOrCreate(name: string, createdBy?: string | null): PlaceRecord | undefined {
    const title = name.trim().replace(/\s+/g, ' ');
    if (!title) return undefined;

    const normalized = normalizePlaceName(title);

    const direct = this.db.prepare(
      `SELECT p.id AS id
       FROM places p
       INNER JOIN archive_objects ao ON ao.id = p.id
       WHERE p.normalized_name = ? AND ao.is_deleted = 0`,
    ).get(normalized) as { id: string } | undefined;
    if (direct) return this.findById(direct.id);

    const viaAlias = this.db.prepare(
      `SELECT pa.place_id AS id
       FROM place_aliases pa
       INNER JOIN archive_objects ao ON ao.id = pa.place_id
       INNER JOIN places p ON p.id = pa.place_id
       WHERE LOWER(TRIM(pa.alias)) = ? AND ao.is_deleted = 0
       ORDER BY pa.sort_order ASC, pa.alias ASC
       LIMIT 1`,
    ).get(normalized) as { id: string } | undefined;
    if (viaAlias) return this.findById(viaAlias.id);

    return this.create({ title, created_by: createdBy ?? null });
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
      for (const key of ['place_type', 'address_text', 'locality', 'county', 'region', 'country', 'postal_code', 'latitude', 'longitude', 'notes'] as const) {
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
        // A rename with no alias list is not a request to forget the old
        // spellings. The legacy backfill folded up to four of them into one
        // place; replacing the list with just the new title would make every
        // one of them unresolvable and let the duplicates come back.
        const kept = data.aliases ?? this.findAliases(id).map(alias => alias.alias);
        this.replaceAliases(id, [currentTitle, ...kept]);
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
