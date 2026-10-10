import fs from 'fs';
import path from 'path';
import { THUMBNAIL_DIR_NAME } from '../services/init.js';
import { BaseRepository } from './base.js';
import type { MediaItem, PersonMedia, FamilyMedia, EventMedia, SourceMedia, MediaPersonRegion } from '../types/db.js';

// TIFF is included because scanned documents in family archives are routinely
// saved as .tif — death certificates, discharge papers, obituaries. Excluding it
// meant the scanner walked past some of the most genealogically valuable files
// in the library without comment.
//
// Browsers cannot render TIFF inline, so anything displaying these needs a
// generated preview or a download link rather than an <img> tag.
const SCANNABLE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.tif', '.tiff', '.pdf',
]);

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.tif': case '.tiff': return 'image/tiff';
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

  findBySource(sourceId: string): MediaItem[] {
    return this.db.prepare(
      `SELECT mi.* FROM media_items mi
       INNER JOIN source_media sm ON mi.id = sm.media_id
       WHERE sm.source_id = ?
       ORDER BY sm.sort_order ASC`
    ).all(sourceId) as MediaItem[];
  }

  findLinks(mediaId: string): {
    persons: { person_id: string; name: string; is_primary: number }[];
    families: { family_id: string; label: string }[];
    events: { event_id: string; label: string }[];
    sources: { source_id: string; label: string }[];
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

    const sources = this.db.prepare(
      `SELECT sm.source_id, s.title AS label
       FROM source_media sm
       INNER JOIN sources s ON s.id = sm.source_id
       WHERE sm.media_id = ?
       ORDER BY sm.sort_order ASC`
    ).all(mediaId) as { source_id: string; label: string }[];

    return { persons, families, events, sources };
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


  /**
   * Mirror a media item into the archive model as an artifact.
   *
   * media_items and archive_objects are two views of the same thing: the
   * Media gallery lists the files, the Artifacts page catalogues them. They
   * are kept in step by id -- an artifact created from media reuses the media
   * row's id, which is what migration 045 established and what lets
   * /api/v1/media/:id serve an artifact's image.
   *
   * Without this, media added after 045 ran never became artifacts and the two
   * pages showed different things (#13). Guarded on NOT EXISTS so it is safe
   * to call for a row that already has its artifact.
   */
  private syncArtifact(id: string): void {
    const media = this.db.prepare('SELECT * FROM media_items WHERE id = ?').get(id) as
      | { id: string; filename: string; original_filename: string | null; mime_type: string | null;
          file_size: number | null; file_path: string; thumbnail_path: string | null;
          title: string | null; description: string | null; date_taken: string | null;
          uploaded_by: string | null; created_at: string; updated_at: string }
      | undefined;
    if (!media) return;

    const title =
      media.title?.trim() || media.original_filename?.trim() || media.filename?.trim() || 'Untitled Artifact';
    const summary = media.description?.trim() || null;

    const existing = this.db.prepare('SELECT 1 FROM archive_objects WHERE id = ?').get(id);
    if (existing) {
      // Keep the catalogue entry in step with the file's own title/description.
      this.db.prepare(
        `UPDATE archive_objects SET title = ?, summary = ?, updated_at = ?
          WHERE id = ? AND object_type = 'artifact'`,
      ).run(title, summary, media.updated_at, id);
      return;
    }

    this.db.prepare(
      `INSERT INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted,
                                    created_at, updated_at, created_by, updated_by)
       VALUES (?, 'artifact', ?, ?, 'family', 0, ?, ?, ?, ?)`,
    ).run(id, title, summary, media.created_at, media.updated_at, media.uploaded_by, media.uploaded_by);

    // Same MIME mapping as 045, so bridged and newly uploaded media are typed
    // alike. Everything that is not image/video/audio becomes a Document; the
    // Artifacts page's bulk re-type is how a scan becomes a Certificate.
    const mime = media.mime_type ?? '';
    const typeId = mime.startsWith('image/')
      ? 'artifact_type_photo'
      : mime.startsWith('video/')
        ? 'artifact_type_video'
        : mime.startsWith('audio/')
          ? 'artifact_type_audio_recording'
          : 'artifact_type_document';

    this.db.prepare(
      `INSERT INTO artifacts (id, artifact_type_id, original_date_text, original_format)
       VALUES (?, ?, ?, ?)`,
    ).run(id, typeId, media.date_taken?.trim() || null, media.mime_type);

    this.db.prepare(
      `INSERT OR IGNORE INTO artifact_files
         (id, artifact_id, file_role, storage_provider, storage_path, original_filename,
          mime_type, size_bytes, created_at)
       VALUES (?, ?, 'primary', 'local', ?, ?, ?, ?, ?)`,
    ).run(
      `artifact_file_media_${id}`, id, media.file_path, media.original_filename,
      media.mime_type, media.file_size, media.created_at,
    );

    if (media.thumbnail_path?.trim()) {
      this.db.prepare(
        `INSERT OR IGNORE INTO artifact_files
           (id, artifact_id, file_role, storage_provider, storage_path, original_filename,
            mime_type, created_at)
         VALUES (?, ?, 'thumbnail', 'local', ?, ?, ?, ?)`,
      ).run(
        `artifact_file_thumb_${id}`, id, media.thumbnail_path, media.original_filename,
        media.mime_type, media.created_at,
      );
    }
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
    this.syncArtifact(id);
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
    this.syncArtifact(id);
    return this.findById(id);
  }

  /**
   * Media items that still need a thumbnail generated, oldest first.
   *
   * A row whose thumbnail_path points at a file that has since gone missing is
   * included too, so a lost or half-written thumbnail is regenerated rather
   * than leaving the card to fall back to the full-size original forever.
   */
  findWithoutThumbnail(): MediaItem[] {
    return this.db
      .prepare(
        `SELECT * FROM media_items
          WHERE NULLIF(TRIM(COALESCE(thumbnail_path, '')), '') IS NULL
          ORDER BY created_at ASC`,
      )
      .all() as MediaItem[];
  }

  /**
   * Record a generated thumbnail in both places that describe the same file.
   *
   * update() can set media_items.thumbnail_path, but only the create-time
   * artifact sync ever wrote the 'thumbnail' artifact_files row -- so updating
   * the media row alone would leave GET /artifacts/:id/thumbnail reading
   * artifact_files and finding nothing. Both are written in one transaction.
   *
   * The mime passed here is the thumbnail's own (WebP), not the original's:
   * the bridge migrations copied the source type into this row, which was
   * already wrong for any item whose thumbnail differs in format.
   */
  setThumbnail(id: string, thumbnailPath: string, mimeType: string): void {
    const now = this.now();
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE media_items SET thumbnail_path = ?, updated_at = ? WHERE id = ?')
        .run(thumbnailPath, now, id);

      if (!this.hasArtifactFilesTable()) return;
      const size = (() => {
        try {
          return fs.statSync(thumbnailPath).size;
        } catch {
          return null;
        }
      })();

      const original = this.db
        .prepare('SELECT original_filename FROM media_items WHERE id = ?')
        .get(id) as { original_filename: string | null } | undefined;

      this.db
        .prepare(
          `INSERT INTO artifact_files
             (id, artifact_id, file_role, storage_provider, storage_path, original_filename,
              mime_type, size_bytes, created_at)
           VALUES (?, ?, 'thumbnail', 'local', ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             storage_path = excluded.storage_path,
             mime_type = excluded.mime_type,
             size_bytes = excluded.size_bytes`,
        )
        .run(
          `artifact_file_thumb_${id}`, id, thumbnailPath,
          original?.original_filename ?? null, mimeType, size, now,
        );
    })();
  }

  private hasArtifactFilesTable(): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'artifact_files'")
      .get() as { n: number };
    return row.n === 1;
  }

  delete(id: string): { deleted: boolean; fileDeleted: boolean } {
    const item = this.findById(id);
    if (!item) return { deleted: false, fileDeleted: false };

    this.db.prepare('DELETE FROM media_items WHERE id = ?').run(id);
    // The artifact mirrors the media row, so it goes too. archive_objects
    // cascades to artifacts and on to artifact_files; a soft delete would
    // leave the Artifacts page listing a file that no longer exists.
    this.db.prepare("DELETE FROM archive_objects WHERE id = ? AND object_type = 'artifact'").run(id);

    // Only delete files from disk for app-managed uploads, not external/scanned files
    let fileDeleted = false;
    if (!item.is_external) {
      try {
        if (fs.existsSync(item.file_path)) {
          fs.unlinkSync(item.file_path);
          fileDeleted = true;
        }
      } catch {
        // Ignore file deletion errors
      }
    }

    // The thumbnail goes regardless of is_external. That flag protects the
    // user's own originals -- a scanned or externally managed file AFT must not
    // touch -- but the thumbnail beside it was generated by AFT, so leaving it
    // behind just orphans a file in the volume.
    try {
      if (item.thumbnail_path && fs.existsSync(item.thumbnail_path)) {
        fs.unlinkSync(item.thumbnail_path);
      }
    } catch {
      // Ignore file deletion errors
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

  /**
   * Walk a directory for scannable files, skipping a "thumbnails" folder in
   * the scan root.
   *
   * Generated thumbnails live under DATA_DIR precisely so they are out of
   * reach here, but DATA_DIR and MEDIA_PATH are separate settings and nothing
   * stops them overlapping. Without this guard such a setup would re-import
   * every generated thumbnail as a new external media item on the next scan --
   * .webp is scannable and the walk recurses -- and each would appear on the
   * Artifacts page as its own artifact.
   */
  private walkDir(dir: string, root = dir): string[] {
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
        if (dir === root && entry.name === THUMBNAIL_DIR_NAME) continue;
        results.push(...this.walkDir(fullPath, root));
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
    const link = this.db.transaction(() => {
      if (isPrimary) {
        this.db.prepare('UPDATE person_media SET is_primary = 0 WHERE person_id = ?').run(personId);
      }

      const maxOrder = this.db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM person_media WHERE person_id = ?'
      ).get(personId) as { next: number };

      this.db.prepare(
        'INSERT OR IGNORE INTO person_media (person_id, media_id, is_primary, sort_order, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(personId, mediaId, isPrimary ? 1 : 0, maxOrder.next, this.now());

      this.syncAppearsIn(mediaId, personId, maxOrder.next);

      return this.db.prepare(
        'SELECT * FROM person_media WHERE person_id = ? AND media_id = ?'
      ).get(personId, mediaId) as PersonMedia;
    });

    return link();
  }

  unlinkFromPerson(mediaId: string, personId: string): boolean {
    const unlink = this.db.transaction(() => {
      const removed = this.db.prepare(
        'DELETE FROM person_media WHERE person_id = ? AND media_id = ?'
      ).run(personId, mediaId).changes > 0;

      if (removed) this.removeAppearsIn(mediaId, personId);
      return removed;
    });

    return unlink();
  }

  /** Whether this database has the archive-model tables the mirror needs. */
  private hasArchiveTables(): boolean {
    const row = this.db.prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master
        WHERE type = 'table' AND name IN ('archive_objects', 'artifacts', 'relationships', 'relationship_members')`,
    ).get() as { n: number };
    return row.n === 4;
  }

  /**
   * Mirror a person_media link into the archive model as an "appears in"
   * relationship, so the person page's summary card and its Artifacts tab
   * agree.
   *
   * Two link tables describe the same fact. person_media is the legacy one;
   * relationships is what PersonDetailPage counts for "Artifacts" and lists
   * under "Recent Artifacts". 063 backfilled the 125 existing links, but
   * without this a newly tagged photo would drift straight back apart -- which
   * is exactly how media and artifacts came to disagree before 061.
   *
   * One relationship per media item, carrying every depicted person as a
   * subject: the appears_in contract allows a single artifact and any number
   * of subjects, so a class photograph is one relationship with many subjects.
   * The id is derived from the media id, matching 063, so a backfilled
   * relationship and a freshly created one are indistinguishable.
   */
  private syncAppearsIn(mediaId: string, personId: string, sortOrder: number): void {
    // Older schemas -- and the narrower fixtures some repository tests build --
    // predate the archive model entirely. Mirroring is a no-op there rather
    // than an error, which is how EventRepository guards its own archive sync.
    if (!this.hasArchiveTables()) return;

    // Without an artifact identity for the media or an archive identity for
    // the person there is nothing to relate, and writing the member anyway
    // would leave a row pointing at a missing archive object.
    const hasArtifact = this.db.prepare('SELECT 1 FROM artifacts WHERE id = ?').get(mediaId);
    const hasPerson = this.db
      .prepare("SELECT 1 FROM archive_objects WHERE id = ? AND object_type = 'person'")
      .get(personId);
    if (!hasArtifact || !hasPerson) return;

    const relationshipId = `rel_appears_in_media_${mediaId}`;
    const now = this.now();

    const exists = this.db.prepare('SELECT 1 FROM relationships WHERE id = ?').get(relationshipId);
    if (!exists) {
      this.db.prepare(
        `INSERT OR IGNORE INTO archive_objects (id, object_type, title, summary, privacy_level,
                                                is_deleted, created_at, updated_at, created_by, updated_by)
         VALUES (?, 'relationship', 'Appears In', NULL, 'family', 0, ?, ?, NULL, NULL)`,
      ).run(relationshipId, now, now);

      this.db.prepare(
        `INSERT OR IGNORE INTO relationships (id, relationship_type_id, label, description, notes)
         VALUES (?, 'rel_type_appears_in', NULL, NULL, NULL)`,
      ).run(relationshipId);

      this.db.prepare(
        `INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order)
         VALUES (?, ?, ?, 'artifact', 0)`,
      ).run(`relm_artifact_${mediaId}`, relationshipId, mediaId);
    }

    this.db.prepare(
      `INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order)
       VALUES (?, ?, ?, 'subject', ?)`,
    ).run(`relm_subject_${mediaId}_${personId}`, relationshipId, personId, sortOrder);
  }

  /**
   * Drop a person from a media item's "appears in" relationship, and drop the
   * relationship itself once the last subject has gone -- an appears_in with
   * an artifact and nobody in it is the half-emptied state that 063 had to
   * clean up elsewhere.
   */
  private removeAppearsIn(mediaId: string, personId: string): void {
    if (!this.hasArchiveTables()) return;
    const relationshipId = `rel_appears_in_media_${mediaId}`;

    this.db.prepare(
      "DELETE FROM relationship_members WHERE relationship_id = ? AND object_id = ? AND role = 'subject'",
    ).run(relationshipId, personId);

    const remaining = this.db.prepare(
      "SELECT COUNT(*) AS n FROM relationship_members WHERE relationship_id = ? AND role = 'subject'",
    ).get(relationshipId) as { n: number };
    if (remaining.n > 0) return;

    // Child-first, not by cascade: the application runs with foreign keys on,
    // but deleting in order keeps this correct either way.
    this.db.prepare('DELETE FROM relationship_members WHERE relationship_id = ?').run(relationshipId);
    this.db.prepare('DELETE FROM relationships WHERE id = ?').run(relationshipId);
    this.db.prepare('DELETE FROM archive_objects WHERE id = ?').run(relationshipId);
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

  linkToSource(mediaId: string, sourceId: string): SourceMedia {
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM source_media WHERE source_id = ?'
    ).get(sourceId) as { next: number };

    this.db.prepare(
      'INSERT OR IGNORE INTO source_media (source_id, media_id, sort_order, created_at) VALUES (?, ?, ?, ?)'
    ).run(sourceId, mediaId, maxOrder.next, this.now());

    return this.db.prepare(
      'SELECT * FROM source_media WHERE source_id = ? AND media_id = ?'
    ).get(sourceId, mediaId) as SourceMedia;
  }

  unlinkFromSource(mediaId: string, sourceId: string): boolean {
    return this.db.prepare(
      'DELETE FROM source_media WHERE source_id = ? AND media_id = ?'
    ).run(sourceId, mediaId).changes > 0;
  }
}
