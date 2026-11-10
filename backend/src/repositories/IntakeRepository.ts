import { BaseRepository } from './base.js';
import type { IntakeConflict, IntakeItem, IntakeProposal, ProposalDecision, ProposalPayload, ProposalType, RawProposal } from '../types/intake.js';

interface IntakeProposalRow {
  id: string;
  intake_item_id: string;
  proposal_type: ProposalType;
  payload: string;
  confidence: number | null;
  decision: ProposalDecision | null;
  edited_payload: string | null;
  committed_object_id: string | null;
  created_at: string;
  decided_at: string | null;
}

function parseProposal(row: IntakeProposalRow): IntakeProposal {
  return {
    ...row,
    payload: JSON.parse(row.payload) as ProposalPayload,
    edited_payload: row.edited_payload ? (JSON.parse(row.edited_payload) as ProposalPayload) : null,
  };
}

export class IntakeRepository extends BaseRepository {
  createItem(data: {
    created_by: string | null;
    source_text: string;
    source_hash: string;
    source_file_path?: string | null;
    source_file_mime_type?: string | null;
    source_file_original_name?: string | null;
  }): IntakeItem {
    const id = this.generateId();
    this.db.prepare(
      `INSERT INTO intake_items (
        id, created_by, source_text, source_hash,
        source_file_path, source_file_mime_type, source_file_original_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, data.created_by, data.source_text, data.source_hash,
      data.source_file_path ?? null, data.source_file_mime_type ?? null, data.source_file_original_name ?? null,
      this.now(),
    );
    return this.findItemById(id)!;
  }

  findItemById(id: string): IntakeItem | undefined {
    return this.db.prepare('SELECT * FROM intake_items WHERE id = ?').get(id) as IntakeItem | undefined;
  }

  /** Most recent first, for the AI Assistant panel's transcript history. */
  findAllItems(limit = 50): IntakeItem[] {
    return this.db.prepare('SELECT * FROM intake_items ORDER BY created_at DESC, id DESC LIMIT ?').all(limit) as IntakeItem[];
  }

  /** Items left 'pending' or 'extracting' by a process that never came back
   *  -- same situation ai_jobs sweeps for, and for the same reason: nothing
   *  will ever resume a setImmediate-deferred call after a restart. */
  findOrphanedItems(): IntakeItem[] {
    return this.db.prepare(`SELECT * FROM intake_items WHERE status IN ('pending', 'extracting')`).all() as IntakeItem[];
  }

  /** A pending/awaiting-review item with the same source text, so a
   *  resubmission is recognized rather than re-billing the LLM. */
  findPendingByHash(hash: string): IntakeItem | undefined {
    return this.db.prepare(
      `SELECT * FROM intake_items WHERE source_hash = ? AND status IN ('pending', 'extracting', 'awaiting_review')
       ORDER BY created_at DESC LIMIT 1`,
    ).get(hash) as IntakeItem | undefined;
  }

  setStatus(id: string, status: IntakeItem['status']): void {
    this.db.prepare('UPDATE intake_items SET status = ? WHERE id = ?').run(status, id);
  }

  setSourceArtifact(id: string, sourceArtifactId: string): void {
    this.db.prepare('UPDATE intake_items SET source_artifact_id = ? WHERE id = ?').run(sourceArtifactId, id);
  }

  /** Called once a staged upload has either become the committed artifact's
   *  file or been deleted off disk (extraction failure, all-rejected
   *  commit) -- either way nothing should keep pointing at it afterward. */
  clearSourceFile(id: string): void {
    this.db.prepare(
      `UPDATE intake_items SET source_file_path = NULL, source_file_mime_type = NULL, source_file_original_name = NULL WHERE id = ?`,
    ).run(id);
  }

  setAiJob(id: string, aiJobId: string): void {
    this.db.prepare('UPDATE intake_items SET ai_job_id = ? WHERE id = ?').run(aiJobId, id);
  }

  markCommitted(id: string): void {
    this.db.prepare(`UPDATE intake_items SET status = 'committed', committed_at = ? WHERE id = ?`).run(this.now(), id);
  }

  createProposals(intakeItemId: string, proposals: RawProposal[]): IntakeProposal[] {
    const insert = this.db.prepare(
      `INSERT INTO intake_proposals (id, intake_item_id, proposal_type, payload, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const ids: string[] = [];
    const run = this.db.transaction(() => {
      for (const proposal of proposals) {
        const id = this.generateId();
        insert.run(id, intakeItemId, proposal.proposal_type, JSON.stringify(proposal.payload), proposal.confidence, this.now());
        ids.push(id);
      }
    });
    run();
    return ids.map((id) => this.findProposalById(id)!);
  }

  findProposalById(id: string): IntakeProposal | undefined {
    const row = this.db.prepare('SELECT * FROM intake_proposals WHERE id = ?').get(id) as IntakeProposalRow | undefined;
    return row ? parseProposal(row) : undefined;
  }

  findProposalsByItem(intakeItemId: string): IntakeProposal[] {
    const rows = this.db.prepare(
      'SELECT * FROM intake_proposals WHERE intake_item_id = ? ORDER BY created_at ASC, id ASC',
    ).all(intakeItemId) as IntakeProposalRow[];
    return rows.map(parseProposal);
  }

  recordDecision(proposalId: string, decision: ProposalDecision, editedPayload: ProposalPayload | null): void {
    this.db.prepare(
      `UPDATE intake_proposals SET decision = ?, edited_payload = ?, decided_at = ? WHERE id = ?`,
    ).run(decision, editedPayload ? JSON.stringify(editedPayload) : null, this.now(), proposalId);
  }

  setCommittedObjectId(proposalId: string, objectId: string): void {
    this.db.prepare('UPDATE intake_proposals SET committed_object_id = ? WHERE id = ?').run(objectId, proposalId);
  }

  createConflict(data: {
    intake_item_id: string;
    proposal_id: string;
    record_type: string;
    field_name: string;
    existing_value: string | null;
    incoming_value: string | null;
  }): IntakeConflict {
    const id = this.generateId();
    this.db.prepare(
      `INSERT INTO intake_conflicts (id, intake_item_id, proposal_id, record_type, field_name, existing_value, incoming_value, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, data.intake_item_id, data.proposal_id, data.record_type, data.field_name, data.existing_value, data.incoming_value, this.now());
    return this.db.prepare('SELECT * FROM intake_conflicts WHERE id = ?').get(id) as IntakeConflict;
  }

  findConflictsByItem(intakeItemId: string): IntakeConflict[] {
    return this.db.prepare(
      'SELECT * FROM intake_conflicts WHERE intake_item_id = ? ORDER BY created_at ASC, id ASC',
    ).all(intakeItemId) as IntakeConflict[];
  }
}
