/**
 * User Roles table schema
 *
 * Stores system-level role assignments for users.
 * System roles grant permissions across all tenants (global scope).
 *
 * Architecture:
 * - System roles (stored here): Global permissions across all tenants
 * - Tenant roles (stored in user_tenants): Scoped to specific tenant
 * - Complete authorization = system roles + tenant roles
 *
 * Role hierarchy:
 * - system_owner: Full system control, can manage all tenants
 * - system_admin: System operations, view all tenants, non-destructive actions
 *
 * Security features:
 * - assignedBy tracking for audit trail
 * - expiresAt for temporary role grants
 * - Unique constraint prevents duplicate role assignments
 * - Foreign key to users with CASCADE DELETE
 *
 * RBAC integration:
 * - Check system roles first for privileged operations
 * - Fall back to tenant roles for tenant-scoped operations
 * - Combined for complete permission resolution
 *
 * Compliance:
 * - SOC 2: Audit trail (assignedBy, assignedAt, timestamps)
 * - ISO 27001: Role-based access control, privilege separation
 * - GDPR: CASCADE DELETE for right to erasure
 *
 * @module db-core/schemas/user-roles
 */

import { pgTable, serial, integer, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core';

import { users } from './users.schema';

/**
 * System role enum
 *
 * Defines system-wide roles that grant global permissions.
 * These roles apply across ALL tenants, not just one.
 *
 * Role definitions:
 *
 * **system_owner** - Full system control
 * - Can manage ALL tenants and users
 * - Can delete tenants and organizations
 * - Can assign system_owner to others
 * - Typically: Platform founders, C-level executives
 *
 * **system_admin** - System operations
 * - Can VIEW all tenants and users
 * - Can perform non-destructive operations
 * - Cannot delete tenants or assign system_owner
 * - Typically: Support staff, operations team
 *
 * @example
 * ```typescript
 * // Check if user has system_owner role
 * const hasOwnerRole = await db.query.userRoles.findFirst({
 *   where: and(
 *     eq(userRoles.userId, userId),
 *     eq(userRoles.role, 'system_owner'),
 *     or(
 *       isNull(userRoles.expiresAt),
 *       gt(userRoles.expiresAt, new Date())
 *     )
 *   )
 * });
 * ```
 */
export const systemRoleEnum = ['system_owner', 'system_admin'] as const;

/**
 * System role TypeScript type
 *
 * Union type of all valid system-wide roles.
 * Used for type-safe role checks in application code.
 */
export type SystemRoleDb = (typeof systemRoleEnum)[number];

/**
 * User roles table
 *
 * Stores system-level role assignments.
 * Each row represents one user having one system role.
 *
 * Unique constraint: One assignment per role per user.
 * A user can have multiple different roles, but not duplicate same role.
 *
 * Query patterns optimized:
 * - Find all system roles for a user (authorization)
 * - Find all users with a specific role (admin listing)
 * - Find expired roles (cleanup job)
 * - Find non-expired roles for a user (active authorization)
 *
 * @example
 * ```typescript
 * // Assign system_admin role
 * await db.insert(userRoles).values({
 *   userId: targetUserId,
 *   role: 'system_admin',
 *   assignedBy: adminUserId,
 *   expiresAt: addMonths(new Date(), 6) // 6 month grant
 * });
 *
 * // Get all system roles for authorization
 * const roles = await db.query.userRoles.findMany({
 *   where: and(
 *     eq(userRoles.userId, userId),
 *     or(
 *       isNull(userRoles.expiresAt),
 *       gt(userRoles.expiresAt, new Date())
 *     )
 *   )
 * });
 *
 * // Revoke role
 * await db.delete(userRoles).where(
 *   and(
 *     eq(userRoles.userId, userId),
 *     eq(userRoles.role, 'system_admin')
 *   )
 * );
 * ```
 */
export const userRoles = pgTable(
  'user_roles',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the role assignment record.
     * Not typically used directly - queries use (userId, role).
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    // ============================================
    // FOREIGN KEY RELATIONSHIPS
    // User and assigner associations
    // ============================================

    /**
     * Foreign key reference to the user receiving the role
     *
     * The user who is granted this system role.
     * CASCADE DELETE removes role when user is deleted.
     *
     * Constraints:
     * - NOT NULL: Every role must be assigned to a user
     * - ON DELETE CASCADE: Cleanup when user is deleted
     *
     * @type {number} Integer referencing users.id
     * @see users
     */
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // ============================================
    // ROLE ASSIGNMENT
    // System role and assignment metadata
    // ============================================

    /**
     * System role assigned to the user
     *
     * The global role granted to this user.
     * Combined with assignedBy/expiresAt for complete audit.
     *
     * Values:
     * - 'system_owner': Full system control
     * - 'system_admin': System operations (view-only for sensitive)
     *
     * @type {SystemRoleDb} VARCHAR with enum constraint, NOT NULL
     * @see systemRoleEnum
     */
    role: varchar('role', { enum: systemRoleEnum }).notNull(),

    /**
     * User who assigned this role
     *
     * Foreign key to the user who granted this role.
     * Used for audit trail and authorization validation.
     *
     * SECURITY: Application layer must validate:
     * - Assigner has permission to grant this role
     * - Self-assignment is prevented (assignedBy !== userId)
     * - Role hierarchy is respected
     *
     * Nullable for:
     * - System-assigned roles (initial setup)
     * - Data migration scenarios
     * - Programmatic assignments without user context
     *
     * No cascade behavior - preserves audit trail if assigner deleted.
     *
     * @type {number | null} Integer referencing users.id, nullable
     * @see users
     */
    assignedBy: integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),

    // ============================================
    // TIMING
    // Assignment and expiration timestamps
    // ============================================

    /**
     * Role assignment timestamp
     *
     * When this role was assigned to the user.
     * Used for audit reporting and compliance.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),

    /**
     * Role expiration timestamp
     *
     * When this role assignment expires (null = never expires).
     * After expiration, role is not included in authorization.
     *
     * Use cases:
     * - Temporary elevated access
     * - Contractor/vendor access windows
     * - Trial periods for new roles
     * - Automatic de-provisioning
     *
     * Cleanup job should remove expired roles periodically.
     *
     * @type {Date | null} TIMESTAMP, nullable (null = permanent)
     */
    expiresAt: timestamp('expires_at'),

    // ============================================
    // TIMESTAMPS
    // Audit trail for role lifecycle
    // ============================================

    /**
     * Record creation timestamp
     *
     * When this role assignment was created.
     * May differ from assignedAt for backdated assignments.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this role record was last modified.
     * Updated on changes to expiresAt, etc.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (t) => [
    // ============================================
    // UNIQUE CONSTRAINTS
    // Prevent duplicate role assignments
    // ============================================

    /**
     * Unique constraint: One assignment per role per user
     *
     * Prevents a user from having the same role assigned twice.
     * User CAN have multiple different roles (system_owner + system_admin).
     *
     * Constraint: UNIQUE(user_id, role)
     *
     * @example
     * ```sql
     * -- This works: user has both roles
     * INSERT INTO user_roles (user_id, role) VALUES (1, 'system_owner');
     * INSERT INTO user_roles (user_id, role) VALUES (1, 'system_admin');
     *
     * -- This fails: duplicate system_owner
     * INSERT INTO user_roles (user_id, role) VALUES (1, 'system_owner');
     * -- ERROR: duplicate key value violates unique constraint
     * ```
     */
    unique('unique_user_role').on(t.userId, t.role),

    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: User ID lookup
     *
     * Primary index for user authorization queries.
     * Used to find all system roles for a user.
     *
     * Query pattern: SELECT * FROM user_roles WHERE user_id = ?
     *
     * @example
     * ```sql
     * -- Get all system roles for authorization check
     * SELECT role FROM user_roles
     * WHERE user_id = 1
     * AND (expires_at IS NULL OR expires_at > NOW());
     * ```
     */
    index('idx_user_roles_user_id').on(t.userId),

    /**
     * Index: Role lookup
     *
     * Optimizes queries for users with specific role.
     * Used for admin listing and role-based searches.
     *
     * Query pattern: SELECT * FROM user_roles WHERE role = ?
     *
     * @example
     * ```sql
     * -- Find all system owners
     * SELECT u.* FROM user_roles ur
     * JOIN users u ON ur.user_id = u.id
     * WHERE ur.role = 'system_owner'
     * AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
     * ```
     */
    index('idx_user_roles_role').on(t.role),

    /**
     * Index: Expiration lookup
     *
     * Optimizes queries for expired roles.
     * Used by cleanup job to find and remove expired assignments.
     *
     * Query pattern: SELECT * FROM user_roles WHERE expires_at < ?
     *
     * @example
     * ```sql
     * -- Find expired roles for cleanup
     * SELECT * FROM user_roles
     * WHERE expires_at IS NOT NULL
     * AND expires_at < NOW();
     *
     * -- Find roles expiring soon for notification
     * SELECT * FROM user_roles
     * WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days';
     * ```
     */
    index('idx_user_roles_expires_at').on(t.expiresAt),

    /**
     * Index: User + expiration composite
     *
     * Optimizes non-expired role queries for a user.
     * Most common authorization pattern.
     *
     * Query pattern: SELECT * FROM user_roles WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)
     *
     * @example
     * ```sql
     * -- Get active system roles for authorization
     * SELECT role FROM user_roles
     * WHERE user_id = 1
     * AND (expires_at IS NULL OR expires_at > NOW());
     * ```
     */
    index('idx_user_roles_user_id_expires_at').on(t.userId, t.expiresAt)
  ]
);

/**
 * User role assignment select type
 *
 * Type representing a role assignment as returned from SELECT queries.
 * All columns are included with their runtime types.
 *
 * @example
 * ```typescript
 * const roleAssignment: UserRole = await db.query.userRoles.findFirst({
 *   where: and(
 *     eq(userRoles.userId, userId),
 *     eq(userRoles.role, 'system_admin')
 *   )
 * });
 *
 * // Check if role is active
 * const isActive = !roleAssignment.expiresAt ||
 *   roleAssignment.expiresAt > new Date();
 * ```
 */
export type UserRole = typeof userRoles.$inferSelect;

/**
 * User role assignment insert type
 *
 * Type representing the data needed to insert a new role assignment.
 * Required fields: userId, role
 * Optional fields: assignedBy, expiresAt
 *
 * @example
 * ```typescript
 * // Permanent system_owner assignment
 * const ownerRole: NewUserRole = {
 *   userId: founderId,
 *   role: 'system_owner',
 *   assignedBy: null // System-assigned (initial setup)
 * };
 *
 * // Temporary system_admin assignment
 * const tempAdminRole: NewUserRole = {
 *   userId: contractorId,
 *   role: 'system_admin',
 *   assignedBy: adminUserId,
 *   expiresAt: new Date('2025-12-31') // Contract end date
 * };
 *
 * await db.insert(userRoles).values([ownerRole, tempAdminRole]);
 * ```
 */
export type NewUserRole = typeof userRoles.$inferInsert;
