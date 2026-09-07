/**
 * System-level roles
 *
 * System roles grant permissions that apply across ALL tenants in the platform.
 * These are "super-admin" level roles for platform operators, not tenant users.
 *
 * **Dual-Role Architecture:**
 * The authorization system uses two role types:
 * 1. **System Roles** (this file) - Platform-wide permissions for operators
 * 2. **Tenant Roles** (`tenant-roles.ts`) - Tenant-scoped permissions for users
 *
 * A user can have both:
 * - One system role (optional) - stored in `user_roles` table
 * - Multiple tenant roles (per tenant) - stored in `user_tenants` table
 *
 * **Role Hierarchy:**
 * ```
 * SYSTEM_OWNER (highest)
 *   └── Full platform control
 *       - Create/delete tenants
 *       - Manage system settings
 *       - Access all tenant data
 *       - Assign system roles
 *
 * SYSTEM_ADMIN (lower)
 *   └── Platform administration
 *       - Same platform capabilities as SYSTEM_OWNER
 *       - Cannot delete system owners
 *       - Cannot revoke or downgrade system owner roles
 * ```
 *
 * **JWT Token Embedding:**
 * System roles are embedded in JWT tokens and validated by guards:
 * ```json
 * {
 *   "sub": "user-uuid",
 *   "systemRole": "system_owner",
 *   "tenantRoles": { "tenant-1": "tenant_admin" }
 * }
 * ```
 *
 * **Storage:**
 * - Table: `user_roles` (many-to-one with users)
 * - Column: `role` (enum: 'system_owner', 'system_admin')
 *
 * @see packages/constants/src/domain/tenant-roles.ts - Tenant-scoped roles
 * @see packages/constants/src/domain/role-permissions.ts - Permission mappings
 * @see packages/auth/src/guards/enhanced-roles.guard.ts - Role enforcement
 * @see packages/auth/src/guards/enhanced-permissions.guard.ts - Permission checks
 *
 * @example Using SYSTEM_ROLE with NestJS guards
 * ```typescript
 * import { SYSTEM_ROLE } from '@package/constants/domain';
 * import { SystemRoles } from '@package/auth/decorators';
 * import { SystemRolesGuard } from '@package/auth/guards';
 *
 * @Controller('admin')
 * @UseGuards(JwtAuthGuard, SystemRolesGuard)
 * export class AdminController {
 *   // Only system owners can delete tenants
 *   @SystemRoles(SYSTEM_ROLE.OWNER)
 *   @Delete('tenants/:id')
 *   async deleteTenant(@Param('id') id: string) { ... }
 *
 *   // Both owners and admins can view tenants
 *   @SystemRoles(SYSTEM_ROLE.OWNER, SYSTEM_ROLE.ADMIN)
 *   @Get('tenants')
 *   async listAllTenants() { ... }
 * }
 * ```
 *
 * @example Checking system role in CQRS command handler
 * ```typescript
 * import { SYSTEM_ROLE } from '@package/constants/domain';
 * import { Errors } from '@package/errors';
 *
 * @CommandHandler(CreateTenantCommand)
 * export class CreateTenantHandler {
 *   async execute(command: CreateTenantCommand) {
 *     const { actor, tenantData } = command;
 *
 *     // Only system owners can create tenants
 *     if (actor.systemRole !== SYSTEM_ROLE.OWNER) {
 *       throw Errors.authInsufficientPermissionsRequiredPermission004({
 *         requiredPermission: 'system:tenants:create'
 *       });
 *     }
 *
 *     return this.tenantRepository.create(tenantData);
 *   }
 * }
 * ```
 *
 * @example System role validation in JWT payload
 * ```typescript
 * import { SYSTEM_ROLE, SystemRole } from '@package/constants/domain';
 *
 * interface JwtPayload {
 *   sub: string;
 *   systemRole: SystemRole | null;
 *   tenantRoles: Record<string, string>;
 * }
 *
 * function hasSystemAccess(payload: JwtPayload): boolean {
 *   return payload.systemRole === SYSTEM_ROLE.OWNER ||
 *          payload.systemRole === SYSTEM_ROLE.ADMIN;
 * }
 * ```
 */
export const SYSTEM_ROLE = {
  // ──────────────────────────────────────────────────────────────────────────
  // Platform owner - highest system privilege
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * System owner role
   *
   * Full platform control with unrestricted access to all operations.
   * This is the highest privilege level in the system.
   *
   * **Permissions:** All system permissions (see ROLE_PERMISSIONS)
   * - system:tenants:create, read, update, delete
   * - system:users:create, read, update, delete
   * - system:system:monitor, settings
   *
   * **Typical users:** Platform founders, CTO, primary administrators
   * **Recommendation:** Limit to 1-2 users for security
   */
  OWNER: 'system_owner',

  // ──────────────────────────────────────────────────────────────────────────
  // Platform admin - operational access
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * System administrator role
   *
   * Platform administration role with broad platform access.
   * Owner-protected mutations are enforced separately and prevent
   * deleting system owners or revoking/downgrading owner roles.
   *
   * **Permissions:** All system permissions (see ROLE_PERMISSIONS)
   * - system:tenants:create, read, update, delete
   * - system:users:create, read, update, delete
   * - system:system:monitor, settings
   *
   * **Typical users:** DevOps engineers, support staff, operations team
   * **Recommendation:** Use for day-to-day operations with owner-protected safeguards
   */
  ADMIN: 'system_admin'
} as const;

export type SystemRole = (typeof SYSTEM_ROLE)[keyof typeof SYSTEM_ROLE];
