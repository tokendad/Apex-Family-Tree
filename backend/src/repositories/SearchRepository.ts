import { BaseRepository } from './base.js';
import type { ArchiveSearchResult } from '../types/search.js';

function buildFtsQuery(input: string): string | null {
  const tokens = input
    .replace(/[`"“”'‘’()*:^{}~\-+]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map(token => `"${token}"*`).join(' AND ');
}

export class SearchRepository extends BaseRepository {
  rebuildIndex(): void {
    const rebuild = this.db.transaction(() => {
      this.db.prepare('DELETE FROM archive_search').run();
      this.db.prepare(
        `INSERT INTO archive_search (object_id, object_type, title, summary, body, tags, names)
         SELECT ao.id,
                ao.object_type,
                ao.title,
                ao.summary,
                TRIM(COALESCE(a.notes, '') || ' ' || COALESCE(a.transcription, '') || ' ' || COALESCE(a.creator_text, '') || ' ' || COALESCE(a.physical_location, '') || ' ' ||
                     COALESCE(s.body_markdown, '') || ' ' || COALESCE(s.notes, '') || ' ' ||
                     COALESCE(p.address_text, '') || ' ' || COALESCE(p.locality, '') || ' ' || COALESCE(p.region, '') || ' ' || COALESCE(p.country, '') || ' ' || COALESCE(p.notes, '') || ' ' ||
                     COALESCE(c.description, '') || ' ' ||
                     COALESCE(cl.statement, '') || ' ' || COALESCE(cl.notes, '') || ' ' || COALESCE(cl.status, '') || ' ' ||
                     COALESCE(e.event_type, '') || ' ' || COALESCE(e.event_date, '') || ' ' || COALESCE(e.event_place, '') || ' ' || COALESCE(e.description, '')) AS body,
                COALESCE((
                  SELECT group_concat(t.name, ' ')
                  FROM object_tags ot
                  INNER JOIN tags t ON t.id = ot.tag_id
                  WHERE ot.object_id = ao.id
                ), '') AS tags,
                TRIM(COALESCE((
                  SELECT group_concat(TRIM(COALESCE(n.prefix || ' ', '') || COALESCE(n.given_name || ' ', '') || COALESCE(n.surname || ' ', '') || COALESCE(n.suffix, '')), ' ')
                  FROM names n
                  WHERE n.person_id = ao.id
                ), '') || ' ' || COALESCE((
                  SELECT group_concat(pa.alias, ' ')
                  FROM place_aliases pa
                  WHERE pa.place_id = ao.id
                ), '')) AS names
         FROM archive_objects ao
         LEFT JOIN artifacts a ON a.id = ao.id
         LEFT JOIN stories s ON s.id = ao.id
         LEFT JOIN places p ON p.id = ao.id
         LEFT JOIN collections c ON c.id = ao.id
         LEFT JOIN claims cl ON cl.id = ao.id
         LEFT JOIN events e ON e.id = ao.id
         WHERE ao.is_deleted = 0`,
      ).run();
    });

    rebuild();
  }

  search(query: string, options?: { limit?: number; allowedPrivacyLevels?: string[] }): { data: ArchiveSearchResult[]; total_count: number } {
    const trimmed = query.trim();
    const limit = options?.limit ?? 50;
    const allowedPrivacyLevels = options?.allowedPrivacyLevels ?? ['public', 'family', 'private', 'restricted'];

    if (!trimmed) {
      return { data: [], total_count: 0 };
    }

    const ftsQuery = buildFtsQuery(trimmed);
    const privacyPlaceholders = allowedPrivacyLevels.map(() => '?').join(',');

    if (ftsQuery) {
      const params: unknown[] = [ftsQuery, ...allowedPrivacyLevels];
      const countRow = this.db.prepare(
        `SELECT COUNT(*) AS cnt
         FROM archive_search s
         INNER JOIN archive_objects ao ON ao.id = s.object_id
         WHERE archive_search MATCH ?
           AND ao.is_deleted = 0
           AND ao.privacy_level IN (${privacyPlaceholders})`,
      ).get(...params) as { cnt: number };

      const rows = this.db.prepare(
        `SELECT ao.id,
                ao.object_type,
                ao.title,
                ao.summary,
                ao.privacy_level,
                ao.updated_at,
                bm25(archive_search) AS rank
         FROM archive_search s
         INNER JOIN archive_objects ao ON ao.id = s.object_id
         WHERE archive_search MATCH ?
           AND ao.is_deleted = 0
           AND ao.privacy_level IN (${privacyPlaceholders})
         ORDER BY rank ASC, ao.updated_at DESC, ao.id ASC
         LIMIT ?`,
      ).all(...params, limit) as ArchiveSearchResult[];

      return { data: rows, total_count: countRow.cnt };
    }

    const likeTerm = `%${trimmed}%`;
    const params: unknown[] = [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, ...allowedPrivacyLevels];
    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS cnt
       FROM archive_search s
       INNER JOIN archive_objects ao ON ao.id = s.object_id
       WHERE (s.title LIKE ? OR s.summary LIKE ? OR s.body LIKE ? OR s.tags LIKE ? OR s.names LIKE ?)
         AND ao.is_deleted = 0
         AND ao.privacy_level IN (${privacyPlaceholders})`,
    ).get(...params) as { cnt: number };

    const rows = this.db.prepare(
      `SELECT ao.id,
              ao.object_type,
              ao.title,
              ao.summary,
              ao.privacy_level,
              ao.updated_at,
              NULL AS rank
       FROM archive_search s
       INNER JOIN archive_objects ao ON ao.id = s.object_id
       WHERE (s.title LIKE ? OR s.summary LIKE ? OR s.body LIKE ? OR s.tags LIKE ? OR s.names LIKE ?)
         AND ao.is_deleted = 0
         AND ao.privacy_level IN (${privacyPlaceholders})
       ORDER BY ao.updated_at DESC, ao.id ASC
       LIMIT ?`,
    ).all(...params, limit) as ArchiveSearchResult[];

    return { data: rows, total_count: countRow.cnt };
  }
}
