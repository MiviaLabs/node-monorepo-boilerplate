/**
 * User Identities table schema
 *
 * Stores authentication identities for users across multiple OAuth/social providers.
 * Supports multi-provider authentication, account linking, and phone-only users.
 *
 * Key features:
 * - One user can have multiple identities (Google, LinkedIn, phone, etc.)
 * - Each identity stores provider-specific data with PII encryption
 * - Phone-only users supported (email fields nullable)
 * - Account linking via userId foreign key with CASCADE DELETE
 * - O(1) lookups via strategic indexes
 *
 * Security features:
 * - Email addresses stored as SHA-256 hash (providerEmailHash) for lookups
 * - Original email encrypted (providerEmailEncrypted) for display
 * - Phone numbers encrypted (phoneNumberEncrypted) for PII protection
 *
 * Compliance:
 * - GDPR: PII encryption, CASCADE DELETE for right to erasure
 * - KSA/Qatar/UAE PDPL: Encrypted sensitive data
 * - SOC 2: Audit trail via timestamps
 *
 * @module db-core/schemas/user-identities
 */

import {
  pgTable,
  serial,
  timestamp,
  integer,
  boolean,
  varchar,
  index,
  text,
  unique
} from 'drizzle-orm/pg-core';

import { users } from './users.schema';

/**
 * Identity providers supported by the system
 *
 * Defines the authentication providers that can be used for user authentication.
 * Each provider has a unique identifier used in the `provider` column.
 *
 * @example
 * ```typescript
 * const googleIdentity = {
 *   provider: IdentityProvider.GOOGLE,
 *   providerUid: '123456789'
 * };
 * ```
 */
export enum IdentityProvider {
  /** Google OAuth provider (google.com) */
  GOOGLE = 'google.com',
  /** Microsoft OAuth provider (microsoft.com) */
  MICROSOFT = 'microsoft.com',
  /** Apple Sign-In provider (apple.com) */
  APPLE = 'apple.com',
  /** LinkedIn OAuth provider (linkedin.com) */
  LINKEDIN = 'linkedin.com',
  /** GitHub OAuth provider (github.com) */
  GITHUB = 'github.com',
  /** Facebook OAuth provider (facebook.com) */
  FACEBOOK = 'facebook.com',
  /** Phone number authentication (SMS/OTP) */
  PHONE = 'phone',
  /** Traditional email/password authentication */
  EMAIL_PASSWORD = 'email_password'
}

/**
 * User identities table
 *
 * Stores authentication identities for users across multiple providers.
 * Supports multi-provider auth, account linking, and phone-only users.
 *
 * Architecture:
 * - Each user (from users table) can have multiple identities
 * - Each identity represents one authentication method
 * - Primary identity flag indicates the main authentication method
 * - CASCADE DELETE ensures orphan cleanup when user is deleted
 *
 * Query patterns optimized:
 * - Find identity by provider + UID (authentication)
 * - Find all identities for a user (account management)
 * - Find primary identity for a user (default display)
 * - Find identity by email hash (account recovery)
 *
 * @example
 * ```typescript
 * // Insert a new Google identity
 * await db.insert(userIdentities).values({
 *   userId: 1,
 *   provider: IdentityProvider.GOOGLE,
 *   providerUid: 'google-uid-123',
 *   providerEmailHash: sha256(email),
 *   providerEmailEncrypted: encrypt(email),
 *   displayName: 'John Doe',
 *   emailVerified: true,
 *   isPrimary: true
 * });
 *
 * // Find identity for authentication
 * const identity = await db.query.userIdentities.findFirst({
 *   where: and(
 *     eq(userIdentities.provider, 'google.com'),
 *     eq(userIdentities.providerUid, 'google-uid-123')
 *   )
 * });
 * ```
 */
export const userIdentities = pgTable(
  'user_identities',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and foreign key relationships
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the identity record.
     * Not exposed externally - use provider + providerUid for lookups.
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    /**
     * Foreign key reference to the users table
     *
     * Links this identity to its parent user account.
     * CASCADE DELETE ensures identity is removed when user is deleted.
     *
     * Constraints:
     * - NOT NULL: Every identity must belong to a user
     * - ON DELETE CASCADE: Automatic cleanup when user is deleted
     *
     * @type {number} Integer referencing users.id
     * @see users
     */
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),

    // ============================================
    // PROVIDER DATA
    // OAuth/authentication provider information
    // ============================================

    /**
     * Authentication provider identifier
     *
     * Identifies which OAuth provider or authentication method
     * was used to create this identity. Values match IdentityProvider enum.
     *
     * Examples: 'google.com', 'github.com', 'phone', 'email_password'
     *
     * @type {string} VARCHAR(50), NOT NULL
     * @see IdentityProvider
     */
    provider: varchar('provider', { length: 50 }).notNull(),

    /**
     * Provider-specific unique identifier
     *
     * The unique ID assigned by the OAuth provider for this user.
     * Combined with provider, forms a globally unique identifier.
     *
     * Examples:
     * - Google: '123456789012345678901'
     * - GitHub: '12345678'
     * - Phone: '+1234567890' (hashed)
     *
     * @type {string} VARCHAR(255), NOT NULL
     */
    providerUid: varchar('provider_uid', { length: 255 }).notNull(),

    // ============================================
    // PII - ENCRYPTED EMAIL
    // Email stored with hash for lookup, encrypted for display
    // ============================================

    /**
     * SHA-256 hash of the provider email address
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
    providerEmailHash: varchar('provider_email_hash', { length: 64 }),

    /**
     * Encrypted provider email address
     *
     * Original email encrypted using application-level encryption.
     * Used for display purposes after decryption.
     *
     * Security pattern:
     * - Encrypted with AES-256-GCM
     * - Decrypted only when needed for display
     * - Never exposed in logs or indexes
     *
     * @type {string | null} TEXT, nullable (encrypted)
     */
    providerEmailEncrypted: text('provider_email_encrypted'),

    // ============================================
    // PII - ENCRYPTED PHONE
    // Phone number for SMS/OTP authentication
    // ============================================

    /**
     * Encrypted phone number
     *
     * Phone number encrypted using application-level encryption.
     * Used for phone-based authentication (SMS OTP).
     *
     * Security pattern:
     * - E.164 format before encryption: +[country][number]
     * - Encrypted with AES-256-GCM
     * - Lookup via providerUid (hashed phone) for PHONE provider
     *
     * @type {string | null} TEXT, nullable (encrypted)
     */
    phoneNumberEncrypted: text('phone_number_encrypted'),

    // ============================================
    // ENCRYPTION METADATA
    // Key version for encryption key rotation support
    // ============================================

    /**
     * Encryption key version identifier
     *
     * Identifies the version of the encryption key used to encrypt PII fields.
     * Used for encryption key rotation support - allows tracking which key
     * version was used for each identity's encrypted data.
     *
     * @type {string} VARCHAR(50), NOT NULL
     */
    encryptionKeyVersion: varchar('encryption_key_version', { length: 50 }).notNull(),

    // ============================================
    // PROFILE DATA
    // Non-sensitive profile information from provider
    // ============================================

    /**
     * Display name from the provider
     *
     * User's display name as provided by the OAuth provider.
     * May be full name, username, or custom display name.
     *
     * @type {string | null} VARCHAR(255), nullable
     */
    displayName: varchar('display_name', { length: 255 }),

    /**
     * Profile photo URL from the provider
     *
     * URL to the user's profile photo hosted by the OAuth provider.
     * May become stale if user changes their photo on the provider.
     *
     * @type {string | null} VARCHAR(500), nullable
     */
    photoUrl: varchar('photo_url', { length: 500 }),

    // ============================================
    // VERIFICATION STATUS
    // Email and phone verification flags
    // ============================================

    /**
     * Email verification status
     *
     * Indicates whether the provider has verified the user's email.
     * Set based on provider's email_verified claim in OAuth response.
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: false
     */
    emailVerified: boolean('email_verified').default(false).notNull(),

    /**
     * Phone verification status
     *
     * Indicates whether the phone number has been verified via SMS OTP.
     * Set to true after successful OTP verification.
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: false
     */
    phoneVerified: boolean('phone_verified').default(false).notNull(),

    // ============================================
    // ACCOUNT LINKING
    // Primary identity flag for multi-provider accounts
    // ============================================

    /**
     * Primary identity flag
     *
     * Indicates this is the user's primary authentication method.
     * Only one identity per user should have isPrimary = true.
     *
     * Usage:
     * - Used for default profile display (name, photo)
     * - Preferred authentication method
     * - First identity created is usually primary
     *
     * @type {boolean} BOOLEAN, NOT NULL, default: false
     */
    isPrimary: boolean('is_primary').default(false).notNull(),

    // ============================================
    // TIMESTAMPS
    // Audit trail for identity lifecycle
    // ============================================

    /**
     * Identity creation timestamp
     *
     * When this identity was first linked to the user account.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this identity record was last modified.
     * Updated on any field change (profile data, verification status).
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    /**
     * Last sign-in timestamp
     *
     * When the user last authenticated using this identity.
     * Updated on each successful authentication.
     *
     * @type {Date | null} TIMESTAMP, nullable
     */
    lastSignInAt: timestamp('last_sign_in_at')
  },
  (table) => ({
    // ============================================
    // UNIQUE CONSTRAINTS
    // Prevent duplicate identities
    // ============================================

    /**
     * Unique constraint: One identity per provider per user
     *
     * Prevents a user from having multiple identities from the same provider.
     * For example, a user cannot link two different Google accounts.
     *
     * Constraint: UNIQUE(user_id, provider)
     */
    userIdProviderUnique: unique('user_id_provider_unique').on(table.userId, table.provider),

    /**
     * Unique constraint: Provider UID globally unique per provider
     *
     * Prevents multiple users from linking the same external identity.
     * For example, one Google account cannot be linked to multiple users.
     *
     * Constraint: UNIQUE(provider, provider_uid)
     */
    providerUidUnique: unique('provider_uid_unique').on(table.provider, table.providerUid),

    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: User ID lookup
     *
     * Optimizes queries to find all identities for a user.
     * Used for account management screens showing linked accounts.
     *
     * Query pattern: SELECT * FROM user_identities WHERE user_id = ?
     *
     * @example
     * ```sql
     * -- Find all linked accounts for a user
     * SELECT * FROM user_identities WHERE user_id = 123;
     * ```
     */
    userIdIdx: index('user_identities_user_id_idx').on(table.userId),

    /**
     * Index: Provider UID lookup
     *
     * Optimizes single-column providerUid lookups.
     * Supports partial matching or cross-provider searches.
     *
     * Query pattern: SELECT * FROM user_identities WHERE provider_uid = ?
     */
    providerUidIdx: index('user_identities_provider_uid_idx').on(table.providerUid),

    /**
     * Index: Provider + UID composite lookup (authentication)
     *
     * Primary index for authentication flow.
     * Enables O(1) lookup of identity during OAuth callback.
     *
     * Query pattern: SELECT * FROM user_identities WHERE provider = ? AND provider_uid = ?
     *
     * @example
     * ```sql
     * -- Authenticate user via Google OAuth
     * SELECT * FROM user_identities
     * WHERE provider = 'google.com' AND provider_uid = '123456789';
     * ```
     */
    providerLookupIdx: index('user_identities_provider_lookup_idx').on(
      table.provider,
      table.providerUid
    ),

    /**
     * Index: Primary identity lookup
     *
     * Optimizes queries to find the primary identity for a user.
     * Used for displaying default profile information.
     *
     * Query pattern: SELECT * FROM user_identities WHERE user_id = ? AND is_primary = true
     *
     * @example
     * ```sql
     * -- Get primary identity for profile display
     * SELECT * FROM user_identities
     * WHERE user_id = 123 AND is_primary = true;
     * ```
     */
    primaryIdx: index('user_identities_primary_idx').on(table.userId, table.isPrimary),

    /**
     * Index: Email hash lookup (account recovery)
     *
     * Optimizes email-based identity lookups.
     * Used for "find account by email" and account recovery flows.
     *
     * Query pattern: SELECT * FROM user_identities WHERE provider_email_hash = ?
     *
     * Note: Only indexed when not null (phone-only identities excluded)
     *
     * @example
     * ```sql
     * -- Find account by email hash
     * SELECT * FROM user_identities
     * WHERE provider_email_hash = SHA256('user@example.com');
     * ```
     */
    providerEmailHashIdx: index('user_identities_provider_email_hash_idx').on(
      table.providerEmailHash
    ),

    /**
     * Index: Encryption key version lookup
     *
     * Optimizes queries for key rotation operations.
     * Used to find all identities encrypted with a specific key version.
     *
     * Query pattern: SELECT * FROM user_identities WHERE encryption_key_version = ?
     *
     * @example
     * ```sql
     * -- Find identities needing re-encryption during key rotation
     * SELECT * FROM user_identities
     * WHERE encryption_key_version = 'old-key-version';
     * ```
     */
    encryptionKeyVersionIdx: index('user_identities_encryption_key_version_idx').on(
      table.encryptionKeyVersion
    )
  })
);

/**
 * User identity select type
 *
 * Type representing a user identity record as returned from SELECT queries.
 * All columns are included with their runtime types.
 *
 * @example
 * ```typescript
 * const identity: UserIdentity = await db.query.userIdentities.findFirst({
 *   where: eq(userIdentities.id, 1)
 * });
 * ```
 */
export type UserIdentity = typeof userIdentities.$inferSelect;

/**
 * User identity insert type
 *
 * Type representing the data needed to insert a new user identity.
 * Required fields: userId, provider, providerUid
 * Optional fields: all others with defaults
 *
 * @example
 * ```typescript
 * const newIdentity: NewUserIdentity = {
 *   userId: 1,
 *   provider: IdentityProvider.GOOGLE,
 *   providerUid: 'google-uid-123',
 *   displayName: 'John Doe',
 *   emailVerified: true
 * };
 * await db.insert(userIdentities).values(newIdentity);
 * ```
 */
export type NewUserIdentity = typeof userIdentities.$inferInsert;
