import type { SYSTEM_ROLE, TENANT_ROLE } from '@package/constants';

/**
 * Runtime role values mirrored from `@package/constants` (SYSTEM_ROLE / TENANT_ROLE).
 *
 * `@package/types` is a zero-runtime package: it must not execute code from
 * `@package/constants` at runtime, so the role values needed by `getRoleScope`
 * are inlined here. The `satisfies` clauses keep these literals compile-time
 * consistent with the type-only import above. If a role is added or renamed in
 * `@package/constants`, update these arrays in lockstep (tsc flags values that
 * are no longer valid roles).
 */
const SYSTEM_ROLE_VALUES = [
  'system_owner',
  'system_admin'
] as const satisfies readonly SystemRole[];

const TENANT_ROLE_VALUES = [
  'tenant_owner',
  'tenant_admin',
  'tenant_user',
  'tenant_viewer'
] as const satisfies readonly TenantRole[];

/**
 * Unified RBAC role type encompassing both system and tenant roles
 *
 * This type represents all possible RBAC roles in the system.
 * Use this when a role can be either system-scoped or tenant-scoped.
 *
 * Note: This is different from the legacy UserRole enum (admin, user, guest)
 * which is kept for backward compatibility.
 */
export type RBACRole =
  | (typeof SYSTEM_ROLE)[keyof typeof SYSTEM_ROLE]
  | (typeof TENANT_ROLE)[keyof typeof TENANT_ROLE];

/**
 * System role type
 *
 * Roles that grant system-wide permissions across all tenants.
 */
export type SystemRole = (typeof SYSTEM_ROLE)[keyof typeof SYSTEM_ROLE];

/**
 * Tenant role type
 *
 * Roles that grant permissions within a specific tenant context.
 */
export type TenantRole = (typeof TENANT_ROLE)[keyof typeof TENANT_ROLE];

/**
 * Role scope classification
 *
 * Determines whether a role applies system-wide or within a tenant.
 */
export const RoleScope = {
  SYSTEM: 'system',
  TENANT: 'tenant'
} as const;

/** Role scope type */
export type RoleScope = (typeof RoleScope)[keyof typeof RoleScope];

/**
 * Role metadata
 *
 * Contains descriptive information about a role.
 */
export interface RoleMetadata {
  name: string;
  scope: RoleScope;
  description: string;
  permissions: string[];
}

/**
 * Role scope helper
 *
 * Determines whether a role is system-scoped or tenant-scoped.
 *
 * Uses Set-based lookup for O(1) performance instead of string prefix matching.
 * This is more robust and handles edge cases where role names might change.
 *
 * @param role - The role to check
 * @returns The scope of the role ('system' or 'tenant')
 * @throws Error if the role is not recognized (fails fast on invalid input)
 */
export function getRoleScope(role: RBACRole): RoleScope {
  // Create Sets for O(1) lookup performance
  const systemRoles = new Set<SystemRole>(SYSTEM_ROLE_VALUES);

  const tenantRoles = new Set<TenantRole>(TENANT_ROLE_VALUES);

  if (systemRoles.has(role as SystemRole)) {
    return RoleScope.SYSTEM;
  }

  if (tenantRoles.has(role as TenantRole)) {
    return RoleScope.TENANT;
  }

  // This should never happen if TypeScript is used correctly,
  // but we provide a runtime error for safety
  throw new Error(
    `Unrecognized role: ${role}. Valid roles are: ${[
      ...SYSTEM_ROLE_VALUES,
      ...TENANT_ROLE_VALUES
    ].join(', ')}`
  );
}
