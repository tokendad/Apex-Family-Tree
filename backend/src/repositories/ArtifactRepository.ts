import { BaseRepository } from './base.js';
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import type {
  ArtifactRecord,
  ArtifactType,
  CreateArtifactInput,
  EvidenceClassification,
  UpdateArtifactInput,
} from '../types/artifact.js';

export class ArtifactRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();

  findById(id: string): ArtifactRecord | undefined {
    return this.db.prepare(
      `SELECT ao.*, a.*,
              at.name AS artifact_type_name,
              ec.name AS evidence_classification_name
       FROM artifacts a
       INNER JOIN archive_objects ao ON ao.id = a.id
       INNER JOIN artifact_types at ON at.id = a.artifact_type_id
       LEFT JOIN evidence_classifications ec ON ec.id = a.evidence_classification_id
       WHERE a.id = ? AND ao.is_deleted = 0`,
    ).get(id) as ArtifactRecord | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string }): { data: ArtifactRecord[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit ?? 50;
    const conditions = ['ao.object_type = ?', 'ao.is_deleted = 0'];
    const params: unknown[] = ['artifact'];

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

  update(id: string, data: UpdateArtifactInput): ArtifactRecord | undefined {
    if (!this.findById(id)) return undefined;

    const updateArtifact = this.db.transaction(() => {
      this.archiveObjects.update(id, {
        title: data.title,
        summary: data.summary,
        privacy_level: data.privacy_level,
        updated_by: data.updated_by,
      });

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
