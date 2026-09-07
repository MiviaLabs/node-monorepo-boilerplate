import { SYSTEM_PERMISSIONS, TENANT_PERMISSIONS, Permission } from './permissions';
import { SYSTEM_ROLE, SystemRole } from './system-roles';
import { TENANT_ROLE, TenantRole } from './tenant-roles';

/**
 * Role-to-Permission Mapping
 *
 * This is the source of truth for role capabilities.
 * Maps each role to its associated permissions.
 *
 * Permission inheritance:
 * - Higher roles include all permissions of lower roles
 * - System roles grant permissions across all tenants
 * - Tenant roles grant permissions within a specific tenant
 */
export const ROLE_PERMISSIONS: Readonly<Record<SystemRole | TenantRole, readonly Permission[]>> =
  Object.freeze({
    // System roles
    [SYSTEM_ROLE.OWNER]: Object.freeze([
      // All system permissions
      ...Object.values(SYSTEM_PERMISSIONS)
    ]),

    [SYSTEM_ROLE.ADMIN]: Object.freeze([
      // Full platform permissions. Owner-only restrictions are enforced
      // at mutation handlers/services for protected owner operations.
      // Phase 1 admin read endpoints intentionally reuse these
      // existing system permissions rather than introducing a parallel
      // admin-specific permission namespace.
      ...Object.values(SYSTEM_PERMISSIONS)
    ]),

    // Tenant roles
    [TENANT_ROLE.OWNER]: Object.freeze([
      // All tenant permissions
      ...Object.values(TENANT_PERMISSIONS)
    ]),

    [TENANT_ROLE.ADMIN]: Object.freeze([
      // Most tenant permissions (excluding dangerous operations)
      TENANT_PERMISSIONS.SETTINGS_UPDATE,
      TENANT_PERMISSIONS.USERS_CREATE,
      TENANT_PERMISSIONS.USERS_READ,
      TENANT_PERMISSIONS.USERS_UPDATE,
      TENANT_PERMISSIONS.PROJECTS_CREATE,
      TENANT_PERMISSIONS.PROJECTS_READ,
      TENANT_PERMISSIONS.PROJECTS_UPDATE,
      TENANT_PERMISSIONS.PROJECTS_DELETE,
      TENANT_PERMISSIONS.CONTENT_CREATE,
      TENANT_PERMISSIONS.CONTENT_READ,
      TENANT_PERMISSIONS.CONTENT_UPDATE,
      TENANT_PERMISSIONS.CONTENT_DELETE,
      TENANT_PERMISSIONS.ISSUES_CREATE,
      TENANT_PERMISSIONS.ISSUES_READ,
      TENANT_PERMISSIONS.ISSUES_UPDATE,
      TENANT_PERMISSIONS.ISSUES_DELETE
    ]),

    [TENANT_ROLE.USER]: Object.freeze([
      // Standard user permissions
      TENANT_PERMISSIONS.USERS_READ,
      TENANT_PERMISSIONS.PROJECTS_READ,
      TENANT_PERMISSIONS.PROJECTS_CREATE,
      TENANT_PERMISSIONS.PROJECTS_UPDATE,
      TENANT_PERMISSIONS.CONTENT_READ,
      TENANT_PERMISSIONS.CONTENT_CREATE,
      TENANT_PERMISSIONS.CONTENT_UPDATE,
      TENANT_PERMISSIONS.ISSUES_READ,
      TENANT_PERMISSIONS.ISSUES_CREATE,
      TENANT_PERMISSIONS.ISSUES_UPDATE
    ]),

    [TENANT_ROLE.VIEWER]: Object.freeze([
      // Read-only
      TENANT_PERMISSIONS.USERS_READ,
      TENANT_PERMISSIONS.PROJECTS_READ,
      TENANT_PERMISSIONS.CONTENT_READ,
      TENANT_PERMISSIONS.ISSUES_READ
    ])
  });

const EMPTY_PERMISSIONS: readonly Permission[] = Object.freeze([]);

/**
 * Retrieves the permission strings associated with a given role.
 *
 * Looks up the role in the ROLE_PERMISSIONS mapping and returns
 * the array of permission strings. Returns an empty array if the
 * role is not found.
 *
 * @param role - The role identifier to get permissions for (e.g., 'owner', 'admin', 'user')
 * @returns Read-only array of permission strings granted to the role, or empty frozen array if role not found
 *
 * @example
 * ```typescript
 * import { getPermissionsForRole, SYSTEM_ROLE, TENANT_ROLE } from '@package/constants';
 *
 * // Get system owner permissions (all system permissions)
 * const ownerPerms = getPermissionsForRole(SYSTEM_ROLE.OWNER);
 * // Returns: ['tenants:create', 'tenants:read', 'tenants:update', ...]
 *
 * // Get tenant user permissions
 * const userPerms = getPermissionsForRole(TENANT_ROLE.USER);
 * // Returns: ['projects:read', 'projects:create', 'projects:update']
 *
 * // Unknown role returns empty array
 * const unknownPerms = getPermissionsForRole('unknown');
 * // Returns: []
 * ```
 */
export function getPermissionsForRole(role: SystemRole | TenantRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? EMPTY_PERMISSIONS;
}
