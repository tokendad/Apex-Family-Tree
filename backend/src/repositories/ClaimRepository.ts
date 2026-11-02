import { BaseRepository } from './base.js';
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import { decodeUpdatedAtCursor, encodeUpdatedAtCursor } from '../utils/cursor.js';
import type {
  AddClaimEvidenceInput,
  ClaimEvidenceRecord,
  ClaimForSubjectRecord,
  ClaimRecord,
  ClaimSubjectRecord,
  ConfidenceLevelRecord,
  CreateClaimInput,
  UpdateClaimInput,
} from '../types/claim.js';

const EVIDENCE_ROLES = new Set(['supports', 'contradicts', 'mentions', 'uncertain']);

export class ClaimRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();

  findById(id: string): ClaimRecord | undefined {
    return this.db.prepare(
      `SELECT ao.*, c.*, cl.name AS confidence_level_name, subj.title AS subject_title,
              COUNT(ce.id) AS evidence_count
       FROM claims c
       INNER JOIN archive_objects ao ON ao.id = c.id
       LEFT JOIN confidence_levels cl ON cl.id = c.confidence_level_id
       LEFT JOIN archive_objects subj ON subj.id = c.subject_object_id
       LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
       WHERE c.id = ? AND ao.is_deleted = 0
       GROUP BY c.id`,
    ).get(id) as ClaimRecord | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string }): { data: ClaimRecord[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit ?? 50;
    const conditions = ['ao.object_type = ?', 'ao.is_deleted = 0'];
    const params: unknown[] = ['claim'];

    if (options?.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(c.statement LIKE ? OR ao.title LIKE ? OR ao.summary LIKE ? OR c.notes LIKE ?)');
      params.push(term, term, term, term);
    }

    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS cnt
       FROM claims c
       INNER JOIN archive_objects ao ON ao.id = c.id
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
      `SELECT ao.*, c.*, cl.name AS confidence_level_name, subj.title AS subject_title,
              COUNT(ce.id) AS evidence_count
       FROM claims c
       INNER JOIN archive_objects ao ON ao.id = c.id
       LEFT JOIN confidence_levels cl ON cl.id = c.confidence_level_id
       LEFT JOIN archive_objects subj ON subj.id = c.subject_object_id
       LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY c.id
       ORDER BY ao.updated_at DESC, ao.id ASC
       LIMIT ?`,
    ).all(...params) as ClaimRecord[];

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const last = rows[rows.length - 1];
    return {
      data: rows,
      next_cursor: hasMore && last ? encodeUpdatedAtCursor(last.updated_at, last.id) : null,
      total_count: countRow.cnt,
    };
  }

  create(data: CreateClaimInput): ClaimRecord {
    const createClaim = this.db.transaction(() => {
      const archiveObject = this.archiveObjects.create({
        object_type: 'claim',
        title: data.title?.trim() || data.statement,
        summary: data.summary ?? null,
        privacy_level: data.privacy_level ?? 'family',
        created_by: data.created_by ?? null,
      });

      this.db.prepare(
        `INSERT INTO claims (
          id, statement, claim_type, subject_object_id, date_text, date_start, date_end,
          confidence_level_id, confidence_score, status, notes, research_section
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        archiveObject.id,
        data.statement,
        data.claim_type ?? null,
        data.subject_object_id ?? null,
        data.date_text ?? null,
        data.date_start ?? null,
        data.date_end ?? null,
        data.confidence_level_id ?? 'confidence_unknown',
        data.confidence_score ?? null,
        data.status ?? 'open',
        data.notes ?? null,
        data.research_section ?? null,
      );

      if (data.subject_object_id) {
        this.addSubject(archiveObject.id, data.subject_object_id, 'subject');
      }

      if (data.governs_object_id !== undefined) {
        this.setGovernedObject(archiveObject.id, data.governs_object_id);
      }

      return archiveObject.id;
    });

    return this.findById(createClaim())!;
  }

  update(id: string, data: UpdateClaimInput): ClaimRecord | undefined {
    if (!this.findById(id)) return undefined;

    const updateClaim = this.db.transaction(() => {
      this.archiveObjects.update(id, {
        title: data.title,
        summary: data.summary,
        privacy_level: data.privacy_level,
        updated_by: data.updated_by,
      });

      const fields: string[] = [];
      const values: unknown[] = [];
      for (const key of [
        'statement', 'claim_type', 'subject_object_id', 'date_text', 'date_start', 'date_end',
        'confidence_level_id', 'confidence_score', 'status', 'notes', 'research_section',
      ] as const) {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(data[key]);
        }
      }

      if (fields.length > 0) {
        values.push(id);
        this.db.prepare(`UPDATE claims SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }

      if (data.subject_object_id !== undefined) {
        this.db.prepare('DELETE FROM claim_subjects WHERE claim_id = ? AND role = ?').run(id, 'subject');
        if (data.subject_object_id) this.addSubject(id, data.subject_object_id, 'subject');
      }

      if (data.governs_object_id !== undefined) {
        this.setGovernedObject(id, data.governs_object_id);
      }
    });

    updateClaim();
    return this.findById(id);
  }

  delete(id: string, updatedBy?: string | null): boolean {
    return this.archiveObjects.softDelete(id, updatedBy);
  }

  findSubjects(claimId: string): ClaimSubjectRecord[] {
    return this.db.prepare(
      `SELECT cs.*, ao.object_type, ao.title, ao.summary
       FROM claim_subjects cs
       INNER JOIN archive_objects ao ON ao.id = cs.subject_object_id
       WHERE cs.claim_id = ? AND ao.is_deleted = 0 AND cs.role <> 'governs'
       ORDER BY cs.role ASC, ao.title ASC`,
    ).all(claimId) as ClaimSubjectRecord[];
  }

  addSubject(claimId: string, subjectObjectId: string, role = 'subject'): ClaimSubjectRecord {
    if (!this.findById(claimId)) throw new Error('Claim not found');
    if (!this.archiveObjects.findById(subjectObjectId)) throw new Error('Subject archive object not found');

    const id = this.generateId();
    this.db.prepare('INSERT INTO claim_subjects (id, claim_id, subject_object_id, role) VALUES (?, ?, ?, ?)')
      .run(id, claimId, subjectObjectId, role);
    return this.findSubjects(claimId).find(row => row.id === id)!;
  }

  /**
   * Says which event's displayed fact this claim governs (#52).
   *
   * Stored as a claim_subjects row with role = 'governs' rather than a column
   * of its own: the table already joins a claim to an archive object with a
   * role, role is unconstrained text, and a claim governs at most one fact --
   * so this replaces every governs row rather than adding one. Passing null
   * clears the link, which is what "match it by year again" means.
   *
   * A governs row is a pointer and not an assertion about the event, so
   * findClaimsForSubject and findUnsettledSubjectIds both skip this role. An
   * event must not start listing a person's claims as its own, and must not put
   * an unsettled mark on a tree card.
   */
  setGovernedObject(claimId: string, objectId: string | null): void {
    if (!this.findById(claimId)) throw new Error('Claim not found');

    this.db.prepare('DELETE FROM claim_subjects WHERE claim_id = ? AND role = ?')
      .run(claimId, 'governs');
    if (!objectId) return;

    const target = this.archiveObjects.findById(objectId);
    if (!target) throw new Error('Governed archive object not found');
    /* Only an event has a date displayed on the person page, which is the fact
       this link marks. Allowing anything else would store a link nothing reads. */
    if (target.object_type !== 'event') throw new Error('A claim can only govern an event');

    this.db.prepare('INSERT INTO claim_subjects (id, claim_id, subject_object_id, role) VALUES (?, ?, ?, ?)')
      .run(this.generateId(), claimId, objectId, 'governs');
  }

  /** The event this claim governs, or null if there is none or it is deleted. */
  findGovernedObjectId(claimId: string): string | null {
    const row = this.db.prepare(
      `SELECT cs.subject_object_id AS id
         FROM claim_subjects cs
         INNER JOIN archive_objects ao ON ao.id = cs.subject_object_id
        WHERE cs.claim_id = ? AND cs.role = 'governs' AND ao.is_deleted = 0`,
    ).get(claimId) as { id: string } | undefined;
    return row?.id ?? null;
  }

  findEvidence(claimId: string): ClaimEvidenceRecord[] {
    return this.db.prepare(
      `SELECT ce.*, ao.object_type, ao.title, ao.summary, ec.name AS evidence_classification_name
       FROM claim_evidence ce
       INNER JOIN archive_objects ao ON ao.id = ce.evidence_object_id
       LEFT JOIN evidence_classifications ec ON ec.id = ce.evidence_classification_id
       WHERE ce.claim_id = ? AND ao.is_deleted = 0
       ORDER BY ce.evidence_role ASC, ao.title ASC`,
    ).all(claimId) as ClaimEvidenceRecord[];
  }

  findClaimsForEvidence(evidenceObjectId: string): ClaimRecord[] {
    return this.db.prepare(
      `SELECT ao.*, c.*, cl.name AS confidence_level_name, subj.title AS subject_title,
              COUNT(all_evidence.id) AS evidence_count
       FROM claim_evidence ce
       INNER JOIN claims c ON c.id = ce.claim_id
       INNER JOIN archive_objects ao ON ao.id = c.id
       LEFT JOIN confidence_levels cl ON cl.id = c.confidence_level_id
       LEFT JOIN archive_objects subj ON subj.id = c.subject_object_id
       LEFT JOIN claim_evidence all_evidence ON all_evidence.claim_id = c.id
       WHERE ce.evidence_object_id = ? AND ao.is_deleted = 0
       GROUP BY c.id
       ORDER BY ao.updated_at DESC, ao.id ASC`,
    ).all(evidenceObjectId) as ClaimRecord[];
  }

  /* Claims about one archive object, however they were attached: claims carry a
     single subject_object_id, and claim_subjects carries the rest, so a claim
     reached only through the join table must appear here too. */
  findClaimsForSubject(subjectObjectId: string): ClaimForSubjectRecord[] {
    return this.db.prepare(
      `SELECT ao.*, c.*, cl.name AS confidence_level_name, subj.title AS subject_title,
              COUNT(ce.id) AS evidence_count,
              SUM(CASE WHEN ce.evidence_role = 'supports' THEN 1 ELSE 0 END) AS supporting_count,
              SUM(CASE WHEN ce.evidence_role = 'contradicts' THEN 1 ELSE 0 END) AS contradicting_count,
              (SELECT gs.subject_object_id
                 FROM claim_subjects gs
                 INNER JOIN archive_objects gao ON gao.id = gs.subject_object_id
                WHERE gs.claim_id = c.id AND gs.role = 'governs' AND gao.is_deleted = 0
                LIMIT 1) AS governs_object_id
       FROM claims c
       INNER JOIN archive_objects ao ON ao.id = c.id
       LEFT JOIN confidence_levels cl ON cl.id = c.confidence_level_id
       LEFT JOIN archive_objects subj ON subj.id = c.subject_object_id
       LEFT JOIN claim_evidence ce ON ce.claim_id = c.id
       WHERE ao.is_deleted = 0
         AND (c.subject_object_id = ?
              OR EXISTS (SELECT 1 FROM claim_subjects cs
                          WHERE cs.claim_id = c.id AND cs.subject_object_id = ?
                            AND cs.role <> 'governs'))
       GROUP BY c.id
       ORDER BY ao.updated_at DESC, ao.id ASC`,
    ).all(subjectObjectId, subjectObjectId) as ClaimForSubjectRecord[];
  }

  /* The subjects of every claim that is not settled, for marking tree cards
     (#52). Confirmed and Rejected are both settled -- one is established, the
     other has been ruled out -- so neither puts a mark on a card. A claim with
     no confidence level yet counts as unsettled: ungraded is not the same as
     agreed.

     Returns ids rather than claims because the caller only needs to know which
     people to mark, and a tree can hold hundreds of cards. */
  findUnsettledSubjectIds(): string[] {
    const rows = this.db.prepare(
      `SELECT DISTINCT s.subject_object_id AS id
         FROM (
           SELECT c.id AS claim_id, c.subject_object_id
             FROM claims c WHERE c.subject_object_id IS NOT NULL
           UNION
           SELECT cs.claim_id, cs.subject_object_id FROM claim_subjects cs
            WHERE cs.role <> 'governs'
         ) s
         JOIN claims c ON c.id = s.claim_id
         JOIN archive_objects ao ON ao.id = c.id AND ao.is_deleted = 0
         LEFT JOIN confidence_levels cl ON cl.id = c.confidence_level_id
        WHERE cl.id IS NULL
           OR cl.id NOT IN ('confidence_confirmed', 'confidence_rejected')`,
    ).all() as { id: string }[];
    return rows.map(row => row.id);
  }

  addEvidence(claimId: string, data: AddClaimEvidenceInput): ClaimEvidenceRecord {
    if (!this.findById(claimId)) throw new Error('Claim not found');
    const evidence = this.archiveObjects.findById(data.evidence_object_id);
    if (!evidence) throw new Error('Evidence archive object not found');
    if (evidence.object_type !== 'artifact') throw new Error('Claim evidence must be an artifact in this phase');
    const role = data.evidence_role ?? 'supports';
    if (!EVIDENCE_ROLES.has(role)) throw new Error('Invalid evidence role');

    const id = this.generateId();
    this.db.prepare(
      `INSERT INTO claim_evidence (
        id, claim_id, evidence_object_id, evidence_role, evidence_classification_id,
        excerpt, locator, weight_score, confidence_contribution, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      claimId,
      data.evidence_object_id,
      role,
      data.evidence_classification_id ?? null,
      data.excerpt ?? null,
      data.locator ?? null,
      data.weight_score ?? null,
      data.confidence_contribution ?? null,
      data.notes ?? null,
    );

    return this.findEvidence(claimId).find(row => row.id === id)!;
  }

  removeEvidence(claimId: string, evidenceId: string): boolean {
    return this.db.prepare('DELETE FROM claim_evidence WHERE claim_id = ? AND id = ?').run(claimId, evidenceId).changes > 0;
  }

  findConfidenceLevels(): ConfidenceLevelRecord[] {
    return this.db.prepare('SELECT * FROM confidence_levels ORDER BY sort_order ASC, name ASC').all() as ConfidenceLevelRecord[];
  }
}
