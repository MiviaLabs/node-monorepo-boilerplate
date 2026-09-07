/**
 * Permission constants for RBAC system
 *
 * Permissions follow the format: {scope}:{resource}:{action}
 * - scope: 'system' or 'tenant'
 * - resource: The entity being operated on (tenants, users, projects, etc.)
 * - action: The operation (create, read, update, delete, etc.)
 *
 * These constants are code-only (not stored in database) for type safety.
 */

/**
 * System permissions
 *
 * Permissions for system-wide operations that apply across all tenants.
 * These are granted to users with system roles (system_owner, system_admin).
 */
export const SYSTEM_PERMISSIONS = {
  // Tenant management
  TENANTS_CREATE: 'system:tenants:create',
  TENANTS_READ: 'system:tenants:read',
  TENANTS_UPDATE: 'system:tenants:update',
  TENANTS_DELETE: 'system:tenants:delete',

  // User management (system-wide)
  USERS_CREATE: 'system:users:create',
  USERS_READ: 'system:users:read',
  USERS_UPDATE: 'system:users:update',
  USERS_DELETE: 'system:users:delete',

  // System monitoring
  SYSTEM_MONITOR: 'system:system:monitor',
  SYSTEM_SETTINGS: 'system:system:settings',

  // Data retention monitoring
  DATA_RETENTION_READ: 'system:data_retention:read'
} as const;

/**
 * Tenant permissions
 *
 * Permissions for tenant-scoped operations that apply within a specific tenant.
 * These are granted to users with tenant roles (tenant_owner, tenant_admin, etc.)
 */
export const TENANT_PERMISSIONS = {
  // Tenant management
  SETTINGS_UPDATE: 'tenant:settings:update',
  SETTINGS_DELETE: 'tenant:settings:delete',

  // User management (within tenant)
  USERS_CREATE: 'tenant:users:create',
  USERS_READ: 'tenant:users:read',
  USERS_UPDATE: 'tenant:users:update',
  USERS_DELETE: 'tenant:users:delete',

  // User address management (within tenant)
  USER_ADDRESSES_CREATE: 'tenant:user_addresses:create',
  USER_ADDRESSES_READ: 'tenant:user_addresses:read',
  USER_ADDRESSES_UPDATE: 'tenant:user_addresses:update',
  USER_ADDRESSES_DELETE: 'tenant:user_addresses:delete',

  // Cryptographic key rotation operations (within tenant)
  // P0: Critical security operations requiring explicit authorization
  CRYPTO_KEY_ROTATE: 'tenant:crypto:key_rotate',

  // Resource management (example: projects)
  PROJECTS_CREATE: 'tenant:projects:create',
  PROJECTS_READ: 'tenant:projects:read',
  PROJECTS_UPDATE: 'tenant:projects:update',
  PROJECTS_DELETE: 'tenant:projects:delete',

  // Content management (within tenant)
  CONTENT_CREATE: 'tenant:content:create',
  CONTENT_READ: 'tenant:content:read',
  CONTENT_UPDATE: 'tenant:content:update',
  CONTENT_DELETE: 'tenant:content:delete',

  // Issues management (within tenant)
  ISSUES_CREATE: 'tenant:issues:create',
  ISSUES_READ: 'tenant:issues:read',
  ISSUES_UPDATE: 'tenant:issues:update',
  ISSUES_DELETE: 'tenant:issues:delete'
} as const;

/**
 * Combined permissions namespace
 *
 * Provides backward-compatible access to both system and tenant permissions.
 * This prevents key collisions while maintaining a familiar import pattern.
 *
 * @deprecated Use SYSTEM_PERMISSIONS and TENANT_PERMISSIONS directly for better clarity.
 * This export exists for backward compatibility only.
 *
 * @example
 * ```typescript
 * // Preferred approach (explicit namespace)
 * import { SYSTEM_PERMISSIONS, TENANT_PERMISSIONS } from '@package/constants/domain';
 * const perm = SYSTEM_PERMISSIONS.TENANTS_CREATE;
 *
 * // Backward-compatible approach
 * import { PERMISSIONS } from '@package/constants/domain';
 * const perm = PERMISSIONS.system.TENANTS_CREATE;
 * const tenantPerm = PERMISSIONS.tenant.PROJECTS_CREATE;
 * ```
 */
export const PERMISSIONS = {
  system: SYSTEM_PERMISSIONS,
  tenant: TENANT_PERMISSIONS
} as const;

export type Permission =
  | (typeof SYSTEM_PERMISSIONS)[keyof typeof SYSTEM_PERMISSIONS]
  | (typeof TENANT_PERMISSIONS)[keyof typeof TENANT_PERMISSIONS];
