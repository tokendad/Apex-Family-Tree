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
    const countsByRole = new Map<string, number>();
    const countsByRoleAndType = new Map<string, number>();

    for (const member of members) {
      const objectType = this.repository.findObjectType(member.object_id);
      if (!objectType) throw new RelationshipValidationError(`object ${member.object_id} not found`);

      const matchingRole = roles.find(role => role.role === member.role && role.allowed_object_type === objectType);
      if (!matchingRole) {
        throw new RelationshipValidationError(`role ${member.role} does not allow object type ${objectType}`);
      }

      const roleAndTypeKey = `${matchingRole.role}:${matchingRole.allowed_object_type}`;
      countsByRoleAndType.set(roleAndTypeKey, (countsByRoleAndType.get(roleAndTypeKey) ?? 0) + 1);
      countsByRole.set(matchingRole.role, (countsByRole.get(matchingRole.role) ?? 0) + 1);
    }

    const rolesByName = new Map<string, RelationshipTypeRole[]>();
    for (const role of roles) {
      const existing = rolesByName.get(role.role) ?? [];
      existing.push(role);
      rolesByName.set(role.role, existing);
    }

    for (const [roleName, roleContracts] of rolesByName) {
      const requiredContracts = roleContracts.filter(role => role.is_required);
      if (requiredContracts.length > 0) {
        const minCount = Math.max(...requiredContracts.map(role => role.min_count));
        const totalCount = countsByRole.get(roleName) ?? 0;
        if (totalCount < minCount) {
          const allowedTypes = requiredContracts.map(role => role.allowed_object_type).join(' or ');
          throw new RelationshipValidationError(`role ${roleName} requires at least ${minCount} ${allowedTypes} member(s)`);
        }
      }

      for (const role of roleContracts) {
        const roleAndTypeKey = `${role.role}:${role.allowed_object_type}`;
        const count = countsByRoleAndType.get(roleAndTypeKey) ?? 0;
        if (role.max_count !== null && count > role.max_count) {
          throw new RelationshipValidationError(`role ${role.role} allows at most ${role.max_count} ${role.allowed_object_type} member(s)`);
        }
      }
    }
  }
}
