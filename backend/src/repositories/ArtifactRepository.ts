import { BaseRepository } from './base.js';
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import type {
  ArtifactFile,
  ArtifactIdentificationEntry,
  ArtifactRecord,
  ArtifactType,
  CreateArtifactInput,
  CreateIdentificationInput,
  EvidenceClassification,
  UpdateArtifactInput,
} from '../types/artifact.js';

export class ArtifactRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();

  /**
   * artifact_files arrived with the archive-model migrations. Schemas that
   * predate them -- and the narrower fixtures some repository tests build --
   * simply have no files, which is not an error. EventRepository guards its
   * archive_objects access the same way.
   */
  private hasArtifactFilesTable(): boolean {
    return Boolean(
      this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'artifact_files'",
      ).get(),
    );
  }

  findById(id: string): ArtifactRecord | undefined {
    const artifact = this.db.prepare(
      `SELECT ao.*, a.*,
              at.name AS artifact_type_name,
              ec.name AS evidence_classification_name
       FROM artifacts a
       INNER JOIN archive_objects ao ON ao.id = a.id
       INNER JOIN artifact_types at ON at.id = a.artifact_type_id
       LEFT JOIN evidence_classifications ec ON ec.id = a.evidence_classification_id
       WHERE a.id = ? AND ao.is_deleted = 0`,
    ).get(id) as ArtifactRecord | undefined;

    if (!artifact) return undefined;
    // Fetched separately rather than as another JOIN: an artifact may have
    // several files, and joining would multiply the artifact row by each one.
    return { ...artifact, files: this.findFiles(id) };
  }

  /**
   * The files belonging to an artifact, primary first.
   *
   * artifact_files is the complete record -- every artifact has a row here by
   * construction, whereas the overlap with media_items is an accident of how
   * the bridge migrations built it and is not maintained. See findPrimaryFile.
   */
  findFiles(artifactId: string): ArtifactFile[] {
    if (!this.hasArtifactFilesTable()) return [];
    return this.db.prepare(
      `SELECT id, artifact_id, file_role, storage_provider, storage_path,
              original_filename, mime_type, size_bytes, width, height, created_at
       FROM artifact_files
       WHERE artifact_id = ?
       ORDER BY CASE file_role WHEN 'primary' THEN 0 ELSE 1 END, created_at ASC, id ASC`,
    ).all(artifactId) as ArtifactFile[];
  }

  /** The file an artifact page displays, or undefined if it has none. */
  findPrimaryFile(artifactId: string): ArtifactFile | undefined {
    if (!this.hasArtifactFilesTable()) return undefined;
    return this.db.prepare(
      `SELECT id, artifact_id, file_role, storage_provider, storage_path,
              original_filename, mime_type, size_bytes, width, height, created_at
       FROM artifact_files
       WHERE artifact_id = ? AND file_role = 'primary'
       ORDER BY created_at ASC, id ASC
       LIMIT 1`,
    ).get(artifactId) as ArtifactFile | undefined;
  }

  /** The thumbnail an artifact's card shows, or undefined if none was generated. */
  findThumbnailFile(artifactId: string): ArtifactFile | undefined {
    if (!this.hasArtifactFilesTable()) return undefined;
    return this.db.prepare(
      `SELECT id, artifact_id, file_role, storage_provider, storage_path,
              original_filename, mime_type, size_bytes, width, height, created_at
       FROM artifact_files
       WHERE artifact_id = ? AND file_role = 'thumbnail'
       ORDER BY created_at ASC, id ASC
       LIMIT 1`,
    ).get(artifactId) as ArtifactFile | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string; typeId?: string }): { data: ArtifactRecord[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit ?? 50;
    const conditions = ['ao.object_type = ?', 'ao.is_deleted = 0'];
    const params: unknown[] = ['artifact'];

    // Applied before the count query so total_count reflects the filtered set,
    // which is what the UI shows next to the active type.
    if (options?.typeId?.trim()) {
      conditions.push('a.artifact_type_id = ?');
      params.push(options.typeId.trim());
    }

    if (options?.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(ao.title LIKE ? OR ao.summary LIKE ? OR a.notes LIKE ? OR a.creator_text LIKE ? OR a.physical_location LIKE ?)');
      params.push(term, term, term, term, term);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS cnt
       FROM artifacts a
       INNER JOIN archive_objects ao ON ao.id = a.id
       ${whereClause}`,
    ).get(...params) as { cnt: number };

    if (options?.cursor) {
      conditions.push('ao.id > ?');
      params.push(options.cursor);
    }

    params.push(limit + 1);
    const rows = this.db.prepare(
      `SELECT ao.*, a.*,
              at.name AS artifact_type_name,
              ec.name AS evidence_classification_name
       FROM artifacts a
       INNER JOIN archive_objects ao ON ao.id = a.id
       INNER JOIN artifact_types at ON at.id = a.artifact_type_id
       LEFT JOIN evidence_classifications ec ON ec.id = a.evidence_classification_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ao.id ASC
       LIMIT ?`,
    ).all(...params) as ArtifactRecord[];

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return {
      data: rows,
      next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null,
      total_count: countRow.cnt,
    };
  }

  create(data: CreateArtifactInput): ArtifactRecord {
    const createArtifact = this.db.transaction(() => {
      const archiveObject = this.archiveObjects.create({
        object_type: 'artifact',
        title: data.title,
        summary: data.summary ?? null,
        privacy_level: data.privacy_level ?? 'family',
        created_by: data.created_by ?? null,
      });

      this.db.prepare(
        `INSERT INTO artifacts (
          id, artifact_type_id, evidence_classification_id, original_date_text,
          original_date_start, original_date_end, date_precision, date_qualifier,
          creator_text, physical_location, original_format, condition_notes,
          language, transcription, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        archiveObject.id,
        data.artifact_type_id,
        data.evidence_classification_id ?? null,
        data.original_date_text ?? null,
        data.original_date_start ?? null,
        data.original_date_end ?? null,
        data.date_precision ?? null,
        data.date_qualifier ?? null,
        data.creator_text ?? null,
        data.physical_location ?? null,
        data.original_format ?? null,
        data.condition_notes ?? null,
        data.language ?? null,
        data.transcription ?? null,
        data.notes ?? null,
      );

      return archiveObject.id;
    });

    return this.findById(createArtifact())!;
  }

  /**
   * Artifacts with a non-empty transcription, for #73 Phase 3's suggestion
   * scan to read facts out of. `excludeIds` is every artifact a scan has
   * already suggested from before (whatever the outcome), so a repeat scan
   * doesn't keep re-suggesting the same ones.
   */
  findWithTranscription(excludeIds: string[], limit: number): { id: string; title: string; transcription: string }[] {
    const exclusion = excludeIds.length > 0 ? `AND a.id NOT IN (${excludeIds.map(() => '?').join(',')})` : '';
    return this.db.prepare(
      `SELECT a.id, ao.title, a.transcription
       FROM artifacts a
       INNER JOIN archive_objects ao ON ao.id = a.id
       WHERE ao.is_deleted = 0 AND a.transcription IS NOT NULL AND TRIM(a.transcription) != ''
       ${exclusion}
       ORDER BY ao.id ASC
       LIMIT ?`,
    ).all(...excludeIds, limit) as { id: string; title: string; transcription: string }[];
  }

  /**
   * Artifact count for every type, including types with no artifacts.
   *
   * The LEFT JOIN matters: the filter UI needs to show empty types (and
   * Uncategorized when it has been worked down to zero) rather than silently
   * dropping them, so counts come from artifact_types outwards.
   */
  countsByType(): Array<{ id: string; name: string; icon: string | null; sort_order: number; count: number }> {
    return this.db.prepare(
      `SELECT t.id, t.name, t.icon, t.sort_order, COUNT(a.id) AS count
       FROM artifact_types t
       LEFT JOIN artifacts a ON a.artifact_type_id = t.id
       LEFT JOIN archive_objects ao ON ao.id = a.id AND ao.is_deleted = 0
       GROUP BY t.id
       ORDER BY t.sort_order ASC, t.name ASC`,
    ).all() as Array<{ id: string; name: string; icon: string | null; sort_order: number; count: number }>;
  }

  /**
   * Reassigns the type of many artifacts at once.
   *
   * Runs in a single transaction so a partial re-type cannot be left behind:
   * the point of the bulk tool is working a queue down, and a half-applied batch
   * would leave no way to tell which rows were done.
   *
   * Returns the number of rows actually changed, which may be fewer than the ids
   * passed if some were deleted or never existed.
   */
  bulkUpdateType(ids: string[], artifactTypeId: string, updatedBy: string | null): number {
    if (ids.length === 0) return 0;

    const apply = this.db.transaction(() => {
      let changed = 0;
      const setType = this.db.prepare('UPDATE artifacts SET artifact_type_id = ? WHERE id = ?');

      for (const id of ids) {
        if (!this.findById(id)) continue;
        setType.run(artifactTypeId, id);
        // Keep the archive object's audit trail in step with the type change.
        this.archiveObjects.update(id, { updated_by: updatedBy });
        changed += 1;
      }

      return changed;
    });

    return apply();
  }

  /**
   * identified_person_id and identifier_person_id are both nullable and
   * independent: the former is who the entry is about, which may be no one
   * in particular ("probably Grade 6"); the latter is who made the call.
   * Narrower fixtures that don't carry the archive/confidence tables are
   * guarded the same way artifact_files is.
   */
  private hasIdentificationHistoryTable(): boolean {
    return Boolean(
      this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'artifact_identification_history'",
      ).get(),
    );
  }

  /** Newest first: the point of the history is seeing how understanding of
   * an artifact has developed, which reads naturally most-recent-on-top. */
  listIdentifications(artifactId: string): ArtifactIdentificationEntry[] {
    if (!this.hasIdentificationHistoryTable()) return [];
    return this.db.prepare(
      `SELECT h.id, h.artifact_id, h.identified_person_id, ip.title AS identified_person_name,
              h.identifier_person_id, ir.title AS identifier_person_name,
              h.confidence_level_id, cl.name AS confidence_level_name,
              h.note, h.created_by, h.created_at
       FROM artifact_identification_history h
       LEFT JOIN archive_objects ip ON ip.id = h.identified_person_id
       LEFT JOIN archive_objects ir ON ir.id = h.identifier_person_id
       LEFT JOIN confidence_levels cl ON cl.id = h.confidence_level_id
       WHERE h.artifact_id = ?
       ORDER BY h.created_at DESC, h.id DESC`,
    ).all(artifactId) as ArtifactIdentificationEntry[];
  }

  /**
   * Appends one identification entry. Never updates or deletes a row --
   * the table's own triggers forbid it -- so correcting an identification
   * means recording a new entry, which is the point: the history itself is
   * what's being preserved.
   */
  addIdentification(artifactId: string, data: CreateIdentificationInput): ArtifactIdentificationEntry {
    if (!this.findById(artifactId)) {
      throw new Error('Artifact not found');
    }
    if (!data.note?.trim()) {
      throw new Error('note is required');
    }
    if (data.identified_person_id && !this.db.prepare('SELECT 1 FROM archive_objects WHERE id = ?').get(data.identified_person_id)) {
      throw new Error('identified_person_id does not exist');
    }
    if (data.identifier_person_id && !this.db.prepare('SELECT 1 FROM archive_objects WHERE id = ?').get(data.identifier_person_id)) {
      throw new Error('identifier_person_id does not exist');
    }
    if (data.confidence_level_id && !this.db.prepare('SELECT 1 FROM confidence_levels WHERE id = ?').get(data.confidence_level_id)) {
      throw new Error('confidence_level_id does not exist');
    }

    const id = this.generateId();
    this.db.prepare(
      `INSERT INTO artifact_identification_history
        (id, artifact_id, identified_person_id, identifier_person_id, confidence_level_id, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      artifactId,
      data.identified_person_id ?? null,
      data.identifier_person_id ?? null,
      data.confidence_level_id ?? null,
      data.note.trim(),
      data.created_by ?? null,
    );

    return this.listIdentifications(artifactId).find((entry) => entry.id === id)!;
  }

  /**
   * Narrower fixtures bridge no media at all. Guarded like artifact_files.
   */
  private hasMediaItemsTable(): boolean {
    return Boolean(
      this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_items'",
      ).get(),
    );
  }

  /**
   * Write a retitled artifact back to its media row, when it has one.
   *
   * The two pages read different tables -- the Media gallery shows
   * media_items.title, the catalogue shows archive_objects.title -- so a title
   * written to only one of them leaves them disagreeing. Worse,
   * MediaRepository.syncArtifact rebuilds the catalogue entry from the media
   * row on any media edit, so a title stored only in archive_objects is
   * reverted to the filename the next time someone sets a date or a
   * description. Mirroring is what keeps both readers right and keeps that
   * sync honest; see #42.
   *
   * The id match is the whole guard: an artifact created through this API
   * alone has no media row (see the note on GET /artifacts/:id/file) and
   * simply matches nothing.
   */
  private mirrorToMediaItem(id: string, data: UpdateArtifactInput): void {
    if (data.title === undefined && data.summary === undefined) return;
    if (!this.hasMediaItemsTable()) return;

    const fields: string[] = [];
    const values: unknown[] = [];

    // Trimmed to match what ArchiveObjectRepository.update stores, so the two
    // copies are byte-identical rather than merely equivalent.
    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title.trim());
    }

    // archive_objects.summary is media_items.description: same field, two names.
    if (data.summary !== undefined) {
      fields.push('description = ?');
      values.push(data.summary);
    }

    fields.push('updated_at = ?');
    values.push(this.now(), id);

    this.db.prepare(`UPDATE media_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  update(id: string, data: UpdateArtifactInput): ArtifactRecord | undefined {
    if (!this.findById(id)) return undefined;

    const updateArtifact = this.db.transaction(() => {
      this.archiveObjects.update(id, {
        title: data.title,
        summary: data.summary,
        privacy_level: data.privacy_level,
        updated_by: data.updated_by,
      });

      this.mirrorToMediaItem(id, data);

      const fields: string[] = [];
      const values: unknown[] = [];
      for (const key of [
        'artifact_type_id',
        'evidence_classification_id',
        'original_date_text',
        'original_date_start',
        'original_date_end',
        'date_precision',
        'date_qualifier',
        'creator_text',
        'physical_location',
        'original_format',
        'condition_notes',
        'language',
        'transcription',
        'notes',
        'digitized_at',
        'provenance_confidence_notes',
      ] as const) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      }

      if (fields.length > 0) {
        values.push(id);
        this.db.prepare(`UPDATE artifacts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }
    });

    updateArtifact();
    return this.findById(id);
  }

  delete(id: string, updatedBy?: string | null): boolean {
    return this.archiveObjects.softDelete(id, updatedBy);
  }

  findArtifactTypes(): ArtifactType[] {
    return this.db.prepare('SELECT * FROM artifact_types ORDER BY sort_order ASC, name ASC').all() as ArtifactType[];
  }

  findEvidenceClassifications(): EvidenceClassification[] {
    return this.db.prepare('SELECT * FROM evidence_classifications ORDER BY sort_order ASC, name ASC').all() as EvidenceClassification[];
  }
}
