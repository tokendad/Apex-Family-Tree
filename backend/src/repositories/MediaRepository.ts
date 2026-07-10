import fs from 'fs';
import path from 'path';
import { BaseRepository } from './base.js';
import type { MediaItem, PersonMedia, FamilyMedia, EventMedia, MediaPersonRegion } from '../types/db.js';

const SCANNABLE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf',
]);

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.pdf': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}

interface MediaPersonRegionRow extends MediaPersonRegion {
  person_display_name: string | null;
  person_given_name: string | null;
  person_middle_name: string | null;
  person_surname: string | null;
  person_birth_date: string | null;
  person_death_date: string | null;
  person_photo_url: string | null;
}

export class MediaRepository extends BaseRepository {
  findById(id: string): MediaItem | undefined {
    return this.db.prepare('SELECT * FROM media_items WHERE id = ?').get(id) as MediaItem | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string; filter?: string }): { data: MediaItem[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit || 50;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.search) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(title LIKE ? OR original_filename LIKE ? OR description LIKE ?)');
      params.push(term, term, term);
    }

    if (options?.filter === 'unlinked') {
      conditions.push(`NOT EXISTS (SELECT 1 FROM person_media pm WHERE pm.media_id = media_items.id)
        AND NOT EXISTS (SELECT 1 FROM family_media fm WHERE fm.media_id = media_items.id)
        AND NOT EXISTS (SELECT 1 FROM event_media em WHERE em.media_id = media_items.id)`);
    }

    const whereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const countParams = [...params];
    const countRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM media_items${whereClause}`).get(...countParams) as { cnt: number };

    if (options?.cursor) {
      conditions.push('id > ?');
      params.push(options.cursor);
    }

    const fullWhere = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    let query = `SELECT * FROM media_items${fullWhere}`;
    query += ' ORDER BY id ASC LIMIT ?';
    params.push(limit + 1);

    const rows = this.db.prepare(query).all(...params) as MediaItem[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return { data: rows, next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null, total_count: countRow.cnt };
  }

  findByPerson(personId: string): MediaItem[] {
    return this.db.prepare(
      `SELECT mi.* FROM media_items mi
       INNER JOIN person_media pm ON mi.id = pm.media_id
       WHERE pm.person_id = ?
       ORDER BY pm.is_primary DESC, pm.sort_order ASC`
    ).all(personId) as MediaItem[];
  }

  findLinks(mediaId: string): {
    persons: { person_id: string; name: string; is_primary: number }[];
    families: { family_id: string; label: string }[];
    events: { event_id: string; label: string }[];
  } {
    const persons = this.db.prepare(
      `SELECT pm.person_id, pm.is_primary,
              COALESCE(n.given_name, '') || ' ' || COALESCE(n.surname, '') AS name
       FROM person_media pm
       LEFT JOIN names n ON n.person_id = pm.person_id AND n.is_primary = 1
       WHERE pm.media_id = ?
       ORDER BY pm.sort_order ASC`
    ).all(mediaId) as { person_id: string; name: string; is_primary: number }[];

    const families = this.db.prepare(
      `SELECT fm.family_id,
              COALESCE(n1.given_name, '') || ' ' || COALESCE(n1.surname, '') || ' & ' ||
              COALESCE(n2.given_name, '') || ' ' || COALESCE(n2.surname, '') AS label
       FROM family_media fm
       INNER JOIN families f ON f.id = fm.family_id
       LEFT JOIN names n1 ON n1.person_id = f.spouse1_id AND n1.is_primary = 1
       LEFT JOIN names n2 ON n2.person_id = f.spouse2_id AND n2.is_primary = 1
       WHERE fm.media_id = ?
       ORDER BY fm.sort_order ASC`
    ).all(mediaId) as { family_id: string; label: string }[];

    const events = this.db.prepare(
      `SELECT em.event_id,
              e.event_type || COALESCE(' - ' || e.event_date, '') AS label
       FROM event_media em
       INNER JOIN events e ON e.id = em.event_id
       WHERE em.media_id = ?
       ORDER BY em.sort_order ASC`
    ).all(mediaId) as { event_id: string; label: string }[];

    return { persons, families, events };
  }

  findRegions(mediaId: string): MediaPersonRegionRow[] {
    return this.db.prepare(
      `SELECT mpr.*,
              p.display_name AS person_display_name,
              n.given_name AS person_given_name,
              n.middle_name AS person_middle_name,
              n.surname AS person_surname,
              (SELECT event_date FROM events WHERE person_id = mpr.person_id AND event_type = 'birth' ORDER BY created_at ASC LIMIT 1) AS person_birth_date,
              (SELECT event_date FROM events WHERE person_id = mpr.person_id AND event_type = 'death' ORDER BY created_at ASC LIMIT 1) AS person_death_date,
              CASE WHEN pm.media_id IS NOT NULL THEN '/api/v1/media/' || pm.media_id ELSE NULL END AS person_photo_url
       FROM media_person_regions mpr
       LEFT JOIN persons p ON p.id = mpr.person_id
       LEFT JOIN names n ON n.person_id = mpr.person_id AND n.is_primary = 1
       LEFT JOIN person_media pm ON pm.person_id = mpr.person_id AND pm.is_primary = 1
       WHERE mpr.media_id = ?
       ORDER BY mpr.sort_order ASC, mpr.created_at ASC`
    ).all(mediaId) as MediaPersonRegionRow[];
  }

  findRegionById(regionId: string): MediaPersonRegionRow | undefined {
    return this.db.prepare(
      `SELECT mpr.*,
              p.display_name AS person_display_name,
              n.given_name AS person_given_name,
              n.middle_name AS person_middle_name,
              n.surname AS person_surname,
              (SELECT event_date FROM events WHERE person_id = mpr.person_id AND event_type = 'birth' ORDER BY created_at ASC LIMIT 1) AS person_birth_date,
              (SELECT event_date FROM events WHERE person_id = mpr.person_id AND event_type = 'death' ORDER BY created_at ASC LIMIT 1) AS person_death_date,
              CASE WHEN pm.media_id IS NOT NULL THEN '/api/v1/media/' || pm.media_id ELSE NULL END AS person_photo_url
       FROM media_person_regions mpr
       LEFT JOIN persons p ON p.id = mpr.person_id
       LEFT JOIN names n ON n.person_id = mpr.person_id AND n.is_primary = 1
       LEFT JOIN person_media pm ON pm.person_id = mpr.person_id AND pm.is_primary = 1
       WHERE mpr.id = ?`
    ).get(regionId) as MediaPersonRegionRow | undefined;
  }

  createRegion(mediaId: string, data: {
    person_id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): MediaPersonRegionRow {
    const id = this.generateId();
    const now = this.now();
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM media_person_regions WHERE media_id = ?'
    ).get(mediaId) as { next: number };

    this.db.prepare(
      `INSERT INTO media_person_regions (id, media_id, person_id, x, y, width, height, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, mediaId, data.person_id, data.x, data.y, data.width, data.height, maxOrder.next, now, now);

    this.linkToPerson(mediaId, data.person_id);
    return this.findRegionById(id)!;
  }

  updateRegion(regionId: string, data: {
    person_id?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }): MediaPersonRegionRow | undefined {
    const existing = this.findRegionById(regionId);
    if (!existing) return undefined;

    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ['person_id', 'x', 'y', 'width', 'height'] as const) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(this.now(), regionId);
    this.db.prepare(`UPDATE media_person_regions SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    if (data.person_id) {
      this.linkToPerson(existing.media_id, data.person_id);
    }

    return this.findRegionById(regionId);
  }

  deleteRegion(regionId: string): boolean {
    return this.db.prepare('DELETE FROM media_person_regions WHERE id = ?').run(regionId).changes > 0;
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
    is_external?: number;
  }): MediaItem {
    const id = this.generateId();
    const now = this.now();
    this.db.prepare(
      `INSERT INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, thumbnail_path, title, description, date_taken, uploaded_by, is_external, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.filename, data.original_filename, data.mime_type, data.file_size, data.file_path,
      data.thumbnail_path || null, data.title || null, data.description || null,
      data.date_taken || null, data.uploaded_by || null, data.is_external ?? 0, now, now,
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

  delete(id: string): { deleted: boolean; fileDeleted: boolean } {
    const item = this.findById(id);
    if (!item) return { deleted: false, fileDeleted: false };

    this.db.prepare('DELETE FROM media_items WHERE id = ?').run(id);

    // Only delete files from disk for app-managed uploads, not external/scanned files
    let fileDeleted = false;
    if (!item.is_external) {
      try {
        if (fs.existsSync(item.file_path)) {
          fs.unlinkSync(item.file_path);
          fileDeleted = true;
        }
        if (item.thumbnail_path && fs.existsSync(item.thumbnail_path)) {
          fs.unlinkSync(item.thumbnail_path);
        }
      } catch {
        // Ignore file deletion errors
      }
    }

    return { deleted: true, fileDeleted };
  }

  // ─── Scan pre-existing files ──────────────────────────────────────────────

  scanDirectory(mediaPath: string): { added: number; skipped: number; relinked: number; removed: number } {
    const files = this.walkDir(mediaPath);
    let added = 0;
    let skipped = 0;
    let relinked = 0;

    const insertStmt = this.db.prepare(
      `INSERT OR IGNORE INTO media_items (id, filename, original_filename, mime_type, file_size, file_path, thumbnail_path, title, description, date_taken, uploaded_by, is_external, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 1, ?, ?)`
    );

    const checkStmt = this.db.prepare('SELECT 1 FROM media_items WHERE file_path = ?');

    // Files get reorganized into subfolders after their first scan. Find a
    // scanned row for the same file (by name + size) whose old path no
    // longer exists on disk, so a move is treated as a relink rather than
    // a brand-new duplicate row pointing at a fresh id.
    const findStaleStmt = this.db.prepare(
      `SELECT id, file_path FROM media_items
       WHERE original_filename = ? AND file_size = ? AND is_external = 1 AND file_path != ?`
    );
    const relinkStmt = this.db.prepare('UPDATE media_items SET file_path = ?, updated_at = ? WHERE id = ?');

    const runScan = this.db.transaction(() => {
      for (const filePath of files) {
        if (checkStmt.get(filePath)) {
          skipped++;
          continue;
        }

        const ext = path.extname(filePath);
        const filename = path.basename(filePath);
        let fileSize = 0;
        try {
          const stat = fs.statSync(filePath);
          fileSize = stat.size;
        } catch {
          skipped++;
          continue;
        }

        const staleCandidates = findStaleStmt.all(filename, fileSize, filePath) as { id: string; file_path: string }[];
        const stale = staleCandidates.find((c) => !fs.existsSync(c.file_path));

        if (stale) {
          relinkStmt.run(filePath, this.now(), stale.id);
          relinked++;
          continue;
        }

        const id = this.generateId();
        const now = this.now();
        const result = insertStmt.run(
          id, filename, filename, mimeFromExt(ext), fileSize, filePath, now, now,
        );
        if (result.changes > 0) {
          added++;
        } else {
          skipped++;
        }
      }
    });

    runScan();
    const removed = this.cleanupOrphanedScans();
    return { added, skipped, relinked, removed };
  }

  // Removes scanned rows whose file no longer exists on disk, but only when
  // another scanned row for the same file (name + size) still resolves —
  // i.e. it was a duplicate left behind by a scan that predates a move,
  // not the only remaining record of that file.
  private cleanupOrphanedScans(): number {
    const rows = this.db.prepare(
      `SELECT id, file_path, original_filename, file_size FROM media_items WHERE is_external = 1`
    ).all() as { id: string; file_path: string; original_filename: string; file_size: number }[];

    const deleteStmt = this.db.prepare('DELETE FROM media_items WHERE id = ?');
    let removed = 0;

    for (const row of rows) {
      if (fs.existsSync(row.file_path)) continue;
      const hasLiveDuplicate = rows.some(
        (other) => other.id !== row.id
          && other.original_filename === row.original_filename
          && other.file_size === row.file_size
          && fs.existsSync(other.file_path),
      );
      if (hasLiveDuplicate) {
        deleteStmt.run(row.id);
        removed++;
      }
    }

    return removed;
  }

  private walkDir(dir: string): string[] {
    const results: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.walkDir(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCANNABLE_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
    return results;
  }

  // ─── Person links ─────────────────────────────────────────────────────────

  linkToPerson(mediaId: string, personId: string, isPrimary = false): PersonMedia {
    if (isPrimary) {
      this.db.prepare('UPDATE person_media SET is_primary = 0 WHERE person_id = ?').run(personId);
    }

    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM person_media WHERE person_id = ?'
    ).get(personId) as { next: number };

    this.db.prepare(
      'INSERT OR IGNORE INTO person_media (person_id, media_id, is_primary, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
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

  // ─── Family links ─────────────────────────────────────────────────────────

  linkToFamily(mediaId: string, familyId: string): FamilyMedia {
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM family_media WHERE family_id = ?'
    ).get(familyId) as { next: number };

    this.db.prepare(
      'INSERT OR IGNORE INTO family_media (family_id, media_id, sort_order, created_at) VALUES (?, ?, ?, ?)'
    ).run(familyId, mediaId, maxOrder.next, this.now());

    return this.db.prepare(
      'SELECT * FROM family_media WHERE family_id = ? AND media_id = ?'
    ).get(familyId, mediaId) as FamilyMedia;
  }

  unlinkFromFamily(mediaId: string, familyId: string): boolean {
    return this.db.prepare(
      'DELETE FROM family_media WHERE family_id = ? AND media_id = ?'
    ).run(familyId, mediaId).changes > 0;
  }

  // ─── Event links ──────────────────────────────────────────────────────────

  linkToEvent(mediaId: string, eventId: string): EventMedia {
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM event_media WHERE event_id = ?'
    ).get(eventId) as { next: number };

    this.db.prepare(
      'INSERT OR IGNORE INTO event_media (event_id, media_id, sort_order, created_at) VALUES (?, ?, ?, ?)'
    ).run(eventId, mediaId, maxOrder.next, this.now());

    return this.db.prepare(
      'SELECT * FROM event_media WHERE event_id = ? AND media_id = ?'
    ).get(eventId, mediaId) as EventMedia;
  }

  unlinkFromEvent(mediaId: string, eventId: string): boolean {
    return this.db.prepare(
      'DELETE FROM event_media WHERE event_id = ? AND media_id = ?'
    ).run(eventId, mediaId).changes > 0;
  }
}
