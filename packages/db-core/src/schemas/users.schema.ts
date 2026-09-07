/**
 * Users table schema
 *
 * Stores user profile data and organization membership.
 * Authentication credentials are stored separately in user_identities table.
 *
 * Architecture:
 * - Users belong to exactly one organization (single-tenant per user)
 * - Authentication handled via user_identities (multi-provider support)
 * - PII fields encrypted at application level
 * - Soft delete for GDPR compliance
 *
 * Security features:
 * - Email stored as SHA-256 hash (emailHash) for lookups
 * - Original email encrypted (emailEncrypted) for display
 * - Name fields encrypted (firstNameEncrypted, lastNameEncrypted)
 * - Phone number encrypted (phoneNumberEncrypted)
 *
 * Multi-provider support changes:
 * - Removed: gcpUid, provider, emailVerified (moved to user_identities)
 * - Changed: emailHash is nullable (phone-only users supported)
 * - Added: phoneNumberEncrypted for profile phone number
 *
 * Compliance:
 * - GDPR: PII encryption, soft delete, right to erasure via CASCADE
 * - KSA/Qatar/UAE PDPL: Encrypted sensitive data
 * - SOC 2: Audit trail via timestamps
 *
 * @module db-core/schemas/users
 */

import {
  pgTable,
  serial,
  timestamp,
  integer,
  boolean,
  varchar,
  index,
  text
} from 'drizzle-orm/pg-core';

/**
 * Users table
 *
 * Core user profile data with organization membership.
 * Each user belongs to exactly one organization.
 *
 * Relationship model:
 * - users → organizations (many-to-one, CASCADE DELETE)
 * - users ← user_identities (one-to-many, CASCADE DELETE)
 * - users ← user_tenants (one-to-many, CASCADE DELETE)
 * - users ← user_roles (one-to-many, CASCADE DELETE)
 *
 * Query patterns optimized:
 * - Find user by email hash (authentication)
 * - Find users by organization (tenant listing)
 * - Find active users in organization (member management)
 *
 * @example
 * ```typescript
 * // Create a new user
 * await db.insert(users).values({
 *   organizationId: 1,
 *   emailHash: sha256(email.toLowerCase()),
 *   emailEncrypted: encrypt(email),
 *   firstNameEncrypted: encrypt('John'),
 *   lastNameEncrypted: encrypt('Doe'),
 *   displayName: 'John D.',
 *   isActive: true
 * });
 *
 * // Find user by email hash
 * const user = await db.query.users.findFirst({
 *   where: and(
 *     eq(users.emailHash, sha256(email)),
 *     isNull(users.deletedAt)
 *   )
 * });
 * ```
 */
export const users = pgTable(
  'users',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and foreign key relationships
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the user record.
     * Used in foreign key relationships throughout the system.
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    /**
     * Foreign key reference to the organizations table
     *
     * Links this user to their parent organization.
     * CASCADE DELETE ensures user is removed when organization is deleted.
     *
     * Note: Uses dynamic require to avoid circular dependency
     * (organizations.ownerId references users.id).
     *
     * Constraints:
     * - NOT NULL: Every user must belong to an organization
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
     * SHA-256 hash of the user's primary email address
     *
     * Used for O(1) email-based lookups without exposing PII in indexes.
     * Nullable to support phone-only authentication methods.
     *
     * Security pattern:
     * - Hash computed on write: SHA-256(lowercase(email))
     * - Enables "find by email" queries without storing plaintext
     * - Indexed for efficient lookups
     *
     * @type {string | null} VARCHAR(64), nullable
     */
    emailHash: varchar('email_hash', { length: 64 }),

    /**
     * Encrypted primary email address
     *
     * Original email encrypted using application-level encryption.
     * Used for display purposes and communications after decryption.
     *
     * Security pattern:
     * - Encrypted with AES-256-GCM
     * - Decrypted only when needed for display/communication
     * - Never exposed in logs or indexes
     *
     * @type {string | null} TEXT, nullable (encrypted)
     */
    emailEncrypted: text('email_encrypted'),

    // ============================================
    // PII - ENCRYPTED PROFILE FIELDS
    // Name and phone stored encrypted
    // ============================================

    /**
     * Encrypted first name
     *
     * User's first name encrypted using application-level encryption.
     * Stored separately from lastName for flexible display options.
     *
     * Security pattern:
     * - Encrypted with AES-256-GCM
     * - Decrypted only when needed for display
     *
     * @type {string | null} TEXT, nullable (encrypted)
     */
    firstNameEncrypted: text('first_name_encrypted'),

    /**
     * Encrypted last name
     *
     * User's last name encrypted using application-level encryption.
     * Combined with firstNameEncrypted for full name display.
     *
     * Security pattern:
     * - Encrypted with AES-256-GCM
     * - Decrypted only when needed for display
     *
     * @type {string | null} TEXT, nullable (encrypted)
     */
    lastNameEncrypted: text('last_name_encrypted'),

    // ============================================
    // PUBLIC PROFILE FIELDS
    // Non-sensitive profile information
    // ============================================

    /**
     * Public display name
     *
     * User-chosen display name for UI elements.
     * Not encrypted as it's intended for public display.
     *
     * Use cases:
     * - Comments and activity feeds
     * - User mentions (@displayName)
     * - Profile cards and avatars
     *
     * @type {string | null} VARCHAR(255), nullable
     */
    displayName: varchar('display_name', { length: 255 }),

    /**
     * Encrypted phone number
     *
     * User's phone number encrypted using application-level encryption.
     * Used for profile display and optional SMS notifications.
     *
     * Security pattern:
     * - E.164 format before encryption: +[country][number]
     * - Encrypted with AES-256-GCM
     * - Different from identity phone (stored in user_identities)
     *
     * @type {string | null} TEXT, nullable (encrypted)
     */
    phoneNumberEncrypted: text('phone_number_encrypted'),

    /**
     * Encryption key version identifier
     *
     * Version of the encryption key used to encrypt PII fields.
     * Used for key rotation tracking and re-encryption operations.
     *
     * Security pattern:
     * - Set on user creation with current key version
     * - Updated when re-encrypting with new key version
     * - Enables tracking which key version was used for encryption
     *
     * @type {string} VARCHAR(50), NOT NULL
     */
    encryptionKeyVersion: varchar('encryption_key_version', { length: 50 }).notNull(),

    /**
     * Profile photo URL
     *
     * URL to the user's profile photo.
     * Can be internal (uploaded) or external (OAuth provider).
     *
     * @type {string | null} VARCHAR(500), nullable
     */
    photoUrl: varchar('photo_url', { length: 500 }),

    /**
     * Attached avatar file reference
     *
     * Points at the canonical file row for newly uploaded user avatars.
     * During rollout, legacy external photoUrl values remain supported when
     * no avatar file is attached yet.
     *
     * @type {number | null} Integer referencing files.id, nullable
     */
    avatarFileId: integer('avatar_file_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./files.schema').files.id,
      {
        onDelete: 'set null'
      }
    ),

    // ============================================
    // STATUS FLAGS
    // Account state management
    // ============================================

    /**
     * Active status flag
     *
     * Whether the user account is currently active.
     * Inactive users cannot authenticate or access resources.
     *
     * Use cases:
     * - Temporary account suspension
     * - Deprovisioning without deletion
     * - Admin-initiated disabling
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: true
     */
    isActive: boolean('is_active').default(true).notNull(),

    /**
     * Verification status flag
     *
     * Whether the user has completed account verification.
     * Separate from email/phone verification in identities.
     *
     * Use cases:
     * - Account setup completion tracking
     * - Gating access to certain features
     * - KYC/identity verification status
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: false
     */
    isVerified: boolean('is_verified').default(false).notNull(),

    // ============================================
    // TIMESTAMPS
    // Audit trail for user lifecycle
    // ============================================

    /**
     * Record creation timestamp
     *
     * When this user account was created.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this user record was last modified.
     * Updated on any field change (profile, status).
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    /**
     * Last sign-in timestamp
     *
     * When the user last authenticated to the system.
     * Updated on each successful authentication.
     *
     * @type {Date | null} TIMESTAMP, nullable
     */
    lastSignInAt: timestamp('last_sign_in_at'),

    // ============================================
    // SOFT DELETE
    // GDPR compliance and audit trail
    // ============================================

    /**
     * Soft delete timestamp
     *
     * When the user was soft-deleted (null = not deleted).
     * Soft-deleted users are excluded from queries but preserved for audit.
     *
     * GDPR compliance:
     * - Supports right to erasure while preserving audit trail
     * - Related data (identities, roles) CASCADE deleted
     * - PII can be anonymized while keeping record
     *
     * @type {Date | null} TIMESTAMP, nullable (null = not deleted)
     */
    deletedAt: timestamp('deleted_at')
  },
  (table) => ({
    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: Email hash lookup
     *
     * Optimizes email-based user lookups.
     * Primary index for authentication flows.
     *
     * Query pattern: SELECT * FROM users WHERE email_hash = ?
     *
     * @example
     * ```sql
     * -- Find user by email hash
     * SELECT * FROM users
     * WHERE email_hash = SHA256('user@example.com')
     * AND deleted_at IS NULL;
     * ```
     */
    emailHashIdx: index('users_email_hash_idx').on(table.emailHash),

    /**
     * Index: Tenant + email composite lookup
     *
     * Optimizes email lookups within a specific organization.
     * Ensures tenant isolation in multi-tenant queries.
     *
     * Query pattern: SELECT * FROM users WHERE organization_id = ? AND email_hash = ?
     *
     * @example
     * ```sql
     * -- Find user by email within organization
     * SELECT * FROM users
     * WHERE organization_id = 1
     * AND email_hash = SHA256('user@example.com')
     * AND deleted_at IS NULL;
     * ```
     */
    tenantEmailHashIdx: index('users_tenant_email_hash_idx').on(
      table.organizationId,
      table.emailHash
    ),

    /**
     * Index: Organization + soft delete composite
     *
     * Optimizes queries for active (non-deleted) users in an organization.
     * Critical for tenant member listings and user management.
     *
     * Query pattern: SELECT * FROM users WHERE organization_id = ? AND deleted_at IS NULL
     *
     * @example
     * ```sql
     * -- List all active users in organization
     * SELECT * FROM users
     * WHERE organization_id = 1
     * AND deleted_at IS NULL
     * ORDER BY created_at DESC;
     * ```
     */
    orgDeletedIdx: index('users_org_deleted_idx').on(table.organizationId, table.deletedAt),

    /**
     * Index: Encryption key version lookup
     *
     * Optimizes queries for key rotation operations.
     * Used to find all users encrypted with a specific key version.
     *
     * Query pattern: SELECT * FROM users WHERE encryption_key_version = ?
     *
     * @example
     * ```sql
     * -- Find users needing re-encryption during key rotation
     * SELECT * FROM users
     * WHERE encryption_key_version = 'old-key-version';
     * ```
     */
    encryptionKeyVersionIdx: index('users_encryption_key_version_idx').on(
      table.encryptionKeyVersion
    )
  })
);

/**
 * User select type
 *
 * Type representing a user record as returned from SELECT queries.
 * All columns are included with their runtime types.
 *
 * @example
 * ```typescript
 * const user: User = await db.query.users.findFirst({
 *   where: eq(users.id, 1)
 * });
 *
 * // Check if user is active and not deleted
 * const isAccessible = user.isActive && !user.deletedAt;
 * ```
 */
export type User = typeof users.$inferSelect;

/**
 * User insert type
 *
 * Type representing the data needed to insert a new user.
 * Required fields: organizationId
 * Optional fields: all others with defaults
 *
 * @example
 * ```typescript
 * const newUser: NewUser = {
 *   organizationId: 1,
 *   emailHash: sha256(email.toLowerCase()),
 *   emailEncrypted: encrypt(email),
 *   firstNameEncrypted: encrypt('John'),
 *   lastNameEncrypted: encrypt('Doe'),
 *   displayName: 'John D.'
 * };
 * await db.insert(users).values(newUser);
 * ```
 */
export type NewUser = typeof users.$inferInsert;
