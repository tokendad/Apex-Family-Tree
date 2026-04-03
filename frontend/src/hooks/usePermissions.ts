import { useAuth } from '@/contexts/AuthContext.js';

type Role = 'admin' | 'editor' | 'limited_editor' | 'viewer';

/**
 * Role hierarchy — higher index = more permissions.
 * Used for "at least this role" checks.
 */
const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  limited_editor: 1,
  editor: 2,
  admin: 3,
};

export interface Permissions {
  /** Can create new records (POST) */
  canCreate: boolean;
  /** Can edit/update existing records (PUT) */
  canEdit: boolean;
  /** Can delete records (DELETE) */
  canDelete: boolean;
  /** Can access admin panel */
  canAdmin: boolean;
  /** Can import/export GEDCOM (bulk operations) */
  canImportExport: boolean;
  /** Current user role, or null if not authenticated */
  role: Role | null;
  /** True if the user has at least the given role level */
  hasRole: (...roles: Role[]) => boolean;
}

/**
 * Returns permission flags derived from the current user's role.
 *
 * Usage:
 *   const { canEdit, canDelete } = usePermissions();
 *   {canEdit && <Button>Edit</Button>}
 */
export function usePermissions(): Permissions {
  const { user } = useAuth();
  const role = (user?.role ?? null) as Role | null;

  const hasRole = (...roles: Role[]): boolean => {
    if (!role) return false;
    return roles.includes(role);
  };

  const rankOf = (r: Role | null): number => (r ? ROLE_RANK[r] : -1);
  const atLeast = (min: Role): boolean => rankOf(role) >= rankOf(min);

  return {
    role,
    canCreate: atLeast('limited_editor'),
    canEdit: atLeast('editor'),
    canDelete: atLeast('editor'),
    canAdmin: hasRole('admin'),
    canImportExport: atLeast('editor'),
    hasRole,
  };
}
