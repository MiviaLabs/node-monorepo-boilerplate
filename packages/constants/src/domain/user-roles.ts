/**
 * User role constants (simplified reference)
 *
 * Basic role hierarchy for simple authorization scenarios.
 * These roles provide a simplified abstraction over the more granular
 * SYSTEM_ROLE and TENANT_ROLE constants used in production.
 *
 * **Role Hierarchy:**
 * ```
 * ADMIN (highest)
 *   └── Full administrative access
 * USER (standard)
 *   └── Standard user access
 * GUEST (lowest)
 *   └── Read-only or limited access
 * ```
 *
 * **Important:** For production multi-tenant applications, use the granular
 * role system instead:
 * - `SYSTEM_ROLE` - System-wide roles (system_owner, system_admin)
 * - `TENANT_ROLE` - Tenant-scoped roles (tenant_owner, tenant_admin, tenant_user, tenant_viewer)
 *
 * These simplified roles are useful for:
 * - Simple applications without multi-tenancy
 * - Prototype/MVP development
 * - Documentation examples
 * - Unit test fixtures
 *
 * @see packages/constants/src/domain/system-roles.ts - Production system-wide roles
 * @see packages/constants/src/domain/tenant-roles.ts - Production tenant-scoped roles
 * @see packages/constants/src/domain/role-permissions.ts - Role-to-permission mapping
 * @see packages/auth/src/guards/roles.guard.ts - Role enforcement in guards
 *
 * @example
 * ```typescript
 * import { USER_ROLE } from '@package/constants/domain';
 *
 * // Simple role check (use for non-multi-tenant scenarios)
 * if (user.role === USER_ROLE.ADMIN) {
 *   // Allow admin action
 * }
 *
 * // For multi-tenant apps, prefer SYSTEM_ROLE or TENANT_ROLE
 * import { TENANT_ROLE } from '@package/constants/domain';
 * if (user.tenantRole === TENANT_ROLE.OWNER) {
 *   // Allow tenant owner action
 * }
 * ```
 */

export const USER_ROLE = {
  // ──────────────────────────────────────────────────────────────────────────
  // Administrative roles
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Administrator role
   *
   * Full administrative access to the system. Can manage users,
   * configure settings, and perform all operations.
   *
   * **Permission scope:** All operations
   * **Typical users:** System administrators, super users
   *
   * Note: In multi-tenant systems, this maps conceptually to
   * SYSTEM_ROLE.OWNER or TENANT_ROLE.OWNER depending on scope.
   */
  ADMIN: 'admin',

  // ──────────────────────────────────────────────────────────────────────────
  // Standard roles
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Standard user role
   *
   * Normal authenticated user with standard access to features.
   * Can perform typical user operations but not administrative tasks.
   *
   * **Permission scope:** Own resources, shared resources
   * **Typical users:** Regular application users, team members
   *
   * Note: In multi-tenant systems, this maps conceptually to
   * TENANT_ROLE.USER for tenant-scoped operations.
   */
  USER: 'user',

  // ──────────────────────────────────────────────────────────────────────────
  // Limited roles
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Guest role
   *
   * Limited access role for unauthenticated or minimally authenticated users.
   * Typically read-only access to public resources.
   *
   * **Permission scope:** Public resources only (read)
   * **Typical users:** Visitors, preview users, API consumers with limited scope
   *
   * Note: In multi-tenant systems, this maps conceptually to
   * TENANT_ROLE.VIEWER for read-only tenant access.
   */
  GUEST: 'guest'
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
