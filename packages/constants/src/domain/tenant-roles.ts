/**
 * Tenant-level roles
 *
 * Tenant roles grant permissions within a specific tenant (organization) context.
 * A user can have different roles in different tenants they belong to.
 *
 * **Dual-Role Architecture:**
 * The authorization system uses two role types:
 * 1. **System Roles** (`system-roles.ts`) - Platform-wide permissions for operators
 * 2. **Tenant Roles** (this file) - Tenant-scoped permissions for users
 *
 * **Role Hierarchy:**
 * ```
 * TENANT_OWNER (highest within tenant)
 *   └── Full tenant control
 *       ├── Manage tenant settings
 *       ├── Delete tenant (with restrictions)
 *       ├── Manage all members
 *       └── All permissions below
 *
 * TENANT_ADMIN
 *   └── Tenant operations
 *       ├── Manage members (invite/remove)
 *       ├── Assign roles (except owner)
 *       ├── Manage all resources
 *       └── All permissions below
 *
 * TENANT_USER
 *   └── Standard user access
 *       ├── Create resources
 *       ├── Edit own resources
 *       ├── View shared resources
 *       └── All permissions below
 *
 * TENANT_VIEWER (lowest within tenant)
 *   └── Read-only access
 *       └── View resources
 * ```
 *
 * **JWT Token Embedding:**
 * Tenant roles are embedded in JWT tokens per tenant:
 * ```json
 * {
 *   "sub": "user-uuid",
 *   "systemRole": null,
 *   "tenantRoles": {
 *     "tenant-uuid-1": "tenant_owner",
 *     "tenant-uuid-2": "tenant_user"
 *   }
 * }
 * ```
 *
 * **Storage:**
 * - Table: `user_tenants` (many-to-many between users and tenants)
 * - Columns: `user_id`, `tenant_id`, `role` (enum)
 *
 * **Permission Inheritance:**
 * Higher roles inherit all permissions of lower roles within the same tenant.
 * OWNER has all ADMIN permissions, ADMIN has all USER permissions, etc.
 *
 * @see packages/constants/src/domain/system-roles.ts - Platform-wide roles
 * @see packages/constants/src/domain/role-permissions.ts - Permission mappings
 * @see packages/auth/src/guards/enhanced-roles.guard.ts - Role enforcement
 * @see apps/api/src/common/middleware/tenant.middleware.ts - Tenant context extraction
 *
 * @example Using TENANT_ROLE with NestJS guards for permission checks
 * ```typescript
 * import { TENANT_ROLE } from '@package/constants/domain';
 * import { TenantRoles } from '@package/auth/decorators';
 * import { EnhancedRolesGuard } from '@package/auth/guards';
 *
 * @Controller('organizations/:orgId/members')
 * @UseGuards(JwtAuthGuard, TenantContextGuard, EnhancedRolesGuard)
 * export class MembersController {
 *   // Only admins and owners can invite members
 *   @TenantRoles(TENANT_ROLE.ADMIN, TENANT_ROLE.OWNER)
 *   @Post('invite')
 *   async inviteMember(@Body() dto: InviteMemberDto) { ... }
 *
 *   // Viewers and above can list members
 *   @TenantRoles(TENANT_ROLE.VIEWER, TENANT_ROLE.USER, TENANT_ROLE.ADMIN, TENANT_ROLE.OWNER)
 *   @Get()
 *   async listMembers() { ... }
 * }
 * ```
 *
 * @example Role hierarchy check in CQRS handler
 * ```typescript
 * import { TENANT_ROLE, TenantRole } from '@package/constants/domain';
 * import { Errors } from '@package/errors';
 *
 * const ROLE_HIERARCHY: Record<TenantRole, number> = {
 *   [TENANT_ROLE.VIEWER]: 1,
 *   [TENANT_ROLE.USER]: 2,
 *   [TENANT_ROLE.ADMIN]: 3,
 *   [TENANT_ROLE.OWNER]: 4
 * };
 *
 * function hasMinimumRole(userRole: TenantRole, requiredRole: TenantRole): boolean {
 *   return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
 * }
 *
 * @CommandHandler(DeleteProjectCommand)
 * export class DeleteProjectHandler {
 *   async execute(command: DeleteProjectCommand) {
 *     const { actor, projectId, tenantId } = command;
 *     const userRole = actor.tenantRoles[tenantId];
 *
 *     // Need at least ADMIN role to delete projects
 *     if (!hasMinimumRole(userRole, TENANT_ROLE.ADMIN)) {
 *       throw Errors.authInsufficientPermissionsRequiredPermission004({
 *         requiredPermission: 'tenant:projects:delete'
 *       });
 *     }
 *
 *     return this.projectRepository.delete(projectId);
 *   }
 * }
 * ```
 *
 * @example Filtering data based on tenant role
 * ```typescript
 * import { TENANT_ROLE } from '@package/constants/domain';
 *
 * @QueryHandler(GetProjectsQuery)
 * export class GetProjectsHandler {
 *   async execute(query: GetProjectsQuery) {
 *     const { actor, tenantId } = query;
 *     const userRole = actor.tenantRoles[tenantId];
 *
 *     // Admins and owners see all projects, others see only assigned
 *     if (userRole === TENANT_ROLE.ADMIN || userRole === TENANT_ROLE.OWNER) {
 *       return this.projectRepository.findByTenant(tenantId);
 *     }
 *
 *     return this.projectRepository.findByMember(tenantId, actor.id);
 *   }
 * }
 * ```
 */
export const TENANT_ROLE = {
  // ──────────────────────────────────────────────────────────────────────────
  // Administrative roles - manage the tenant
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Tenant owner role
   *
   * Full control over the tenant including settings, billing, and deletion.
   * Typically the user who created the tenant/organization.
   *
   * **Permissions:** All tenant permissions (see ROLE_PERMISSIONS)
   * - tenant:settings:update, delete
   * - tenant:users:create, read, update, delete, assign_roles
   * - tenant:projects:create, read, update, delete
   *
   * **Typical users:** Organization founder, primary account holder
   * **Recommendation:** At least one owner per tenant; ownership transfer supported
   */
  OWNER: 'tenant_owner',

  /**
   * Tenant administrator role
   *
   * Administrative access for day-to-day tenant operations.
   * Can manage members and resources but not tenant settings or deletion.
   *
   * **Permissions:** Most tenant permissions except destructive settings
   * - tenant:settings:update (not delete)
   * - tenant:users:create, read, update, assign_roles (not delete in some cases)
   * - tenant:projects:create, read, update, delete
   *
   * **Typical users:** Team leads, department heads, IT administrators
   * **Recommendation:** Primary role for delegated administration
   */
  ADMIN: 'tenant_admin',

  // ──────────────────────────────────────────────────────────────────────────
  // Operational roles - work within the tenant
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Tenant user role
   *
   * Standard user access for productive work within the tenant.
   * Can create and manage resources but not other users.
   *
   * **Permissions:** Resource-level permissions
   * - tenant:projects:create, read, update (own projects)
   * - No user management permissions
   *
   * **Typical users:** Regular team members, employees, collaborators
   * **Recommendation:** Default role for invited members
   */
  USER: 'tenant_user',

  /**
   * Tenant viewer role
   *
   * Read-only access for viewing tenant resources without modification.
   * Useful for stakeholders, auditors, or limited collaborators.
   *
   * **Permissions:** Read-only permissions
   * - tenant:projects:read only
   * - No create, update, or delete permissions
   *
   * **Typical users:** External stakeholders, auditors, clients, observers
   * **Recommendation:** Use for minimum-privilege access scenarios
   */
  VIEWER: 'tenant_viewer'
} as const;

export type TenantRole = (typeof TENANT_ROLE)[keyof typeof TENANT_ROLE];
