/**
 * Invitations table schema
 *
 * Stores user invitation records for organization membership invitations.
 * Supports multi-tenancy, PII encryption, invitation lifecycle management,
 * and role assignment upon acceptance.
 *
 * Architecture:
 * - Each invitation belongs to exactly one organization (tenant isolation)
 * - Email stored as SHA-256 hash (emailHash) for lookups
 * - Original email encrypted (emailEncrypted) for display
 * - Token-based invitation acceptance with SHA-256 hash
 * - Role assignment for when invitation is accepted
 *
 * Security features:
 * - Email stored as SHA-256 hash for O(1) lookups without PII exposure
 * - Original email encrypted at application level for display
 * - Invitation token stored as SHA-256 hash (original never stored)
 * - Tenant-scoped queries prevent cross-tenant access
 *
 * Lifecycle states:
 * - pending: Invitation sent, awaiting response
 * - accepted: User accepted invitation, became member
 * - expired: Invitation expired (expiresAt passed)
 * - cancelled: Invitation revoked before acceptance
 *
 * Compliance:
 * - GDPR: PII encryption, CASCADE DELETE for right to erasure
 * - SOC 2: Audit trail via timestamps, invitedBy tracking
 * - Multi-tenancy: Complete data isolation via organization_id
 *
 * @module db-core/schemas/invitations
 */

import { pgTable, serial, timestamp, integer, varchar, index, text } from 'drizzle-orm/pg-core';

/**
 * Invitations table
 *
 * Stores invitations for users to join organizations.
 * Each invitation is tenant-scoped to an organization.
 *
 * Architecture:
 * - Invitations are scoped to organizations for multi-tenancy
 * - Each invitation has a creator (invitedByUserId) for accountability
 * - Token-based acceptance flow with secure hash storage
 * - Role pre-assignment for post-acceptance permissions
 *
 * Query patterns optimized:
 * - Find invitations by organization (tenant listing)
 * - Find pending invitations by organization (member management)
 * - Find invitation by token hash (acceptance flow)
 * - Find invitations by email hash within organization (duplicate check)
 *
 * Relationship model:
 * - invitations → organizations (many-to-one, CASCADE DELETE)
 * - invitations → users (invitedByUserId, SET NULL on delete)
 *
 * Identifier relationships (application-level, not DB constraints):
 * - invitedByUserId (integer) → user's internal identifier (creator accountability)
 *
 * @example
 * ```typescript
 * // Create a new invitation
 * const email = 'user@example.com';
 * const token = generateRandomToken();
 *
 * await db.insert(invitations).values({
 *   organizationId: 1,
 *   emailHash: sha256(email.toLowerCase()),
 *   emailEncrypted: encrypt(email),
 *   tokenHash: sha256(token),
 *   status: 'pending',
 *   role: 'member',
 *   invitedByUserId: 5,
 *   expiresAt: addDays(new Date(), 7)
 * });
 *
 * // Find invitation by token hash (acceptance flow)
 * const invitation = await db.query.invitations.findFirst({
 *   where: and(
 *     eq(invitations.tokenHash, sha256(token)),
 *     eq(invitations.organizationId, 1),
 *     eq(invitations.status, 'pending')
 *   )
 * });
 * ```
 */
export const invitations = pgTable(
  'invitations',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and foreign key relationships
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the invitation record.
     * Used in foreign key relationships throughout the system.
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    /**
     * Foreign key reference to the organizations table
     *
     * Links this invitation to the parent organization.
     * CASCADE DELETE ensures invitations are removed when organization is deleted.
     *
     * Note: Uses dynamic require to avoid circular dependency
     * (organizations table may reference invitations in future).
     *
     * Constraints:
     * - NOT NULL: Every invitation must belong to an organization
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

    // ============================================
    // PII - ENCRYPTED EMAIL
    // Email stored with hash for lookup, encrypted for display
    // ============================================

    /**
     * SHA-256 hash of the invited email address
     *
     * Used for O(1) email-based lookups without exposing PII in indexes.
     * Nullable to support invitations without email (e.g., phone-only).
     *
     * Security pattern:
     * - Hash computed on write: SHA-256(lowercase(email))
     * - Enables "find by email" queries without storing plaintext
     * - Composite index with organizationId for tenant-scoped lookups
     *
     * @type {string | null} VARCHAR(64), nullable
     */
    emailHash: varchar('email_hash', { length: 64 }),

    /**
     * Encrypted email address
     *
     * Original email encrypted using application-level encryption.
     * Used for display purposes and email sending after decryption.
     *
     * Security pattern:
     * - Encrypted with AES-256-GCM via @package/encryption
     * - Decrypted only when needed for display/communication
     * - Never exposed in logs or indexes
     *
     * @type {string | null} TEXT, nullable (encrypted)
     */
    emailEncrypted: text('email_encrypted'),

    /**
     * Version of the encryption key used for email encryption
     *
     * Tracks which encryption key version was used to encrypt the email.
     * Required for key rotation scenarios where multiple key versions
     * may exist simultaneously.
     *
     * Security pattern:
     * - Stored alongside encrypted data for decryption routing
     * - Enables gradual key rotation without data re-encryption
     * - Format: GCP KMS key version path (e.g., "primary-encryption-key/cryptoKeyVersions/1")
     * - Unversioned: "primary-encryption-key" (when version tracking unavailable)
     *
     * @type {string} VARCHAR(100), NOT NULL
     */
    encryptionKeyVersion: varchar('encryption_key_version', { length: 100 }).notNull(),

    // ============================================
    // TOKEN STORAGE (ENCRYPTED)
    // Secure storage pattern for invitation tokens
    // ============================================

    /**
     * SHA-256 hash of the invitation token
     *
     * The full invitation token is never stored - only its hash.
     * Used for O(1) invitation acceptance lookups.
     *
     * Security pattern:
     * - Token shown once at creation (in acceptance URL), never stored
     * - Hash computed: SHA-256(token)
     * - Unique constraint prevents duplicate tokens
     *
     * @type {string} VARCHAR(255), NOT NULL, UNIQUE
     */
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),

    // ============================================
    // STATUS AND LIFECYCLE
    // Invitation state management
    // ============================================

    /**
     * Invitation status
     *
     * Current state of the invitation in its lifecycle.
     * Controls whether the invitation can be accepted.
     *
     * Valid values:
     * - 'pending': Invitation sent, awaiting response
     * - 'accepted': User accepted invitation, became member
     * - 'expired': Invitation expired (expiresAt passed)
     * - 'cancelled': Invitation revoked before acceptance
     *
     * @type {string} VARCHAR(50), NOT NULL, default: 'pending'
     */
    status: varchar('status', { length: 50 }).notNull().default('pending'),

    /**
     * Role to assign upon acceptance
     *
     * The role the invited user will receive when they accept.
     * Nullable to allow organization-default role assignment.
     *
     * Common values: 'owner', 'admin', 'member', 'guest'
     *
     * @type {string | null} VARCHAR(50), nullable
     */
    role: varchar('role', { length: 50 }),

    // ============================================
    // RELATIONSHIP TRACKING
    // Invitation creator for accountability
    // ============================================

    /**
     * User ID of the inviter
     *
     * The user who created this invitation.
     * Used for accountability and "my invitations" queries.
     *
     * Foreign key preserves invitation history while allowing user deletion.
     * SET NULL on delete ensures inviter removal does not block cleanup.
     *
     * @type {number | null} Integer, nullable
     */
    invitedByUserId: integer('invited_by_user_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./users.schema').users.id,
      { onDelete: 'set null' }
    ),

    // ============================================
    // TIMESTAMPS
    // Audit trail for invitation lifecycle
    // ============================================

    /**
     * Invitation expiration timestamp
     *
     * When the invitation expires and can no longer be accepted.
     * Nullable for invitations that never expire (not recommended).
     *
     * @type {Date | null} TIMESTAMP, nullable
     */
    expiresAt: timestamp('expires_at'),

    /**
     * Invitation acceptance timestamp
     *
     * When the invitation was accepted by the user.
     * Null for pending/expired/cancelled invitations.
     *
     * @type {Date | null} TIMESTAMP, nullable
     */
    acceptedAt: timestamp('accepted_at'),

    /**
     * Record creation timestamp
     *
     * When this invitation was created.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this invitation record was last modified.
     * Updated on status changes (pending → accepted/expired/cancelled).
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  // ============================================
  // INDEXES
  // Optimized query patterns for invitations
  // ============================================
  (table) => ({
    /**
     * Tenant-scoped status lookup index
     *
     * Optimizes queries filtering invitations by organization and status.
     * Used for "pending invitations for this organization" queries.
     *
     * Query example:
     * ```typescript
     * await db.query.invitations.findMany({
     *   where: and(
     *     eq(invitations.organizationId, 1),
     *     eq(invitations.status, 'pending')
     *   )
     * });
     * ```
     */
    tenantStatusIdx: index('invitations_tenant_status_idx').on(table.organizationId, table.status),

    /**
     * Tenant-scoped email lookup index
     *
     * Optimizes duplicate email checks within an organization.
     * Composite index ensures tenant isolation for email lookups.
     *
     * Query example:
     * ```typescript
     * await db.query.invitations.findFirst({
     *   where: and(
     *     eq(invitations.emailHash, emailHash),
     *     eq(invitations.organizationId, 1)
     *   )
     * });
     * ```
     */
    // P0: organizationId first for multi-tenant query pattern
    tenantEmailHashIdx: index('invitations_tenant_email_hash_idx').on(
      table.organizationId,
      table.emailHash
    ),

    /**
     * Index: Encryption key version lookup
     *
     * Optimizes queries for key rotation operations.
     * Used to find all invitations encrypted with a specific key version.
     *
     * Query pattern: SELECT * FROM invitations WHERE encryption_key_version = ?
     *
     * @example
     * ```sql
     * -- Find invitations needing re-encryption during key rotation
     * SELECT * FROM invitations
     * WHERE encryption_key_version = 'old-key-version';
     * ```
     */
    encryptionKeyVersionIdx: index('invitations_encryption_key_version_idx').on(
      table.encryptionKeyVersion
    )
  })
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================
// Inferred types from the invitations table schema.
// ============================================================================

/**
 * Invitation select type
 *
 * Represents a complete invitation record as returned from queries.
 * All columns are required (no undefined) except nullable database columns.
 *
 * @example
 * ```typescript
 * const invitation: Invitation = {
 *   id: 1,
 *   organizationId: 1,
 *   emailHash: 'abc123...',
 *   emailEncrypted: 'encrypted...',
 *   encryptionKeyVersion: 'primary-encryption-key/cryptoKeyVersions/1',
 *   tokenHash: 'hash...',
 *   status: 'pending',
 *   role: 'member',
 *   invitedByUserId: 5,
 *   expiresAt: new Date('2024-12-31'),
 *   acceptedAt: null,
 *   createdAt: new Date(),
 *   updatedAt: new Date()
 * };
 * ```
 */
export type Invitation = typeof invitations.$inferSelect;

/**
 * Invitation insert type
 *
 * Represents data for creating a new invitation.
 * Columns with defaults become optional (id, createdAt, updatedAt).
 *
 * @example
 * ```typescript
 * const newInvitation: NewInvitation = {
 *   organizationId: 1,
 *   emailHash: sha256('user@example.com'),
 *   emailEncrypted: encrypt('user@example.com'),
 *   encryptionKeyVersion: 'primary-encryption-key-v1',
 *   tokenHash: sha256(randomToken()),
 *   status: 'pending',
 *   role: 'member',
 *   invitedByUserId: 5,
 *   expiresAt: addDays(new Date(), 7)
 * };
 *
 * await db.insert(invitations).values(newInvitation);
 * ```
 */
export type NewInvitation = typeof invitations.$inferInsert;
