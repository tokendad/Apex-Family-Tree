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

export interface ConnectableRelationshipRole {
  role: string;
  allowed_object_types: string[];
  is_required: boolean;
}

export interface ConnectableRelationshipType extends RelationshipType {
  roles: ConnectableRelationshipRole[];
}

export class RelationshipRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();

  /**
   * Relationship types available for connecting objects, newest-irrelevant first
   * by display order.
   *
   * Genealogy types are excluded: parent/child and spouse links are produced by
   * the tree and family-union flows, not by hand-connecting two archive objects,
   * and offering them here would invite relationships the tree cannot render.
   */
  findConnectableTypes(): ConnectableRelationshipType[] {
    const types = this.db.prepare(
      // Retired types (is_active = 0) stay in the table so relationships
      // already recorded against them remain readable, but they are not
      // offered for new connections — see 060 and belongs_to_collection.
      `SELECT * FROM relationship_types
       WHERE (category IS NULL OR category != 'genealogy')
         AND is_active = 1
       ORDER BY category ASC, sort_order ASC, name ASC`,
    ).all() as RelationshipType[];

    // Each type defines its own role names and the object types each role
    // accepts — depicts_event wants roles 'artifact' and 'event', while
    // belongs_to_collection wants 'collection' and 'item'. A caller that
    // guesses role names gets a validation error, so the roles ship with the
    // type rather than being looked up separately.
    const roleRows = this.db.prepare(
      `SELECT relationship_type_id, role, allowed_object_type, is_required, sort_order
       FROM relationship_type_roles
       ORDER BY sort_order ASC, role ASC`,
    ).all() as Array<{
      relationship_type_id: string;
      role: string;
      allowed_object_type: string;
      is_required: number;
      sort_order: number;
    }>;

    const byType = new Map<string, Map<string, { role: string; allowed_object_types: string[]; is_required: boolean }>>();
    for (const row of roleRows) {
      if (!byType.has(row.relationship_type_id)) byType.set(row.relationship_type_id, new Map());
      const roles = byType.get(row.relationship_type_id)!;
      const existing = roles.get(row.role);
      if (existing) {
        existing.allowed_object_types.push(row.allowed_object_type);
        existing.is_required = existing.is_required || row.is_required === 1;
      } else {
        roles.set(row.role, {
          role: row.role,
          allowed_object_types: [row.allowed_object_type],
          is_required: row.is_required === 1,
        });
      }
    }

    return types.map((type) => ({
      ...type,
      roles: Array.from(byType.get(type.id)?.values() ?? []),
    }));
  }

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
