/**
 * API Keys table schema
 *
 * Stores API keys for programmatic access to the API.
 * Supports secure key storage, tenant isolation, permission scoping,
 * usage tracking, and soft delete for audit compliance.
 *
 * Key features:
 * - Encrypted key storage (hash for lookup, prefix for identification)
 * - Multi-tenancy via organization_id (tenant isolation)
 * - Scopes array for fine-grained permission control
 * - Optional expiration date for time-limited access
 * - Usage tracking (last used timestamp, IP, count)
 * - Soft delete pattern for audit trail preservation
 *
 * Security features:
 * - Keys stored as SHA-256 hash (keyHash) - original never stored
 * - Key prefix retained for user identification in UI
 * - Tenant-scoped queries prevent cross-tenant access
 * - Soft delete preserves audit trail for compliance
 *
 * PII fields requiring special handling:
 * - `lastUsedIp` - IP addresses are PII under GDPR/CCPA
 *
 * Application layer MUST:
 * - Exclude PII fields from public API responses
 * - Implement retention cleanup for usage tracking data
 * - Restrict PII field access to security/audit roles
 *
 * Compliance:
 * - SOC 2: Audit trail via timestamps, usage tracking, soft delete
 * - ISO 27001: Access control via scopes, key expiration
 * - GDPR: Soft delete supports right to erasure audit; PII retention limits
 *
 * @module db-core/schemas/api-keys
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  timestamp,
  uuid,
  varchar,
  text,
  index,
  pgTable
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';

/**
 * API Keys table
 *
 * Stores API keys for programmatic access to the API.
 * Each key belongs to an organization (tenant) and tracks usage.
 *
 * Architecture:
 * - Keys are scoped to organizations for multi-tenancy
 * - Each key has a creator (userId) for accountability
 * - Permissions controlled via scopes array
 * - Soft delete (deletedAt) preserves audit trail
 *
 * Query patterns optimized:
 * - Find keys by organization (tenant listing)
 * - Find keys by user (my keys)
 * - Authenticate via key hash lookup
 * - Find expired/inactive keys for cleanup
 *
 * Identifier relationships:
 * - organizationId (UUID) → organization's public identifier (tenant ownership)
 * - userId (UUID) → external creator identifier retained for accountability
 *
 * @example
 * ```typescript
 * // Create a new API key
 * const keyHash = sha256(rawKey);
 * const keyPrefix = rawKey.substring(0, 8);
 *
 * await db.insert(apiKeys).values({
 *   organizationId: 'org-uuid',
 *   userId: 'user-uuid',
 *   name: 'Production API Key',
 *   keyHash,
 *   keyPrefix,
 *   scopes: ['read:users', 'write:products'],
 *   expiresAt: addMonths(new Date(), 12)
 * });
 *
 * // Authenticate with API key
 * const key = await db.query.apiKeys.findFirst({
 *   where: and(
 *     eq(apiKeys.keyHash, sha256(providedKey)),
 *     eq(apiKeys.isActive, true),
 *     isNull(apiKeys.deletedAt)
 *   )
 * });
 * ```
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and relationship identifiers
    // ============================================

    /**
     * Primary key (UUID v4)
     *
     * Unique identifier for the API key record.
     * Auto-generated UUID for global uniqueness.
     *
     * @type {string} UUID, auto-generated
     */
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * Organization ID (tenant identifier)
     *
     * Links this API key to an organization for multi-tenancy.
     * All API key operations must be scoped to this organization.
     *
     * Uses UUID to match organization's public identifier, enabling:
     * - Cross-service API key validation
     * - External identity provider integration
     * - Independent service deployment
     *
     * DB-level foreign key targets organizations.publicId so organization deletion
     * cleans up keys even though the external identifier is UUID-based.
     *
     * @type {string} UUID referencing organizations.publicId, NOT NULL
     */
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.publicId, { onDelete: 'cascade' }),

    /**
     * User ID (creator identifier)
     *
     * The user who created this API key.
     * Used for accountability and "my keys" queries.
     *
     * Uses UUID to match user's public identifier, enabling:
     * - Cross-service user identification
     * - External auth provider integration (OAuth, SSO)
     * - Audit trail across distributed services
     *
     * Stored as an external/user-service identifier for accountability.
     * Not constrained at the DB layer because existing data may originate from
     * outside this package's user primary-key space.
     *
     * @type {string} UUID, NOT NULL
     */
    userId: uuid('user_id').notNull(),

    // ============================================
    // KEY METADATA
    // Human-readable identification
    // ============================================

    /**
     * Friendly name for the API key
     *
     * User-provided name for identification in the UI.
     * Should describe the key's purpose or integration.
     *
     * Examples: "Production Server", "CI/CD Pipeline", "Mobile App"
     *
     * @type {string} VARCHAR(255), NOT NULL
     */
    name: varchar('name', { length: 255 }).notNull(),

    /**
     * Optional description
     *
     * Additional context about the key's purpose, usage,
     * or the system it's integrated with.
     *
     * @type {string | null} TEXT, nullable
     */
    description: text('description'),

    // ============================================
    // KEY STORAGE (ENCRYPTED)
    // Secure storage pattern for API keys
    // ============================================

    /**
     * SHA-256 hash of the API key
     *
     * The full API key is never stored - only its hash.
     * Used for O(1) authentication lookups.
     *
     * Security pattern:
     * - Raw key shown once at creation, never stored
     * - Hash computed: SHA-256(rawKey)
     * - Unique constraint prevents duplicate keys
     *
     * @type {string} VARCHAR(255), NOT NULL, UNIQUE
     */
    keyHash: varchar('key_hash', { length: 255 }).notNull().unique(),

    /**
     * Key prefix for identification
     *
     * First 8 characters of the API key for display.
     * Allows users to identify which key is which without exposing the full key.
     *
     * Display format: "sk_live_ab12..." or similar
     *
     * @type {string} VARCHAR(16), NOT NULL
     */
    keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),

    // ============================================
    // PERMISSIONS
    // Scope-based access control
    // ============================================

    /**
     * Permission scopes array
     *
     * Fine-grained permissions granted to this API key.
     * Format: 'action:resource' (e.g., 'read:users', 'write:products')
     *
     * Common scopes:
     * - 'read:*' - Read access to all resources
     * - 'write:*' - Write access to all resources
     * - 'read:users' - Read user data
     * - 'write:orders' - Create/update orders
     *
     * Empty array means no permissions (key is useless).
     *
     * @type {string[]} TEXT[], NOT NULL, default: empty array
     */
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    // ============================================
    // STATUS AND LIFECYCLE
    // Active state, expiration, soft delete
    // ============================================

    /**
     * Active status flag
     *
     * Whether the API key is currently active and can be used.
     * Can be toggled to temporarily disable a key without deleting.
     *
     * Authentication flow:
     * - Check isActive = true AND deletedAt IS NULL
     * - If either fails, reject authentication
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: true
     */
    isActive: boolean('is_active').notNull().default(true),

    /**
     * Expiration timestamp
     *
     * Optional expiration date for the API key.
     * After this time, the key should be rejected during authentication.
     *
     * Authentication flow:
     * - If expiresAt is set and < now(), reject authentication
     * - Null means no expiration (key valid until deactivated/deleted)
     *
     * @type {Date | null} TIMESTAMP, nullable
     */
    expiresAt: timestamp('expires_at'),

    // ============================================
    // USAGE TRACKING
    // Monitor API key usage for security and billing
    // ============================================

    /**
     * Last usage timestamp
     *
     * When this API key was last used for authentication.
     * Updated on each successful API request.
     *
     * Use cases:
     * - Identify stale/unused keys for cleanup
     * - Security monitoring (detect unusual patterns)
     * - Billing (usage-based pricing)
     *
     * @type {Date | null} TIMESTAMP, nullable (null = never used)
     */
    lastUsedAt: timestamp('last_used_at'),

    /**
     * Last usage IP address
     *
     * IP address from which the key was last used.
     * Supports IPv6 format (up to 45 characters).
     *
     * Security use cases:
     * - Detect usage from unexpected locations
     * - IP-based rate limiting
     * - Forensic investigation
     *
     * **PII Classification: SENSITIVE**
     *
     * IP addresses are considered personal data under GDPR, CCPA, and similar
     * privacy regulations. This field requires special handling:
     *
     * Application layer requirements:
     * - MUST be excluded from public API responses (DTOs)
     * - MUST be restricted to security/audit roles when exposed
     * - SHOULD be redacted in logs (use structured logging with PII filters)
     * - SHOULD have retention policy enforced via scheduled cleanup jobs
     *
     * Recommended retention: 90 days for security monitoring,
     * then anonymize or delete per compliance requirements.
     *
     * @type {string | null} VARCHAR(45), nullable
     * @see ApiKeyGuard - Updates this field on authentication
     * @private Internal tracking field - exclude from API responses
     */
    lastUsedIp: varchar('last_used_ip', { length: 45 }),

    /**
     * Total usage count
     *
     * Number of times this API key has been used.
     * Incremented on each successful authentication.
     *
     * Use cases:
     * - Usage-based billing
     * - Rate limiting (per-key quotas)
     * - Identifying high-traffic integrations
     *
     * @type {number} INTEGER, NOT NULL, default: 0
     */
    usageCount: integer('usage_count').default(0).notNull(),

    // ============================================
    // SOFT DELETE
    // Preserve audit trail while "deleting" keys
    // ============================================

    /**
     * Soft delete timestamp
     *
     * When the key was soft-deleted (null = not deleted).
     * Soft-deleted keys are excluded from queries but preserved for audit.
     *
     * Soft delete pattern:
     * - Deletion sets deletedAt to current timestamp
     * - Queries filter: WHERE deleted_at IS NULL
     * - Key remains in database for compliance/audit
     *
     * Integration with isActive:
     * - isActive = false: Key temporarily disabled (reversible)
     * - deletedAt != null: Key permanently deleted (preserved for audit)
     *
     * Recovery:
     * - Setting deletedAt back to null restores the key
     * - Only admin operations should perform recovery
     *
     * @type {Date | null} TIMESTAMP, nullable (null = not deleted)
     */
    deletedAt: timestamp('deleted_at'),

    // ============================================
    // TIMESTAMPS
    // Audit trail for key lifecycle
    // ============================================

    /**
     * Record creation timestamp
     *
     * When this API key was created.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this API key record was last modified.
     * Updated on any field change (name, scopes, status).
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => ({
    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: Organization (tenant) lookup
     *
     * Optimizes queries to find all API keys for an organization.
     * Critical for multi-tenancy - all key listings are tenant-scoped.
     *
     * Query pattern: SELECT * FROM api_keys WHERE organization_id = ?
     *
     * @example
     * ```sql
     * -- List all API keys for an organization
     * SELECT * FROM api_keys
     * WHERE organization_id = 'org-uuid'
     * AND deleted_at IS NULL;
     * ```
     */
    tenantIdx: index('api_keys_tenant_idx').on(table.organizationId),

    /**
     * Index: User lookup
     *
     * Optimizes queries to find all API keys created by a user.
     * Used for "my API keys" screens and user-scoped operations.
     *
     * Query pattern: SELECT * FROM api_keys WHERE user_id = ?
     *
     * @example
     * ```sql
     * -- List all API keys created by a user
     * SELECT * FROM api_keys
     * WHERE user_id = 'user-uuid'
     * AND deleted_at IS NULL;
     * ```
     */
    userIdx: index('api_keys_user_idx').on(table.userId),

    /**
     * Index: Active keys filter (composite)
     *
     * Optimizes queries for active, non-deleted keys.
     * Most common filter in authentication and listing queries.
     *
     * Query pattern: SELECT * FROM api_keys WHERE is_active = true AND deleted_at IS NULL
     *
     * Composite design:
     * - First column (isActive) for quick boolean filter
     * - Second column (deletedAt) for soft delete exclusion
     *
     * @example
     * ```sql
     * -- Find all active keys (authentication pre-filter)
     * SELECT * FROM api_keys
     * WHERE is_active = true
     * AND deleted_at IS NULL;
     * ```
     */
    activeIdx: index('api_keys_active_idx').on(table.isActive, table.deletedAt),

    /**
     * Index: Expiration lookup
     *
     * Optimizes queries to find expired or soon-to-expire keys.
     * Used for cleanup jobs and expiration notifications.
     *
     * Query pattern: SELECT * FROM api_keys WHERE expires_at < ?
     *
     * @example
     * ```sql
     * -- Find expired keys for cleanup
     * SELECT * FROM api_keys
     * WHERE expires_at < NOW()
     * AND deleted_at IS NULL;
     *
     * -- Find keys expiring in 7 days for notification
     * SELECT * FROM api_keys
     * WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'
     * AND deleted_at IS NULL;
     * ```
     */
    expiresIdx: index('api_keys_expires_idx').on(table.expiresAt),

    /**
     * Index: Key authentication lookup (composite)
     *
     * Primary index for API key authentication.
     * Combines tenant isolation with key hash lookup for security.
     *
     * Query pattern: SELECT * FROM api_keys WHERE organization_id = ? AND key_hash = ?
     *
     * Security design:
     * - Tenant-scoped to prevent cross-tenant key usage
     * - Hash lookup for O(1) authentication
     * - Composite for single index scan
     *
     * @example
     * ```sql
     * -- Authenticate API request
     * SELECT * FROM api_keys
     * WHERE organization_id = 'org-uuid'
     * AND key_hash = SHA256('provided-key')
     * AND is_active = true
     * AND deleted_at IS NULL
     * AND (expires_at IS NULL OR expires_at > NOW());
     * ```
     */
    keyLookupIdx: index('api_keys_lookup_idx').on(table.organizationId, table.keyHash)
  })
);

/**
 * API key select type
 *
 * Type representing an API key record as returned from SELECT queries.
 * All columns are included with their runtime types.
 *
 * @example
 * ```typescript
 * const key: ApiKey = await db.query.apiKeys.findFirst({
 *   where: eq(apiKeys.id, 'key-uuid')
 * });
 *
 * // Check if key is valid
 * const isValid = key.isActive
 *   && !key.deletedAt
 *   && (!key.expiresAt || key.expiresAt > new Date());
 * ```
 */
export type ApiKey = typeof apiKeys.$inferSelect;

/**
 * API key insert type
 *
 * Type representing the data needed to insert a new API key.
 * Required fields: organizationId, userId, name, keyHash, keyPrefix
 * Optional fields: description, scopes, isActive, expiresAt
 *
 * @example
 * ```typescript
 * // Generate a new API key
 * const rawKey = generateSecureKey(); // Returns 'sk_live_...'
 * const keyHash = sha256(rawKey);
 * const keyPrefix = rawKey.substring(0, 12);
 *
 * const newKey: NewApiKey = {
 *   organizationId: 'org-uuid',
 *   userId: 'user-uuid',
 *   name: 'Production API Key',
 *   keyHash,
 *   keyPrefix,
 *   scopes: ['read:users', 'write:orders'],
 *   expiresAt: addYears(new Date(), 1)
 * };
 *
 * await db.insert(apiKeys).values(newKey);
 *
 * // Return rawKey to user (only time it's shown)
 * return { keyId: newKey.id, key: rawKey };
 * ```
 */
export type NewApiKey = typeof apiKeys.$inferInsert;
