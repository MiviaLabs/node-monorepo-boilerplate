/**
 * Tenants table schema
 *
 * Multi-tenant architecture core table.
 * All organizations, teams, and individuals are tenants.
 *
 * Architecture:
 * - Tenants are the top-level billing and feature management unit
 * - Organizations link to tenants for configuration inheritance
 * - Settings JSONB stores features, branding, and limits
 * - Status workflow: draft → trial → active → suspended → deleted
 *
 * CRITICAL: NO SLUG FIELD in tenants table
 * - Organizations use subdomain routing (slug in organizations table)
 * - Teams use path-based routing (no slug needed)
 * - Individuals don't need special routing
 *
 * Relationship model:
 * - tenants ← organizations (one-to-many, CASCADE DELETE)
 * - tenants ← user_tenants (one-to-many, CASCADE DELETE)
 *
 * Compliance:
 * - SOC 2: Feature-based access control via settings
 * - ISO 27001: Audit log retention configuration
 * - Multi-tenancy: Complete isolation at tenant level
 *
 * @module db-core/schemas/tenants
 */

import { index, jsonb, pgTable, serial, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Tenant type enum
 *
 * Defines the type of entity this tenant represents.
 * Determines available features and routing behavior.
 *
 * Types:
 * - organization: Business entity with subdomain routing
 * - team: Group within organization, path-based routing
 * - individual: Single user account, no special routing
 *
 * @example
 * ```typescript
 * const tenant: Tenant = {
 *   type: 'organization',
 *   // ...
 * };
 * ```
 */
export const TENANT_TYPE_ENUM = ['organization', 'team', 'individual'] as const;

/**
 * Tenant type TypeScript type
 *
 * Union type of all valid tenant types.
 */
export type TenantType = (typeof TENANT_TYPE_ENUM)[number];

/**
 * Tenant status enum
 *
 * Defines the lifecycle status of a tenant.
 * Controls access and billing behavior.
 *
 * Status workflow:
 * - draft: Initial state, setup incomplete
 * - trial: Free trial period, limited features
 * - active: Fully operational, paid subscription
 * - suspended: Payment issues or policy violation
 * - deleted: Marked for deletion, data retained for compliance
 *
 * @example
 * ```typescript
 * // Upgrade from trial to active
 * await db.update(tenants)
 *   .set({ status: 'active' })
 *   .where(eq(tenants.id, tenantId));
 * ```
 */
export const TENANT_STATUS_ENUM = ['draft', 'trial', 'active', 'suspended', 'deleted'] as const;

/**
 * Tenant status TypeScript type
 *
 * Union type of all valid tenant statuses.
 */
export type TenantStatus = (typeof TENANT_STATUS_ENUM)[number];

/**
 * Tenant settings JSONB structure
 *
 * Flexible configuration stored as JSONB.
 * Supports feature flags, branding, and resource limits.
 *
 * Design rationale:
 * - JSONB allows schema evolution without migrations
 * - Nested structure for logical grouping
 * - Optional properties for gradual feature rollout
 *
 * @example
 * ```typescript
 * const settings: ITenantSettings = {
 *   features: {
 *     maxUsers: 50,
 *     apiAccess: true,
 *     sso: false
 *   },
 *   branding: {
 *     primaryColor: '#007bff'
 *   },
 *   limits: {
 *     storageQuota: 10737418240 // 10GB
 *   }
 * };
 * ```
 */
export interface ITenantSettings {
  /**
   * Feature flags and limits
   *
   * Controls which features are available to this tenant.
   * Used for tiered pricing and gradual feature rollout.
   */
  features?: {
    /**
     * Maximum number of users allowed
     *
     * Enforced at application layer during user creation.
     * Undefined means unlimited (enterprise tier).
     */
    maxUsers?: number;

    /**
     * Maximum number of projects allowed
     *
     * Enforced at application layer during project creation.
     * Undefined means unlimited.
     */
    maxProjects?: number;

    /**
     * Advanced analytics feature flag
     *
     * Enables advanced reporting and analytics dashboards.
     * Typically available in higher tiers.
     */
    advancedAnalytics?: boolean;

    /**
     * API access feature flag
     *
     * Enables programmatic API access via API keys.
     * Required for integrations and automation.
     */
    apiAccess?: boolean;

    /**
     * Custom integrations feature flag
     *
     * Enables third-party integrations and webhooks.
     * Enterprise feature.
     */
    customIntegrations?: boolean;

    /**
     * Single Sign-On (SSO) feature flag
     *
     * Enables SAML/OIDC SSO authentication.
     * Enterprise feature for identity provider integration.
     */
    sso?: boolean;

    /**
     * Audit log retention period in days
     *
     * How long audit logs are retained for compliance.
     * Minimum 90 days for SOC 2, up to 7 years for financial.
     */
    auditLogRetention?: number;
  };

  /**
   * Branding configuration
   *
   * Customization options for white-labeling.
   * Applied to tenant's UI and communications.
   */
  branding?: {
    /**
     * Custom logo URL
     *
     * URL to tenant's logo image.
     * Displayed in navigation and emails.
     */
    logo?: string;

    /**
     * Primary brand color
     *
     * Hex color code for primary UI elements.
     * Applied to buttons, links, and highlights.
     *
     * @example "#007bff"
     */
    primaryColor?: string;

    /**
     * Custom domain for white-labeling
     *
     * Tenant's own domain instead of app subdomain.
     * Requires DNS configuration and SSL certificate.
     *
     * @example "app.acme.com"
     */
    customDomain?: string;

    /**
     * Custom email domain flag
     *
     * Enables sending emails from tenant's domain.
     * Requires SPF/DKIM configuration.
     */
    customEmail?: boolean;
  };

  /**
   * Billing limits
   *
   * Resource quotas for usage-based billing.
   * Enforced at application layer with soft/hard limits.
   */
  limits?: {
    /**
     * Monthly budget limit in cents
     *
     * Maximum monthly spend before throttling.
     * Alerts sent at 80%, 90%, 100% thresholds.
     */
    monthlyBudget?: number;

    /**
     * Storage quota in bytes
     *
     * Maximum file storage allocation.
     * Enforced during file uploads.
     *
     * @example 10737418240 // 10GB
     */
    storageQuota?: number;

    /**
     * API rate limit per minute
     *
     * Maximum API requests per minute.
     * Enforced via rate limiting middleware.
     *
     * @example 1000 // 1000 requests/minute
     */
    apiRateLimit?: number;
  };

  /**
   * Custom metadata
   *
   * Flexible key-value storage for tenant-specific data.
   * Used for custom fields not covered by other sections.
   *
   * @example
   * ```typescript
   * metadata: {
   *   salesforceId: 'SF-12345',
   *   contractEndDate: '2025-12-31',
   *   accountManager: 'John Doe'
   * }
   * ```
   */
  metadata?: Record<string, unknown>;
}

/**
 * Tenants table
 *
 * Core table for multi-tenancy. Every customer is a tenant.
 * Organizations link to this table via tenantId foreign key.
 *
 * Query patterns optimized:
 * - Find tenant by publicId (API lookups)
 * - Find tenants by status (admin filtering)
 * - Find tenants by type + status (dashboard queries)
 *
 * @example
 * ```typescript
 * // Create a new tenant
 * const [tenant] = await db.insert(tenants).values({
 *   type: 'organization',
 *   status: 'trial',
 *   settings: {
 *     features: { maxUsers: 10, apiAccess: true }
 *   }
 * }).returning();
 *
 * // Find tenant for API request
 * const tenant = await db.query.tenants.findFirst({
 *   where: eq(tenants.publicId, 'uuid-here')
 * });
 * ```
 */
export const tenants = pgTable(
  'tenants',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and external identifiers
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the tenant record.
     * Used in foreign key relationships (organizations.tenantId).
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
     * - Billing system integration
     * - Support ticket references
     *
     * @type {string} UUID, auto-generated, NOT NULL, UNIQUE
     */
    publicId: uuid('public_id').defaultRandom().notNull().unique(),

    // ============================================
    // TENANT CLASSIFICATION
    // Type and status for business logic
    // ============================================

    /**
     * Tenant type
     *
     * Determines the nature of this tenant entity.
     * Affects available features and routing behavior.
     *
     * Values:
     * - 'organization': Business with subdomain routing
     * - 'team': Group within org, path routing
     * - 'individual': Single user, no routing
     *
     * @type {TenantType} VARCHAR with enum constraint, NOT NULL
     * @see TENANT_TYPE_ENUM
     */
    type: varchar('type', { enum: TENANT_TYPE_ENUM }).notNull(),

    /**
     * Tenant lifecycle status
     *
     * Current state in the tenant lifecycle.
     * Controls access and billing behavior.
     *
     * Values:
     * - 'draft': Setup incomplete
     * - 'trial': Free trial period
     * - 'active': Paid subscription
     * - 'suspended': Access restricted
     * - 'deleted': Pending deletion
     *
     * @type {TenantStatus} VARCHAR with enum constraint, NOT NULL, default: 'draft'
     * @see TENANT_STATUS_ENUM
     */
    status: varchar('status', { enum: TENANT_STATUS_ENUM }).notNull().default('draft'),

    // ============================================
    // CONFIGURATION
    // Feature flags, branding, and limits
    // ============================================

    /**
     * Tenant settings (JSONB)
     *
     * Flexible configuration for features, branding, and limits.
     * Schema defined by ITenantSettings interface.
     *
     * Sections:
     * - features: Feature flags and user/project limits
     * - branding: Logo, colors, custom domain
     * - limits: Budget, storage, rate limits
     * - metadata: Custom key-value pairs
     *
     * @type {ITenantSettings | null} JSONB, nullable
     * @see ITenantSettings
     */
    settings: jsonb('settings').$type<ITenantSettings>(),

    // ============================================
    // TIMESTAMPS
    // Audit trail for tenant lifecycle
    // ============================================

    /**
     * Record creation timestamp
     *
     * When this tenant was created.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this tenant record was last modified.
     * Updated on any field change (status, settings).
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (t) => [
    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: Status filter
     *
     * Optimizes queries filtering by tenant status.
     * Used for admin dashboards and batch operations.
     *
     * Query pattern: SELECT * FROM tenants WHERE status = ?
     *
     * @example
     * ```sql
     * -- Find all active tenants
     * SELECT * FROM tenants WHERE status = 'active';
     *
     * -- Find tenants for trial expiration check
     * SELECT * FROM tenants WHERE status = 'trial';
     * ```
     */
    index('idx_tenants_status').on(t.status),

    /**
     * Index: Type + status composite
     *
     * Optimizes queries filtering by both type and status.
     * Most common admin query pattern.
     *
     * Query pattern: SELECT * FROM tenants WHERE type = ? AND status = ?
     *
     * @example
     * ```sql
     * -- Find all active organizations
     * SELECT * FROM tenants
     * WHERE type = 'organization'
     * AND status = 'active';
     *
     * -- Find suspended teams
     * SELECT * FROM tenants
     * WHERE type = 'team'
     * AND status = 'suspended';
     * ```
     */
    index('idx_tenants_type_status').on(t.type, t.status),

    /**
     * Index: Public ID lookup
     *
     * Optimizes API lookups by external identifier.
     * Every API request with tenant ID uses this index.
     *
     * Query pattern: SELECT * FROM tenants WHERE public_id = ?
     *
     * @example
     * ```sql
     * -- Find tenant by API identifier
     * SELECT * FROM tenants WHERE public_id = 'uuid-here';
     * ```
     */
    index('idx_tenants_public_id').on(t.publicId)
  ]
);

/**
 * Tenant select type
 *
 * Type representing a tenant record as returned from SELECT queries.
 * All columns are included with their runtime types.
 *
 * @example
 * ```typescript
 * const tenant: Tenant = await db.query.tenants.findFirst({
 *   where: eq(tenants.publicId, 'uuid-here')
 * });
 *
 * // Check tenant access
 * const hasAccess = tenant.status === 'active' || tenant.status === 'trial';
 *
 * // Access settings
 * const maxUsers = tenant.settings?.features?.maxUsers ?? Infinity;
 * ```
 */
export type Tenant = typeof tenants.$inferSelect;

/**
 * Tenant insert type
 *
 * Type representing the data needed to insert a new tenant.
 * Required fields: type
 * Optional fields: status (defaults to 'draft'), settings, publicId
 *
 * @example
 * ```typescript
 * const newTenant: NewTenant = {
 *   type: 'organization',
 *   status: 'trial',
 *   settings: {
 *     features: {
 *       maxUsers: 10,
 *       apiAccess: true,
 *       auditLogRetention: 90
 *     },
 *     limits: {
 *       storageQuota: 5368709120 // 5GB
 *     }
 *   }
 * };
 * const [tenant] = await db.insert(tenants).values(newTenant).returning();
 * ```
 */
export type NewTenant = typeof tenants.$inferInsert;
