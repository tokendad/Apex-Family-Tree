import { BaseRepository } from './base.js';
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import type {
  ConnectedObjectRecord,
  CreateRelationshipInput,
  RelationshipMemberInput,
  RelationshipMemberRecord,
  RelationshipRecord,
  RelationshipType,
  RelationshipTypeRole,
} from '../types/relationship.js';

export class RelationshipRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();

  findTypeByCode(code: string): RelationshipType | undefined {
    return this.db.prepare('SELECT * FROM relationship_types WHERE code = ?').get(code) as RelationshipType | undefined;
  }

  findTypeById(id: string): RelationshipType | undefined {
    return this.db.prepare('SELECT * FROM relationship_types WHERE id = ?').get(id) as RelationshipType | undefined;
  }

  findTypeRoles(relationshipTypeId: string): RelationshipTypeRole[] {
    return this.db.prepare(
      'SELECT * FROM relationship_type_roles WHERE relationship_type_id = ? ORDER BY sort_order ASC, role ASC',
    ).all(relationshipTypeId) as RelationshipTypeRole[];
  }

  findObjectType(objectId: string): string | undefined {
    const row = this.db.prepare('SELECT object_type FROM archive_objects WHERE id = ? AND is_deleted = 0').get(objectId) as { object_type: string } | undefined;
    return row?.object_type;
  }

  create(data: CreateRelationshipInput & { relationship_type_id: string; title: string }): RelationshipRecord {
    const createRelationship = this.db.transaction(() => {
      const archiveObject = this.archiveObjects.create({
        object_type: 'relationship',
        title: data.title,
        summary: data.description ?? null,
        privacy_level: 'family',
        created_by: data.created_by ?? null,
      });

      this.db.prepare(
        `INSERT INTO relationships (
          id, relationship_type_id, label, description, date_text, date_start, date_end,
          date_precision, date_qualifier, confidence_level_id, confidence_score, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        archiveObject.id,
        data.relationship_type_id,
        data.label ?? null,
        data.description ?? null,
        data.date_text ?? null,
        data.date_start ?? null,
        data.date_end ?? null,
        data.date_precision ?? null,
        data.date_qualifier ?? null,
        data.confidence_level_id ?? null,
        data.confidence_score ?? null,
        data.notes ?? null,
      );

      data.members.forEach((member, index) => this.addMember(archiveObject.id, member, index));
      return archiveObject.id;
    });

    return this.findById(createRelationship())!;
  }

  private addMember(relationshipId: string, member: RelationshipMemberInput, fallbackOrder: number): void {
    this.db.prepare(
      `INSERT INTO relationship_members (id, relationship_id, object_id, role, sort_order, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      this.generateId(),
      relationshipId,
      member.object_id,
      member.role,
      member.sort_order ?? fallbackOrder,
      member.notes ?? null,
    );
  }

  findById(id: string): RelationshipRecord | undefined {
    const row = this.db.prepare(
      `SELECT ao.*, r.*, rt.code AS relationship_type_code, rt.name AS relationship_type_name
       FROM relationships r
       INNER JOIN archive_objects ao ON ao.id = r.id
       INNER JOIN relationship_types rt ON rt.id = r.relationship_type_id
       WHERE r.id = ? AND ao.is_deleted = 0`,
    ).get(id) as Omit<RelationshipRecord, 'members'> | undefined;

    if (!row) return undefined;
    return { ...row, members: this.findMembers(id) };
  }

  findMembers(relationshipId: string): RelationshipMemberRecord[] {
    return this.db.prepare(
      `SELECT rm.*, ao.object_type, ao.title AS object_title
       FROM relationship_members rm
       INNER JOIN archive_objects ao ON ao.id = rm.object_id
       WHERE rm.relationship_id = ? AND ao.is_deleted = 0
       ORDER BY rm.sort_order ASC, rm.id ASC`,
    ).all(relationshipId) as RelationshipMemberRecord[];
  }

  findForObject(objectId: string): RelationshipRecord[] {
    const rows = this.db.prepare(
      `SELECT DISTINCT ao.*, r.*, rt.code AS relationship_type_code, rt.name AS relationship_type_name
       FROM relationships r
       INNER JOIN archive_objects ao ON ao.id = r.id
       INNER JOIN relationship_types rt ON rt.id = r.relationship_type_id
       INNER JOIN relationship_members rm ON rm.relationship_id = r.id
       WHERE rm.object_id = ? AND ao.is_deleted = 0
       ORDER BY ao.updated_at DESC, ao.id ASC`,
    ).all(objectId) as Omit<RelationshipRecord, 'members'>[];

    return rows.map(row => ({ ...row, members: this.findMembers(row.id) }));
  }

  findConnectedObjects(objectId: string, relationshipTypeCode?: string): ConnectedObjectRecord[] {
    const params: unknown[] = [objectId, objectId];
    const typeFilter = relationshipTypeCode ? 'AND rt.code = ?' : '';
    if (relationshipTypeCode) params.push(relationshipTypeCode);

    return this.db.prepare(
      `SELECT r.id AS relationship_id,
              rt.code AS relationship_type_code,
              rt.name AS relationship_type_name,
              other.role,
              ao.id AS object_id,
              ao.object_type,
              ao.title,
              ao.summary,
              at.name AS artifact_type_name
       FROM relationship_members self
       INNER JOIN relationships r ON r.id = self.relationship_id
       INNER JOIN archive_objects rel_ao ON rel_ao.id = r.id
       INNER JOIN relationship_types rt ON rt.id = r.relationship_type_id
       INNER JOIN relationship_members other ON other.relationship_id = r.id AND other.object_id != ?
       INNER JOIN archive_objects ao ON ao.id = other.object_id
       LEFT JOIN artifacts a ON a.id = ao.id
       LEFT JOIN artifact_types at ON at.id = a.artifact_type_id
       WHERE self.object_id = ?
         AND rel_ao.is_deleted = 0
         AND ao.is_deleted = 0
         ${typeFilter}
       ORDER BY ao.title ASC, ao.id ASC`,
    ).all(...params) as ConnectedObjectRecord[];
  }

  softDelete(id: string, updatedBy?: string | null): boolean {
    return this.archiveObjects.softDelete(id, updatedBy);
  }
}
