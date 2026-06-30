import { RelationshipRepository } from '../repositories/RelationshipRepository.js';
import type { CreateRelationshipInput, RelationshipRecord, RelationshipTypeRole } from '../types/relationship.js';

export class RelationshipValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelationshipValidationError';
  }
}

export class RelationshipService {
  constructor(private repository = new RelationshipRepository()) {}

  create(data: CreateRelationshipInput): RelationshipRecord {
    const relationshipType = data.relationship_type_id
      ? this.repository.findTypeById(data.relationship_type_id)
      : data.relationship_type_code
        ? this.repository.findTypeByCode(data.relationship_type_code)
        : undefined;

    if (!relationshipType) throw new RelationshipValidationError('relationship type not found');
    if (!data.members.length) throw new RelationshipValidationError('relationship requires members');

    const roles = this.repository.findTypeRoles(relationshipType.id);
    this.validateMembers(data.members, roles);

    return this.repository.create({
      ...data,
      relationship_type_id: relationshipType.id,
      title: data.label?.trim() || relationshipType.name,
    });
  }

  private validateMembers(members: CreateRelationshipInput['members'], roles: RelationshipTypeRole[]): void {
    const counts = new Map<string, number>();

    for (const member of members) {
      const objectType = this.repository.findObjectType(member.object_id);
      if (!objectType) throw new RelationshipValidationError(`object ${member.object_id} not found`);

      const matchingRole = roles.find(role => role.role === member.role && role.allowed_object_type === objectType);
      if (!matchingRole) {
        throw new RelationshipValidationError(`role ${member.role} does not allow object type ${objectType}`);
      }

      const key = `${matchingRole.role}:${matchingRole.allowed_object_type}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    for (const role of roles) {
      const key = `${role.role}:${role.allowed_object_type}`;
      const count = counts.get(key) ?? 0;
      if (role.is_required && count < role.min_count) {
        throw new RelationshipValidationError(`role ${role.role} requires at least ${role.min_count} ${role.allowed_object_type} member(s)`);
      }
      if (role.max_count !== null && count > role.max_count) {
        throw new RelationshipValidationError(`role ${role.role} allows at most ${role.max_count} ${role.allowed_object_type} member(s)`);
      }
    }
  }
}
