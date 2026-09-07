/**
 * Password Reset Tokens table schema
 *
 * Stores secure password reset tokens for user-initiated password recovery.
 * Supports multi-tenancy, PII encryption, token lifecycle management,
 * and secure token-based password reset flow.
 *
 * Architecture:
 * - Each token belongs to exactly one organization (tenant isolation)
 * - User reference stored as encrypted identifier (emailHash or userId)
 * - Token-based reset flow with SHA-256 hash
 * - Expiration-based token invalidation
 * - Single-use tokens with soft-delete pattern
 *
 * Security features:
 * - Token stored as SHA-256 hash (original never stored)
 * - Tenant-scoped queries prevent cross-tenant access
 * - Email hash for secure lookup without PII exposure
 * - Expiration timestamp for automatic invalidation
 * - Single-use tokens (usedAt soft-delete pattern)
 *
 * Lifecycle states:
 * - active: Token generated, awaiting use (usedAt = null, expiresAt > now)
 * - used: Token consumed for password reset (usedAt != null)
 * - expired: Token expired (expiresAt <= now)
 *
 * Compliance:
 * - GDPR: PII encryption, CASCADE DELETE for right to erasure
 * - SOC 2: Audit trail via timestamps
 * - Multi-tenancy: Complete data isolation via organization_id
 *
 * @module db-core/schemas/password-reset-tokens
 */

import { pgTable, serial, timestamp, integer, varchar, index, text } from 'drizzle-orm/pg-core';

/**
 * Password Reset Tokens table
 *
 * Stores tokens for user-initiated password reset requests.
 * Each token is tenant-scoped to an organization.
 *
 * Architecture:
 * - Tokens are scoped to organizations for multi-tenancy
 * - Each token has a creator (userId) for accountability
 * - Token-based reset flow with secure hash storage
 * - Single-use tokens with soft-delete pattern (usedAt)
 *
 * Query patterns optimized:
 * - Find tokens by organization (tenant listing)
 * - Find active tokens by organization (admin management)
 * - Find token by token hash (reset confirmation flow)
 * - Find tokens by email hash within organization (user lookup)
 *
 * Relationship model:
 * - password_reset_tokens → organizations (many-to-one, CASCADE DELETE)
 * - password_reset_tokens → users (userId, CASCADE DELETE)
 *
 * Identifier relationships (application-level, not DB constraints):
 * - userId (integer) → user's internal identifier (accountability)
 *
 * @example
 * ```typescript
 * // Create a new password reset token
 * const email = 'user@example.com';
 * const token = generateRandomToken();
 *
 * await db.insert(passwordResetTokens).values({
 *   organizationId: 1,
 *   userId: 5,
 *   emailHash: sha256(email.toLowerCase()),
 *   tokenHash: sha256(token),
 *   expiresAt: addHours(new Date(), 1) // 1 hour expiry
 * });
 *
 * // Find token by token hash (reset confirmation flow)
 * const resetToken = await db.query.passwordResetTokens.findFirst({
 *   where: and(
 *     eq(passwordResetTokens.tokenHash, sha256(token)),
 *     eq(passwordResetTokens.organizationId, 1),
 *     isNull(passwordResetTokens.usedAt),
 *     gt(passwordResetTokens.expiresAt, new Date())
 *   )
 * });
 * ```
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and foreign key relationships
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the password reset token record.
     * Used in foreign key relationships throughout the system.
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    /**
     * Foreign key reference to the organizations table
     *
     * Links this token to the parent organization.
     * CASCADE DELETE ensures tokens are removed when organization is deleted.
     *
     * Note: Uses dynamic require to avoid circular dependency
     * (organizations table may reference tokens in future).
     *
     * Constraints:
     * - NOT NULL: Every token must belong to an organization
     * - ON DELETE CASCADE: Automatic cleanup when organization is deleted
     *
     * @type {number} Integer referencing organizations.id
     * @see organizations
     */
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        {
          onDelete: 'cascade'
        }
      ),

    /**
     * Foreign key reference to the users table
     *
     * Links this token to the user requesting password reset.
     * CASCADE DELETE ensures tokens are removed when user is deleted.
     *
     * Note: Uses dynamic require to avoid circular dependency.
     *
     * Constraints:
     * - NOT NULL: Every token must belong to a user
     * - ON DELETE CASCADE: Automatic cleanup when user is deleted
     *
     * @type {number} Integer referencing users.id
     * @see users
     */
    userId: integer('user_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        {
          onDelete: 'cascade'
        }
      ),

    // ============================================
    // PII - EMAIL HASH (FOR LOOKUP)
    // Email hash for secure lookup without PII exposure
    // ============================================

    /**
     * SHA-256 hash of the user's email address
     *
     * Used for O(1) email-based lookups without exposing PII in indexes.
     * Allows finding tokens by email without storing plaintext.
     *
     * Security pattern:
     * - Hash computed on write: SHA-256(lowercase(email))
     * - Enables "find by email" queries without storing plaintext
     * - Composite index with organizationId for tenant-scoped lookups
     *
     * @type {string} VARCHAR(64), NOT NULL
     */
    emailHash: varchar('email_hash', { length: 64 }).notNull(),

    // ============================================
    // TOKEN STORAGE (ENCRYPTED)
    // Secure storage pattern for reset tokens
    // ============================================

    /**
     * SHA-256 hash of the reset token
     *
     * The full reset token is never stored - only its hash.
     * Used for O(1) token validation lookups.
     *
     * Security pattern:
     * - Token shown once at creation (in reset URL), never stored
     * - Hash computed: SHA-256(token)
     * - Unique constraint prevents duplicate tokens
     *
     * @type {string} VARCHAR(255), NOT NULL, UNIQUE
     */
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),

    // ============================================
    // METADATA
    // Additional context for audit and debugging
    // ============================================

    /**
     * IP address of the requester (optional)
     *
     * IP address from which the password reset was requested.
     * Used for security auditing and abuse detection.
     *
     * Note: IP addresses are considered PII in GDPR.
     * Should be hashed or excluded from logs.
     *
     * @type {string | null} VARCHAR(45), nullable (IPv4 or IPv6)
     */
    requestIp: varchar('request_ip', { length: 45 }),

    /**
     * User agent of the requester (optional)
     *
     * Browser/client information from the password reset request.
     * Used for security auditing and abuse detection.
     *
     * @type {string | null} TEXT, nullable
     */
    requestUserAgent: text('request_user_agent'),

    // ============================================
    // TIMESTAMPS
    // Audit trail for token lifecycle
    // ============================================

    /**
     * Token expiration timestamp
     *
     * When the token expires and can no longer be used.
     * Typically set to 1 hour from creation.
     *
     * @type {Date} TIMESTAMP, NOT NULL
     */
    expiresAt: timestamp('expires_at').notNull(),

    /**
     * Token usage timestamp
     *
     * When the token was used for password reset.
     * Null for active/expired tokens.
     *
     * Soft-delete pattern:
     * - usedAt = null: Token is active (can be used)
     * - usedAt != null: Token is consumed (cannot be reused)
     *
     * @type {Date | null} TIMESTAMP, nullable
     */
    usedAt: timestamp('used_at'),

    /**
     * Soft delete timestamp
     *
     * When the token was soft deleted.
     * Null for active tokens. Provides a general deletion marker
     * distinct from usedAt lifecycle field.
     *
     * @type {Date | null} TIMESTAMP, nullable
     */
    deletedAt: timestamp('deleted_at'),

    /**
     * Record creation timestamp
     *
     * When this token was created.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this token record was last modified.
     * Updated on usedAt change.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  // ============================================
  // INDEXES
  // Optimized query patterns for password reset tokens
  // ============================================
  (table) => ({
    /**
     * Tenant-scoped email lookup index
     *
     * Optimizes queries filtering tokens by organization and email.
     * Used for "find active tokens for this user" queries.
     *
     * Query example:
     * ```typescript
     * await db.query.passwordResetTokens.findMany({
     *   where: and(
     *     eq(passwordResetTokens.organizationId, 1),
     *     eq(passwordResetTokens.emailHash, emailHash),
     *     isNull(passwordResetTokens.usedAt)
     *   )
     * });
     * ```
     */
    // P0: organizationId first for multi-tenant query pattern
    tenantEmailHashIdx: index('password_reset_tokens_tenant_email_hash_idx').on(
      table.organizationId,
      table.emailHash
    ),

    /**
     * Tenant-scoped user lookup index
     *
     * Optimizes queries filtering tokens by organization and user.
     * Used for "list tokens for this user" queries.
     *
     * Query example:
     * ```typescript
     * await db.query.passwordResetTokens.findMany({
     *   where: and(
     *     eq(passwordResetTokens.organizationId, 1),
     *     eq(passwordResetTokens.userId, userId)
     *   )
     * });
     * ```
     */
    tenantUserIdx: index('password_reset_tokens_tenant_user_idx').on(
      table.organizationId,
      table.userId
    ),

    /**
     * Expiration cleanup index
     *
     * Optimizes queries for cleaning up expired tokens.
     * Used by background jobs to purge old tokens.
     *
     * Query example:
     * ```typescript
     * await db.delete(passwordResetTokens).where(
     *   and(
     *     lt(passwordResetTokens.expiresAt, new Date()),
     *     isNull(passwordResetTokens.usedAt)
     *   )
     * );
     * ```
     */
    expiresAtIdx: index('password_reset_tokens_expires_at_idx').on(table.expiresAt),

    /**
     * Token validation composite index
     *
     * Optimizes token validation queries checking active status.
     * Covers: tokenHash lookup + usedAt check + expiresAt check
     *
     * Query example:
     * ```typescript
     * await db.query.passwordResetTokens.findFirst({
     *   where: and(
     *     eq(passwordResetTokens.tokenHash, tokenHash),
     *     isNull(passwordResetTokens.usedAt),
     *     gt(passwordResetTokens.expiresAt, new Date())
     *   )
     * });
     * ```
     */
    tokenValidationIdx: index('password_reset_tokens_token_validation_idx').on(
      table.tokenHash,
      table.usedAt,
      table.expiresAt
    )
  })
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================
// Inferred types from the password_reset_tokens table schema.
// ============================================================================

/**
 * Password Reset Token select type
 *
 * Represents a complete password reset token record as returned from queries.
 * All columns are required (no undefined) except nullable database columns.
 *
 * @example
 * ```typescript
 * const token: PasswordResetToken = {
 *   id: 1,
 *   organizationId: 1,
 *   userId: 5,
 *   emailHash: 'abc123...',
 *   tokenHash: 'hash...',
 *   requestIp: '192.168.1.1',
 *   requestUserAgent: 'Mozilla/5.0...',
 *   expiresAt: new Date('2024-12-31T13:00:00Z'),
 *   usedAt: null,
 *   createdAt: new Date(),
 *   updatedAt: new Date()
 * };
 * ```
 */
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

/**
 * Password Reset Token insert type
 *
 * Represents data for creating a new password reset token.
 * Columns with defaults become optional (id, createdAt, updatedAt).
 *
 * @example
 * ```typescript
 * const newToken: NewPasswordResetToken = {
 *   organizationId: 1,
 *   userId: 5,
 *   emailHash: sha256('user@example.com'),
 *   tokenHash: sha256(randomToken()),
 *   expiresAt: addHours(new Date(), 1),
 *   requestIp: '192.168.1.1',
 *   requestUserAgent: 'Mozilla/5.0...'
 * };
 *
 * await db.insert(passwordResetTokens).values(newToken);
 * ```
 */
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
