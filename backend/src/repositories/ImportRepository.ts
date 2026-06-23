import { BaseRepository } from './base.js';
import type { ImportJob, GedcomXrefMap, ImportConflict, ImportAuditLog, ExportJob } from '../types/db.js';

export class ImportRepository extends BaseRepository {
  // ─── Import Jobs ──────────────────────────────────────────────────────────

  findJobById(id: string): ImportJob | undefined {
    return this.db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(id) as ImportJob | undefined;
  }

  findJobsByUser(userId: string): ImportJob[] {
    return this.db.prepare('SELECT * FROM import_jobs WHERE user_id = ? ORDER BY created_at DESC').all(userId) as ImportJob[];
  }

  createJob(data: { user_id: string; filename: string; file_size: number }): ImportJob {
    const id = this.generateId();
    this.db.prepare(
      `INSERT INTO import_jobs (id, user_id, filename, file_size, status, total_records, processed_records, created_at)
       VALUES (?, ?, ?, ?, 'pending', 0, 0, ?)`
    ).run(id, data.user_id, data.filename, data.file_size, this.now());
    return this.findJobById(id)!;
  }

  updateJobStatus(id: string, status: ImportJob['status'], extra?: { total_records?: number; processed_records?: number; error_message?: string; gedcom_version?: string }): void {
    const fields = ['status = ?'];
    const values: unknown[] = [status];

    if (extra?.total_records !== undefined) { fields.push('total_records = ?'); values.push(extra.total_records); }
    if (extra?.processed_records !== undefined) { fields.push('processed_records = ?'); values.push(extra.processed_records); }
    if (extra?.error_message !== undefined) { fields.push('error_message = ?'); values.push(extra.error_message); }
    if (extra?.gedcom_version !== undefined) { fields.push('gedcom_version = ?'); values.push(extra.gedcom_version); }

    if (status === 'processing') { fields.push('started_at = ?'); values.push(this.now()); }
    if (status === 'completed' || status === 'failed') { fields.push('completed_at = ?'); values.push(this.now()); }

    values.push(id);
    this.db.prepare(`UPDATE import_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  incrementProcessed(id: string): void {
    this.db.prepare('UPDATE import_jobs SET processed_records = processed_records + 1 WHERE id = ?').run(id);
  }

  // ─── XREF Mapping ────────────────────────────────────────────────────────

  createXrefMapping(data: {
    import_job_id: string;
    xref: string;
    record_type: GedcomXrefMap['record_type'];
    internal_id: string;
    internal_table: string;
  }): GedcomXrefMap {
    const id = this.generateId();
    this.db.prepare(
      'INSERT INTO gedcom_xref_map (id, import_job_id, xref, record_type, internal_id, internal_table, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.import_job_id, data.xref, data.record_type, data.internal_id, data.internal_table, this.now());
    return this.db.prepare('SELECT * FROM gedcom_xref_map WHERE id = ?').get(id) as GedcomXrefMap;
  }

  findXrefMapping(importJobId: string, xref: string): GedcomXrefMap | undefined {
    return this.db.prepare(
      'SELECT * FROM gedcom_xref_map WHERE import_job_id = ? AND xref = ?'
    ).get(importJobId, xref) as GedcomXrefMap | undefined;
  }

  findXrefMappingsByJob(importJobId: string): GedcomXrefMap[] {
    return this.db.prepare('SELECT * FROM gedcom_xref_map WHERE import_job_id = ?').all(importJobId) as GedcomXrefMap[];
  }

  // ─── Conflicts ────────────────────────────────────────────────────────────

  createConflict(data: {
    import_job_id: string;
    xref: string;
    record_type: string;
    field_name: string;
    existing_value?: string;
    incoming_value?: string;
  }): ImportConflict {
    const id = this.generateId();
    this.db.prepare(
      `INSERT INTO import_conflicts (id, import_job_id, xref, record_type, field_name, existing_value, incoming_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.import_job_id, data.xref, data.record_type, data.field_name,
      data.existing_value || null, data.incoming_value || null, this.now(),
    );
    return this.db.prepare('SELECT * FROM import_conflicts WHERE id = ?').get(id) as ImportConflict;
  }

  findUnresolvedConflicts(importJobId: string): ImportConflict[] {
    return this.db.prepare(
      'SELECT * FROM import_conflicts WHERE import_job_id = ? AND resolution IS NULL'
    ).all(importJobId) as ImportConflict[];
  }

  resolveConflict(id: string, resolution: NonNullable<ImportConflict['resolution']>): void {
    this.db.prepare(
      'UPDATE import_conflicts SET resolution = ?, resolved_at = ? WHERE id = ?'
    ).run(resolution, this.now(), id);
  }

  // ─── Import Audit Log ────────────────────────────────────────────────────

  logAction(data: {
    import_job_id: string;
    action: ImportAuditLog['action'];
    record_type: string;
    xref?: string;
    internal_id?: string;
    details?: string;
  }): void {
    this.db.prepare(
      'INSERT INTO import_audit_log (import_job_id, action, record_type, xref, internal_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      data.import_job_id, data.action, data.record_type,
      data.xref || null, data.internal_id || null, data.details || null, this.now(),
    );
  }

  getAuditLog(importJobId: string): ImportAuditLog[] {
    return this.db.prepare(
      'SELECT * FROM import_audit_log WHERE import_job_id = ? ORDER BY id ASC'
    ).all(importJobId) as ImportAuditLog[];
  }

  // ─── Export Jobs ──────────────────────────────────────────────────────────

  findExportById(id: string): ExportJob | undefined {
    return this.db.prepare('SELECT * FROM export_jobs WHERE id = ?').get(id) as ExportJob | undefined;
  }

  createExportJob(data: {
    user_id: string;
    gedcom_version: ExportJob['gedcom_version'];
    scope: ExportJob['scope'];
    media_option: ExportJob['media_option'];
    scope_person_id?: string;
    scope_start_date?: string;
    scope_end_date?: string;
  }): ExportJob {
    const id = this.generateId();
    this.db.prepare(
      `INSERT INTO export_jobs (id, user_id, gedcom_version, scope, scope_person_id, scope_start_date, scope_end_date, media_option, status, total_records, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`
    ).run(
      id, data.user_id, data.gedcom_version, data.scope,
      data.scope_person_id || null, data.scope_start_date || null, data.scope_end_date || null,
      data.media_option, this.now(),
    );
    return this.findExportById(id)!;
  }

  updateExportStatus(id: string, status: ExportJob['status'], extra?: { file_path?: string; total_records?: number; error_message?: string }): void {
    const fields = ['status = ?'];
    const values: unknown[] = [status];

    if (extra?.file_path !== undefined) { fields.push('file_path = ?'); values.push(extra.file_path); }
    if (extra?.total_records !== undefined) { fields.push('total_records = ?'); values.push(extra.total_records); }
    if (extra?.error_message !== undefined) { fields.push('error_message = ?'); values.push(extra.error_message); }
    if (status === 'completed' || status === 'failed') { fields.push('completed_at = ?'); values.push(this.now()); }

    values.push(id);
    this.db.prepare(`UPDATE export_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  // ─── Merge Decisions ──────────────────────────────────────────────────────

  saveMergeDecision(data: {
    import_job_id: string; xref: string; decision: 'same' | 'new';
    candidate_person_id: string | null; field_resolutions: string;
  }): void {
    this.db.prepare(`
      INSERT INTO import_merge_decisions (import_job_id, xref, decision, candidate_person_id, field_resolutions)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(import_job_id, xref) DO UPDATE SET
        decision = excluded.decision,
        candidate_person_id = excluded.candidate_person_id,
        field_resolutions = excluded.field_resolutions
    `).run(data.import_job_id, data.xref, data.decision, data.candidate_person_id, data.field_resolutions);
  }

  findMergeDecisions(importJobId: string): Array<{
    xref: string; decision: 'same' | 'new'; candidate_person_id: string | null; field_resolutions: string;
  }> {
    return this.db.prepare(
      'SELECT xref, decision, candidate_person_id, field_resolutions FROM import_merge_decisions WHERE import_job_id = ?'
    ).all(importJobId) as Array<{ xref: string; decision: 'same' | 'new'; candidate_person_id: string | null; field_resolutions: string }>;
  }
}
