/**
 * Permission check result
 */
export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
  permissions: string[];
}

/**
 * User context for permission resolution
 */
export interface UserPermissionContext {
  userId: string;
  tenantId?: string;
  systemRoles: string[];
  tenantRoles: string[];
}

/**
 * Required permissions metadata key
 */
export const REQUIRED_PERMISSIONS_KEY = 'required_permissions';

/**
 * Required roles metadata key
 */
export const REQUIRED_ROLES_KEY = 'required_roles';
