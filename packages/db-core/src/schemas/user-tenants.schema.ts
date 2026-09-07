/**
 * User Tenants (Memberships) table schema
 *
 * Junction table implementing many-to-many relationship between users and tenants.
 * Represents user memberships in organizations, teams, or individual accounts.
 *
 * Architecture:
 * - Users can belong to multiple tenants (multi-tenant membership)
 * - Each membership has a role (owner, admin, user, viewer)
 * - One membership can be marked as default for the user
 * - Memberships can be deactivated without deletion
 *
 * CRITICAL: tenantId references tenants.id (NOT organizations.id)
 * This allows users to be members of any tenant type:
 * - Organizations (subdomain routing)
 * - Teams (path-based routing)
 * - Individual accounts (no routing)
 *
 * ARCHITECTURAL DECISION: No organization_id column
 * This table intentionally omits organization_id because:
 * 1. Tenant-first model: tenants are the top-level isolation unit, not organizations
 * 2. Polymorphic membership: users can belong to any tenant type (org, team, individual)
 * 3. Normalization: organization→tenant relationship exists in organizations.tenantId
 * 4. Query via JOIN: SELECT ut.* FROM user_tenants ut
 *    JOIN organizations o ON o.tenant_id = ut.tenant_id WHERE o.id = ?
 * Adding organization_id would create redundant, potentially inconsistent data
 * for non-organization tenant types. Approved exception per multi-tenant architecture.
 *
 * Relationship model:
 * - user_tenants → users (many-to-one, CASCADE DELETE)
 * - user_tenants → tenants (many-to-one, CASCADE DELETE)
 *
 * RBAC integration:
 * - Tenant-scoped roles stored here (tenant_owner, tenant_admin, etc.)
 * - System-wide roles stored in user_roles table
 * - Combined for complete permission resolution
 *
 * Compliance:
 * - GDPR: CASCADE DELETE for right to erasure
 * - SOC 2: Audit trail via timestamps
 * - ISO 27001: Role-based access control
 *
 * @module db-core/schemas/user-tenants
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  unique,
  varchar
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants.schema';
import { users } from './users.schema';

/**
 * User tenant role enum
 *
 * Defines tenant-scoped roles for RBAC.
 * These roles apply within a specific tenant context.
 *
 * Role hierarchy (highest to lowest):
 * - tenant_owner: Full control, can delete tenant
 * - tenant_admin: Administrative access, cannot delete tenant
 * - tenant_user: Standard user access
 * - tenant_viewer: Read-only access
 *
 * Migration from legacy values:
 * - owner → tenant_owner
 * - admin → tenant_admin
 * - member → tenant_user
 * - viewer → tenant_viewer
 *
 * @example
 * ```typescript
 * // Promote user to admin
 * await db.update(userTenants)
 *   .set({ role: 'tenant_admin' })
 *   .where(and(
 *     eq(userTenants.userId, userId),
 *     eq(userTenants.tenantId, tenantId)
 *   ));
 * ```
 */
export const USER_TENANT_ROLE_ENUM = [
  'tenant_owner',
  'tenant_admin',
  'tenant_user',
  'tenant_viewer'
] as const;

/**
 * User tenant role TypeScript type
 *
 * Union type of all valid tenant-scoped roles.
 */
export type UserTenantRole = (typeof USER_TENANT_ROLE_ENUM)[number];

/**
 * User Tenants table
 *
 * Junction table for user-tenant many-to-many relationship.
 * Each row represents one user's membership in one tenant.
 *
 * Unique constraint: One membership per user per tenant.
 * A user cannot have multiple memberships in the same tenant.
 *
 * Query patterns optimized:
 * - Find all tenants for a user (tenant switcher)
 * - Find all members of a tenant (member listing)
 * - Find active memberships (access control)
 * - Find user's default tenant (initial redirect)
 * - Check membership existence (authorization)
 *
 * @example
 * ```typescript
 * // Add user to tenant
 * await db.insert(userTenants).values({
 *   userId: 1,
 *   tenantId: 1,
 *   role: 'tenant_user',
 *   isDefault: false
 * });
 *
 * // Find user's tenants
 * const memberships = await db.query.userTenants.findMany({
 *   where: and(
 *     eq(userTenants.userId, userId),
 *     eq(userTenants.isActive, true)
 *   ),
 *   with: { tenant: true }
 * });
 *
 * // Upsert membership (atomic role assignment)
 * await db.insert(userTenants)
 *   .values({ userId, tenantId, role: 'tenant_admin' })
 *   .onConflictDoUpdate({
 *     target: [userTenants.userId, userTenants.tenantId],
 *     set: { role: 'tenant_admin', updatedAt: new Date() }
 *   });
 * ```
 */
export const userTenants = pgTable(
  'user_tenants',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the membership record.
     * Not typically used directly - queries use (userId, tenantId).
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    // ============================================
    // FOREIGN KEY RELATIONSHIPS
    // User and tenant associations
    // ============================================

    /**
     * Foreign key reference to the users table
     *
     * The user who has membership in this tenant.
     * CASCADE DELETE removes membership when user is deleted.
     *
     * Constraints:
     * - NOT NULL: Every membership must have a user
     * - ON DELETE CASCADE: Cleanup when user is deleted
     *
     * @type {number} Integer referencing users.id
     * @see users
     */
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * Foreign key reference to the tenants table
     *
     * The tenant this membership grants access to.
     * CASCADE DELETE removes membership when tenant is deleted.
     *
     * CRITICAL: References tenants.id, NOT organizations.id
     * This enables membership in any tenant type.
     *
     * Constraints:
     * - NOT NULL: Every membership must have a tenant
     * - ON DELETE CASCADE: Cleanup when tenant is deleted
     *
     * @type {number} Integer referencing tenants.id
     * @see tenants
     */
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // ============================================
    // ROLE AND PERMISSIONS
    // Tenant-scoped access control
    // ============================================

    /**
     * User's role within this tenant
     *
     * Determines permissions for tenant-scoped operations.
     * Combined with system roles for complete authorization.
     *
     * Values:
     * - 'tenant_owner': Full control
     * - 'tenant_admin': Administrative access
     * - 'tenant_user': Standard access (default)
     * - 'tenant_viewer': Read-only access
     *
     * @type {UserTenantRole} VARCHAR with enum constraint, NOT NULL, default: 'tenant_user'
     * @see USER_TENANT_ROLE_ENUM
     */
    role: varchar('role', { enum: USER_TENANT_ROLE_ENUM }).notNull().default('tenant_user'),

    // ============================================
    // MEMBERSHIP FLAGS
    // Default and active status
    // ============================================

    /**
     * Default tenant flag
     *
     * Whether this is the user's default tenant.
     * Only one membership per user should have isDefault = true.
     *
     * Use cases:
     * - Initial redirect after login
     * - API calls without explicit tenant context
     * - Default workspace selection
     *
     * Application layer ensures only one default per user.
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: false
     */
    isDefault: boolean('is_default').notNull().default(false),

    /**
     * Active membership flag
     *
     * Whether this membership is currently active.
     * Inactive memberships are preserved but don't grant access.
     *
     * Use cases:
     * - Temporary access suspension
     * - Leave of absence handling
     * - Soft revocation with audit trail
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: true
     */
    isActive: boolean('is_active').notNull().default(true),

    // ============================================
    // TIMESTAMPS
    // Audit trail for membership lifecycle
    // ============================================

    /**
     * Membership join timestamp
     *
     * When the user was added to this tenant.
     * Distinct from createdAt for business reporting.
     *
     * Use cases:
     * - Tenure calculations
     * - Onboarding metrics
     * - Welcome messages ("Member since...")
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    joinedAt: timestamp('joined_at').defaultNow().notNull(),

    /**
     * Record creation timestamp
     *
     * When this membership record was created.
     * May differ from joinedAt if membership is backdated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this membership record was last modified.
     * Updated on role changes, status changes, etc.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (t) => [
    // ============================================
    // UNIQUE CONSTRAINTS
    // Prevent duplicate memberships
    // ============================================

    /**
     * Unique constraint: One membership per user per tenant
     *
     * Prevents duplicate memberships for the same user-tenant pair.
     * Required for atomic upsert operations during role assignment.
     *
     * Constraint: UNIQUE(user_id, tenant_id)
     *
     * @example
     * ```sql
     * -- Atomic upsert using ON CONFLICT
     * INSERT INTO user_tenants (user_id, tenant_id, role)
     * VALUES (1, 1, 'tenant_admin')
     * ON CONFLICT (user_id, tenant_id)
     * DO UPDATE SET role = 'tenant_admin', updated_at = NOW();
     * ```
     */
    unique('unique_user_tenant').on(t.userId, t.tenantId),

    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: User + tenant composite lookup
     *
     * Primary index for membership existence checks.
     * Used for authorization and membership queries.
     *
     * Query pattern: SELECT * FROM user_tenants WHERE user_id = ? AND tenant_id = ?
     *
     * @example
     * ```sql
     * -- Check if user is member of tenant
     * SELECT * FROM user_tenants
     * WHERE user_id = 1 AND tenant_id = 1;
     * ```
     */
    index('idx_user_tenants_user_tenant').on(t.userId, t.tenantId),

    /**
     * Index: User + tenant + active composite
     *
     * Optimizes active membership queries.
     * Most common authorization pattern.
     *
     * Query pattern: SELECT * FROM user_tenants WHERE user_id = ? AND tenant_id = ? AND is_active = true
     *
     * @example
     * ```sql
     * -- Check active membership for authorization
     * SELECT role FROM user_tenants
     * WHERE user_id = 1 AND tenant_id = 1 AND is_active = true;
     * ```
     */
    index('idx_user_tenants_user_tenant_active').on(t.userId, t.tenantId, t.isActive),

    /**
     * Index: User ID lookup
     *
     * Optimizes queries for user's tenant list.
     * Used for tenant switcher and "my tenants" UI.
     *
     * Query pattern: SELECT * FROM user_tenants WHERE user_id = ?
     *
     * @example
     * ```sql
     * -- Get all tenants for a user
     * SELECT t.* FROM user_tenants ut
     * JOIN tenants t ON ut.tenant_id = t.id
     * WHERE ut.user_id = 1 AND ut.is_active = true;
     * ```
     */
    index('idx_user_tenants_user_id').on(t.userId),

    /**
     * Index: Tenant ID lookup
     *
     * Optimizes queries for tenant's member list.
     * Used for member management and admin views.
     *
     * Query pattern: SELECT * FROM user_tenants WHERE tenant_id = ?
     *
     * @example
     * ```sql
     * -- Get all members of a tenant
     * SELECT u.* FROM user_tenants ut
     * JOIN users u ON ut.user_id = u.id
     * WHERE ut.tenant_id = 1 AND ut.is_active = true;
     * ```
     */
    index('idx_user_tenants_tenant_id').on(t.tenantId),

    /**
     * Index: User + default composite
     *
     * Optimizes queries for user's default tenant.
     * Used for login redirect and API default context.
     *
     * Query pattern: SELECT * FROM user_tenants WHERE user_id = ? AND is_default = true
     *
     * @example
     * ```sql
     * -- Get user's default tenant for redirect
     * SELECT tenant_id FROM user_tenants
     * WHERE user_id = 1 AND is_default = true AND is_active = true;
     * ```
     */
    index('idx_user_tenants_user_default').on(t.userId, t.isDefault),

    /**
     * Index: Active status filter
     *
     * Optimizes queries filtering by active status.
     * Used for batch operations and reporting.
     *
     * Query pattern: SELECT * FROM user_tenants WHERE is_active = ?
     */
    index('idx_user_tenants_is_active').on(t.isActive)
  ]
);

/**
 * User tenant membership select type
 *
 * Type representing a membership record as returned from SELECT queries.
 * All columns are included with their runtime types.
 *
 * @example
 * ```typescript
 * const membership: UserTenant = await db.query.userTenants.findFirst({
 *   where: and(
 *     eq(userTenants.userId, userId),
 *     eq(userTenants.tenantId, tenantId)
 *   )
 * });
 *
 * // Check authorization
 * const canEdit = membership?.isActive &&
 *   ['tenant_owner', 'tenant_admin'].includes(membership.role);
 * ```
 */
export type UserTenant = typeof userTenants.$inferSelect;

/**
 * User tenant membership insert type
 *
 * Type representing the data needed to insert a new membership.
 * Required fields: userId, tenantId
 * Optional fields: role (defaults to 'tenant_user'), isDefault, isActive
 *
 * @example
 * ```typescript
 * // Add user to tenant with admin role
 * const newMembership: NewUserTenant = {
 *   userId: 1,
 *   tenantId: 1,
 *   role: 'tenant_admin',
 *   isDefault: false
 * };
 * await db.insert(userTenants).values(newMembership);
 *
 * // Invite user with default membership
 * const inviteMembership: NewUserTenant = {
 *   userId: newUserId,
 *   tenantId: tenantId,
 *   role: 'tenant_user',
 *   isDefault: true // First tenant is default
 * };
 * await db.insert(userTenants).values(inviteMembership);
 * ```
 */
export type NewUserTenant = typeof userTenants.$inferInsert;
