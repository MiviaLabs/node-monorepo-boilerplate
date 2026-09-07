/**
 * Organizations table schema
 *
 * Organizations are tenants that use subdomain routing (e.g., acme.app.com).
 * Each organization belongs to exactly one tenant record.
 *
 * Architecture:
 * - Organizations link to tenants for billing and feature management
 * - Subdomain routing via unique slug (e.g., acme → acme.app.com)
 * - Owner relationship to users with SET NULL on delete
 * - Soft delete for GDPR compliance
 *
 * Relationship model:
 * - organizations → tenants (many-to-one, CASCADE DELETE)
 * - organizations → users (owner, SET NULL on delete)
 * - organizations ← users (one-to-many, CASCADE DELETE)
 * - organizations ← encrypted-store_entries (one-to-many, CASCADE DELETE)
 *
 * GCP Integration:
 * - gcpTenantId stores Firebase/GCP Identity Platform tenant ID
 * - Enables multi-tenant authentication isolation
 * - Nullable for gradual migration of existing organizations
 *
 * Compliance:
 * - GDPR: Soft delete, CASCADE DELETE for right to erasure
 * - SOC 2: Audit trail via timestamps
 * - Multi-tenancy: Complete data isolation via tenant_id
 *
 * @module db-core/schemas/organizations
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants.schema';

/**
 * Organizations table
 *
 * Organizations are the primary tenant unit with subdomain routing.
 * Each organization MUST belong to a tenant for billing/features.
 *
 * Circular reference handling:
 * - organizations.ownerId → users.id (SET NULL)
 * - users.organizationId → organizations.id (CASCADE)
 * - Resolved via lazy require() to avoid import cycle
 *
 * Query patterns optimized:
 * - Find organization by slug (subdomain routing)
 * - Find organization by publicId (API lookups)
 * - Find organizations by tenant (admin listing)
 * - Find organizations by owner (user's organizations)
 *
 * @example
 * ```typescript
 * // Create a new organization
 * await db.insert(organizations).values({
 *   tenantId: 1,
 *   ownerId: userId,
 *   name: 'Acme Corporation',
 *   slug: 'acme',
 *   isActive: true
 * });
 *
 * // Find organization by slug for subdomain routing
 * const org = await db.query.organizations.findFirst({
 *   where: and(
 *     eq(organizations.slug, 'acme'),
 *     isNull(organizations.deletedAt)
 *   )
 * });
 * ```
 */
export const organizations = pgTable(
  'organizations',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and external identifiers
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the organization record.
     * Used in foreign key relationships (users.organizationId).
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    /**
     * External-facing UUID (public identifier)
     *
     * UUID v4 for use in APIs, URLs, and external references.
     * Never changes, safe to expose publicly.
     *
     * Use cases:
     * - API resource identifiers
     * - External integrations
     * - Shareable links
     *
     * @type {string} UUID, auto-generated, NOT NULL, UNIQUE
     */
    publicId: uuid('public_id').defaultRandom().notNull().unique(),

    // ============================================
    // FOREIGN KEY RELATIONSHIPS
    // Tenant and owner associations
    // ============================================

    /**
     * Foreign key reference to the tenants table
     *
     * Links this organization to its parent tenant record.
     * Tenant provides billing, feature flags, and limits.
     *
     * CASCADE DELETE ensures organization is removed when tenant is deleted.
     * This supports complete tenant deletion for GDPR compliance.
     *
     * Constraints:
     * - NOT NULL: Every organization must belong to a tenant
     * - ON DELETE CASCADE: Automatic cleanup when tenant is deleted
     *
     * @type {number} Integer referencing tenants.id
     * @see tenants
     */
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /**
     * Foreign key reference to the organization owner
     *
     * Links to the user who owns this organization.
     * Owner has full administrative control.
     *
     * SET NULL on delete preserves organization when owner is deleted.
     * This allows ownership transfer instead of cascading deletion.
     *
     * Note: Uses dynamic require to avoid circular dependency
     * (users.organizationId references organizations.id).
     *
     * Constraints:
     * - Nullable: Organization can exist without owner (pending transfer)
     * - ON DELETE SET NULL: Preserve org when owner deleted
     *
     * @type {number | null} Integer referencing users.id, nullable
     * @see users
     */
    ownerId: integer('owner_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./users.schema').users.id,
      {
        onDelete: 'set null'
      }
    ),

    // ============================================
    // ORGANIZATION IDENTITY
    // Name, slug, and routing information
    // ============================================

    /**
     * Organization display name
     *
     * Human-readable name for the organization.
     * Displayed in UI, emails, and reports.
     *
     * @type {string} VARCHAR(255), NOT NULL
     */
    name: varchar('name', { length: 255 }).notNull(),

    /**
     * Organization UI display name
     *
     * Editable display label used in product UI.
     * This is intentionally separate from identity-provider/GCP tenant naming.
     *
     * Nullable for backward compatibility during rollout. Consumers should
     * fallback to `name` when this value is null.
     *
     * @type {string | null} VARCHAR(255), nullable
     */
    displayName: varchar('display_name', { length: 255 }),

    /**
     * URL slug for subdomain routing
     *
     * Unique identifier used in subdomain routing.
     * Example: slug "acme" → https://acme.app.com
     *
     * Constraints:
     * - Must be URL-safe (lowercase alphanumeric + hyphens)
     * - Globally unique across all organizations
     * - Cannot be changed after creation (breaks links)
     *
     * @type {string} VARCHAR(50), NOT NULL, UNIQUE
     */
    slug: varchar('slug', { length: 50 }).notNull().unique(),

    // ============================================
    // GCP INTEGRATION
    // Firebase/Identity Platform tenant mapping
    // ============================================

    /**
     * GCP Identity Platform tenant ID
     *
     * Stores the Firebase/GCP tenant ID for multi-tenant authentication.
     * Enables isolated authentication per organization.
     *
     * Note: GCP tenant IDs are arbitrary strings (e.g., "mivialabs-xhltd"),
     * not UUIDs. The format is determined by GCP.
     *
     * Nullable to allow:
     * - Gradual migration of existing organizations
     * - Organizations not using GCP authentication
     *
     * @type {string | null} VARCHAR(255), nullable
     */
    gcpTenantId: varchar('gcp_tenant_id', { length: 255 }),

    // ============================================
    // STATUS FLAGS
    // Organization state management
    // ============================================

    /**
     * Active status flag
     *
     * Whether the organization is currently active.
     * Inactive organizations cannot be accessed by users.
     *
     * Note: Defaults to false for new organizations.
     * Must be explicitly activated after setup is complete.
     *
     * Use cases:
     * - Pending setup/onboarding
     * - Temporary suspension
     * - Payment issues
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: false
     */
    isActive: boolean('is_active').default(false).notNull(),

    // ============================================
    // TIMESTAMPS
    // Audit trail for organization lifecycle
    // ============================================

    /**
     * Record creation timestamp
     *
     * When this organization was created.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this organization record was last modified.
     * Updated on any field change.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    // ============================================
    // SOFT DELETE
    // GDPR compliance and audit trail
    // ============================================

    /**
     * Soft delete timestamp
     *
     * When the organization was soft-deleted (null = not deleted).
     * Soft-deleted organizations are excluded from queries but preserved.
     *
     * GDPR compliance:
     * - Supports right to erasure while preserving audit trail
     * - Related users CASCADE deleted when org is hard deleted
     * - Data can be anonymized while keeping record structure
     *
     * @type {Date | null} TIMESTAMP, nullable (null = not deleted)
     */
    deletedAt: timestamp('deleted_at')
  },
  (t) => [
    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: Tenant ID lookup
     *
     * Optimizes queries to find organizations by tenant.
     * Used for admin listing and tenant management.
     *
     * Query pattern: SELECT * FROM organizations WHERE tenant_id = ?
     *
     * @example
     * ```sql
     * -- List all organizations for a tenant
     * SELECT * FROM organizations
     * WHERE tenant_id = 1
     * AND deleted_at IS NULL;
     * ```
     */
    index('idx_organizations_tenant_id').on(t.tenantId),

    /**
     * Index: Slug lookup (subdomain routing)
     *
     * Critical index for subdomain routing performance.
     * Every request to acme.app.com triggers this lookup.
     *
     * Query pattern: SELECT * FROM organizations WHERE slug = ?
     *
     * @example
     * ```sql
     * -- Resolve subdomain to organization
     * SELECT * FROM organizations
     * WHERE slug = 'acme'
     * AND deleted_at IS NULL
     * AND is_active = true;
     * ```
     */
    index('idx_organizations_slug').on(t.slug),

    /**
     * Index: Public ID lookup (API)
     *
     * Optimizes API lookups by external identifier.
     * Every API request with org ID uses this index.
     *
     * Query pattern: SELECT * FROM organizations WHERE public_id = ?
     *
     * @example
     * ```sql
     * -- Find organization by API identifier
     * SELECT * FROM organizations
     * WHERE public_id = 'uuid-here'
     * AND deleted_at IS NULL;
     * ```
     */
    index('idx_organizations_public_id').on(t.publicId),

    /**
     * Index: Active status filter
     *
     * Optimizes queries filtering by active status.
     * Used for listing active organizations.
     *
     * Query pattern: SELECT * FROM organizations WHERE is_active = ?
     */
    index('idx_organizations_is_active').on(t.isActive),

    /**
     * Index: GCP tenant ID lookup
     *
     * Optimizes lookups by GCP Identity Platform tenant.
     * Used during authentication to resolve organization.
     *
     * Query pattern: SELECT * FROM organizations WHERE gcp_tenant_id = ?
     *
     * @example
     * ```sql
     * -- Find organization by GCP tenant
     * SELECT * FROM organizations
     * WHERE gcp_tenant_id = 'mivialabs-xhltd'
     * AND deleted_at IS NULL;
     * ```
     */
    index('idx_organizations_gcp_tenant_id').on(t.gcpTenantId),

    /**
     * Index: Owner ID lookup
     *
     * Optimizes queries to find organizations by owner.
     * Used for "my organizations" listings.
     *
     * Query pattern: SELECT * FROM organizations WHERE owner_id = ?
     *
     * @example
     * ```sql
     * -- Find all organizations owned by a user
     * SELECT * FROM organizations
     * WHERE owner_id = 123
     * AND deleted_at IS NULL;
     * ```
     */
    index('idx_organizations_owner_id').on(t.ownerId)
  ]
);

/**
 * Organization select type
 *
 * Type representing an organization record as returned from SELECT queries.
 * All columns are included with their runtime types.
 *
 * @example
 * ```typescript
 * const org: Organization = await db.query.organizations.findFirst({
 *   where: eq(organizations.slug, 'acme')
 * });
 *
 * // Check if organization is accessible
 * const isAccessible = org.isActive && !org.deletedAt;
 * ```
 */
export type Organization = typeof organizations.$inferSelect;

/**
 * Organization insert type
 *
 * Type representing the data needed to insert a new organization.
 * Required fields: tenantId, name, slug
 * Optional fields: ownerId, gcpTenantId, isActive
 *
 * @example
 * ```typescript
 * const newOrg: NewOrganization = {
 *   tenantId: 1,
 *   ownerId: userId,
 *   name: 'Acme Corporation',
 *   slug: 'acme'
 * };
 * const [org] = await db.insert(organizations).values(newOrg).returning();
 *
 * // Activate after setup
 * await db.update(organizations)
 *   .set({ isActive: true })
 *   .where(eq(organizations.id, org.id));
 * ```
 */
export type NewOrganization = typeof organizations.$inferInsert;
