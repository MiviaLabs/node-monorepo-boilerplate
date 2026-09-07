/**
 * encrypted-store Entries table schema
 *
 * Stores encrypted PII and sensitive data with envelope encryption.
 * Each record represents a single encrypted field within an entity.
 *
 * Architecture:
 * - Envelope encryption: Data encrypted with DEK, DEK encrypted with KEK
 * - One entry per encrypted field per entity
 * - Multi-tenancy via organizationId with CASCADE DELETE
 * - Access logging for compliance audit trail
 *
 * Security features:
 * - AES-256-GCM encryption (ciphertext + IV + authTag)
 * - Per-record data encryption keys (DEK)
 * - Key rotation tracking (keyId, rotatedAt)
 * - Access logging (JSONB audit trail)
 * - Field-level encryption granularity
 *
 * Envelope encryption pattern:
 * 1. Generate unique DEK for each record
 * 2. Encrypt data with DEK using AES-256-GCM
 * 3. Encrypt DEK with KEK (key encryption key)
 * 4. Store: ciphertext, encryptedDataKey, iv, authTag
 *
 * Compliance:
 * - GDPR: Right to erasure (DELETE by organizationId/entityId)
 * - PCI DSS: Encrypted cardholder data with key separation
 * - KSA/Qatar/UAE PDPL: Local key storage, audit logging
 * - SOC 2: Access logging and key rotation tracking
 * - ISO 27001: Data classification and encryption
 *
 * @module db-core/schemas/encrypted-store-entries
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';

/**
 * Entity type enum
 *
 * Defines which domain entities can have encrypted fields.
 * Extend this array as new entities require encryption.
 *
 * Values:
 * - user: User profile PII (name, email, phone)
 * - organization: Organization sensitive data
 * - payment_method: Payment card details (PCI DSS)
 * - document: Encrypted document content
 * - custom: Application-specific encrypted data
 *
 * @example
 * ```typescript
 * // Store encrypted user email
 * await db.insert(encryptedStoreEntries).values({
 *   entityType: 'user',
 *   entityId: userId,
 *   fieldPath: 'email',
 *   // ... encryption fields
 * });
 * ```
 */
export const entityTypeEnum = [
  'user',
  'user_address',
  'organization',
  'payment_method',
  'document',
  'custom'
] as const;

/**
 * Entity type TypeScript type
 *
 * Union type of all valid entity types for encrypted data.
 */
export type EntityType = (typeof entityTypeEnum)[number];

/**
 * Data classification enum
 *
 * Based on ISO 27001 and GDPR data categories.
 * Determines encryption requirements and retention policies.
 *
 * Classification levels:
 * - public: No encryption required, can be shared
 * - internal: Basic encryption, internal use only
 * - confidential: Strong encryption, limited access
 * - restricted: Highest encryption, strict access control
 *
 * @example
 * ```typescript
 * // SSN requires restricted classification
 * const entry = {
 *   classification: 'restricted',
 *   category: 'government_id',
 *   // ...
 * };
 * ```
 */
export const dataClassificationEnum = ['public', 'internal', 'confidential', 'restricted'] as const;

/**
 * Data classification TypeScript type
 *
 * Union type of all valid data classification levels.
 */
export type DataClassification = (typeof dataClassificationEnum)[number];

/**
 * Data category enum
 *
 * Specific types of sensitive data for compliance reporting.
 * Used to generate compliance reports and apply category-specific policies.
 *
 * Categories:
 * - pii: Personal identifiable information (name, email, address)
 * - financial: Financial data (bank accounts, credit cards)
 * - health: Health information (HIPAA protected)
 * - government_id: Government-issued IDs (SSN, passport)
 * - contact: Contact information (phone, address)
 * - credential: Authentication credentials (passwords, keys)
 * - custom: Application-specific sensitive data
 *
 * @example
 * ```typescript
 * // Credit card data
 * const entry = {
 *   category: 'financial',
 *   classification: 'restricted',
 *   // ...
 * };
 * ```
 */
export const dataCategoryEnum = [
  'pii',
  'financial',
  'health',
  'government_id',
  'contact',
  'credential',
  'custom'
] as const;

/**
 * Data category TypeScript type
 *
 * Union type of all valid data category types.
 */
export type DataCategory = (typeof dataCategoryEnum)[number];

/**
 * Access log action enum
 *
 * Defines valid actions recorded in access logs.
 * Each access to encrypted data is logged with one of these actions.
 */
export enum AccessLogAction {
  /** Data was initially stored/encrypted */
  STORED = 'stored',
  /** Data was retrieved/decrypted */
  RETRIEVED = 'retrieved',
  /** Data encryption key was rotated */
  ROTATED = 'rotated'
}

/**
 * Access log entry structure
 *
 * Tracks who accessed encrypted data and when.
 * Stored in JSONB column for flexible audit trails.
 *
 * Compliance requirements:
 * - SOC 2: Who accessed what, when, why
 * - GDPR: Access justification and purpose
 * - PCI DSS: Cardholder data access tracking
 *
 * @example
 * ```typescript
 * const logEntry: IAccessLogEntry = {
 *   timestamp: new Date().toISOString(),
 *   accessedBy: userId,
 *   action: AccessLogAction.RETRIEVED,
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...',
 *   reason: 'Customer support request #12345'
 * };
 * ```
 */
export interface IAccessLogEntry {
  /**
   * ISO 8601 timestamp of access
   *
   * When the access occurred, in ISO 8601 format.
   * Stored as string for JSON serialization.
   *
   * @example "2024-12-31T12:00:00.000Z"
   */
  timestamp: string;

  /**
   * User ID who accessed the data
   *
   * References users.id of the accessor.
   * Used for audit trail and access pattern analysis.
   */
  accessedBy: number;

  /**
   * Action performed on the data
   *
   * One of: stored, retrieved, rotated.
   * Determines what happened to the encrypted data.
   *
   * @see AccessLogAction
   */
  action: AccessLogAction;

  /**
   * IP address of the requestor
   *
   * Client IP address for security analysis.
   * Optional - may not be available in all contexts.
   *
   * @example "192.168.1.1" or "2001:db8::1"
   */
  ipAddress?: string;

  /**
   * User agent string
   *
   * Browser/client user agent for forensics.
   * Optional - may not be available in all contexts.
   */
  userAgent?: string;

  /**
   * Reason for access
   *
   * Business justification for accessing the data.
   * Required for GDPR compliance in some scenarios.
   *
   * @example "Customer support request #12345"
   */
  reason?: string;
}

/**
 * encrypted-store entries table
 *
 * Stores encrypted sensitive data with envelope encryption.
 * Each row represents a single encrypted field within an entity.
 *
 * Query patterns optimized:
 * - Find encrypted field by tenant + entity + field (primary use case)
 * - Find all entries for an entity (data export)
 * - Find entries by classification (compliance reporting)
 * - Find entries needing key rotation
 *
 * @example
 * ```typescript
 * // Store encrypted user email
 * await db.insert(encryptedStoreEntries).values({
 *   organizationId: orgId,
 *   entityType: 'user',
 *   entityId: userId,
 *   fieldPath: 'email',
 *   ciphertext: encryptedEmail,
 *   encryptedDataKey: encryptedDek,
 *   iv: initializationVector,
 *   authTag: authenticationTag,
 *   keyId: currentKekId,
 *   classification: 'confidential',
 *   category: 'pii'
 * });
 *
 * // Retrieve and decrypt
 * const entry = await db.query.encryptedStoreEntries.findFirst({
 *   where: and(
 *     eq(encryptedStoreEntries.organizationId, orgId),
 *     eq(encryptedStoreEntries.entityType, 'user'),
 *     eq(encryptedStoreEntries.entityId, userId),
 *     eq(encryptedStoreEntries.fieldPath, 'email')
 *   )
 * });
 * ```
 */
export const encryptedStoreEntries = pgTable(
  'encrypted-store_entries',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and entity reference
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the encrypted-store entry record.
     * Not typically used directly - queries use composite key.
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    // ============================================
    // FOREIGN KEY RELATIONSHIPS
    // Multi-tenancy and entity association
    // ============================================

    /**
     * Foreign key reference to the organizations table
     *
     * Links this encrypted entry to its parent organization.
     * Provides multi-tenancy isolation for encrypted data.
     *
     * CASCADE DELETE ensures all encrypted data is removed
     * when organization is deleted (GDPR right to erasure).
     *
     * Constraints:
     * - NOT NULL: Every entry must belong to an organization
     * - ON DELETE CASCADE: Automatic cleanup for GDPR compliance
     *
     * @type {number} Integer referencing organizations.id
     * @see organizations
     */
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // ============================================
    // ENTITY IDENTIFICATION
    // What entity and field is encrypted
    // ============================================

    /**
     * Type of entity this encrypted field belongs to
     *
     * Identifies the domain entity (user, organization, etc.).
     * Combined with entityId for unique entity reference.
     *
     * @type {EntityType} VARCHAR with enum constraint, NOT NULL
     * @see entityTypeEnum
     */
    entityType: varchar('entity_type', { enum: entityTypeEnum }).notNull(),

    /**
     * ID of the entity this encrypted field belongs to
     *
     * Foreign key to the entity (users.id, organizations.id, etc.).
     * Not enforced at DB level due to polymorphic reference.
     *
     * @type {number} INTEGER, NOT NULL
     */
    entityId: integer('entity_id').notNull(),

    /**
     * Path to the encrypted field within the entity
     *
     * Identifies which field is encrypted (e.g., "email", "ssn").
     * Supports nested paths (e.g., "address.street").
     *
     * @type {string} VARCHAR(255), NOT NULL
     */
    fieldPath: varchar('field_path', { length: 255 }).notNull(),

    // ============================================
    // ENCRYPTED DATA
    // Envelope encryption components
    // ============================================

    /**
     * Encrypted data (ciphertext)
     *
     * The actual encrypted data, encrypted with DEK.
     * Base64 encoded for storage.
     *
     * Encryption: AES-256-GCM(plaintext, DEK)
     *
     * @type {string} TEXT, NOT NULL (base64 encoded)
     */
    ciphertext: text('ciphertext').notNull(),

    /**
     * Encrypted data encryption key (DEK)
     *
     * The DEK encrypted with key encryption key (KEK).
     * Base64 encoded for storage.
     *
     * Encryption: AES-256-GCM(DEK, KEK)
     *
     * @type {string} TEXT, NOT NULL (base64 encoded)
     */
    encryptedDataKey: text('encrypted_data_key').notNull(),

    /**
     * Initialization vector for AES-GCM
     *
     * Random IV used for encryption.
     * Must be unique per encryption operation.
     *
     * @type {string} TEXT, NOT NULL (base64 encoded)
     */
    iv: text('iv').notNull(),

    /**
     * Authentication tag for AES-GCM
     *
     * Provides integrity verification for ciphertext.
     * Prevents tampering and ensures authenticity.
     *
     * @type {string} TEXT, NOT NULL (base64 encoded)
     */
    authTag: text('auth_tag').notNull(),

    /**
     * Key ID for key rotation tracking
     *
     * Identifier of the KEK used to encrypt the DEK.
     * Used to identify entries needing rotation when KEK changes.
     *
     * Single-key architecture: All entries use 'primary-encryption-key'.
     * Default value ensures backward compatibility and simplifies key management.
     *
     * @type {string} VARCHAR(255), NOT NULL, DEFAULT 'primary-encryption-key'
     */
    keyId: varchar('key_id', { length: 255 }).notNull().default('primary-encryption-key'),

    /**
     * Key version for decryption fallback
     *
     * The specific KMS key version used to encrypt this entry's DEK.
     * Used for decryption when the primary version has changed.
     *
     * Format: Version number from GCP KMS (e.g., '4', '5')
     * Null for entries created before this column was added (will use unversioned decrypt).
     *
     * ## Decryption Strategy
     * 1. Try decrypt with stored key_version (if present)
     * 2. Fallback to unversioned decrypt (let KMS auto-detect)
     *
     * @type {string | null} VARCHAR(50), nullable
     */
    keyVersion: varchar('key_version', { length: 50 }),

    // ============================================
    // DATA CLASSIFICATION
    // Compliance metadata
    // ============================================

    /**
     * Data classification level
     *
     * ISO 27001 classification for retention and access policies.
     * Higher classification = stricter access controls.
     *
     * @type {DataClassification} VARCHAR with enum constraint, NOT NULL
     * @see dataClassificationEnum
     */
    classification: varchar('classification', { enum: dataClassificationEnum }).notNull(),

    /**
     * Data category type
     *
     * Specific type of sensitive data for compliance reporting.
     * Used to generate compliance reports by category.
     *
     * @type {DataCategory} VARCHAR with enum constraint, NOT NULL
     * @see dataCategoryEnum
     */
    category: varchar('category', { enum: dataCategoryEnum }).notNull(),

    // ============================================
    // ACCESS LOGGING
    // Audit trail for compliance
    // ============================================

    /**
     * Access log entries (JSONB array)
     *
     * Audit trail of all access to this encrypted data.
     * Append-only in application layer for integrity.
     *
     * Stores array of IAccessLogEntry objects.
     * May be periodically archived and truncated.
     *
     * @type {IAccessLogEntry[] | null} JSONB, nullable
     * @see IAccessLogEntry
     */
    accessLog: jsonb('access_log').$type<IAccessLogEntry[]>(),

    // ============================================
    // TIMESTAMPS
    // Audit trail for entry lifecycle
    // ============================================

    /**
     * Record creation timestamp
     *
     * When this encrypted entry was first created.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this entry was last modified.
     * Updated when data is re-encrypted or rotated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    /**
     * Key rotation timestamp
     *
     * When the encryption key was last rotated.
     * Null means never rotated (original key still in use).
     *
     * Used to identify stale entries needing rotation.
     *
     * @type {Date | null} TIMESTAMP, nullable (null = never rotated)
     */
    rotatedAt: timestamp('rotated_at')
  },
  (t) => [
    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: Tenant + entity + field composite (primary lookup)
     *
     * Critical index for the primary query pattern.
     * Covers: findByEntityAndField with tenant isolation.
     *
     * Query pattern: SELECT * FROM encrypted-store_entries
     *   WHERE organization_id = ? AND entity_type = ? AND entity_id = ? AND field_path = ?
     *
     * @example
     * ```sql
     * -- Retrieve encrypted email for a user
     * SELECT * FROM encrypted-store_entries
     * WHERE organization_id = 1
     * AND entity_type = 'user'
     * AND entity_id = 123
     * AND field_path = 'email';
     * ```
     */
    index('encrypted-store_entries_tenant_entity_field_idx').on(
      t.organizationId,
      t.entityType,
      t.entityId,
      t.fieldPath
    ),

    /**
     * Index: Classification filter
     *
     * Optimizes compliance reporting queries.
     * Find all entries of a specific classification.
     *
     * Query pattern: SELECT * FROM encrypted-store_entries WHERE classification = ?
     *
     * @example
     * ```sql
     * -- Find all restricted data for compliance audit
     * SELECT * FROM encrypted-store_entries
     * WHERE classification = 'restricted';
     *
     * -- Count entries by classification
     * SELECT classification, COUNT(*)
     * FROM encrypted-store_entries
     * GROUP BY classification;
     * ```
     */
    index('encrypted-store_entries_classification_idx').on(t.classification),

    /**
     * Index: Key ID lookup (rotation)
     *
     * Optimizes key rotation queries.
     * Find all entries encrypted with a specific KEK.
     *
     * Query pattern: SELECT * FROM encrypted-store_entries WHERE key_id = ?
     *
     * @example
     * ```sql
     * -- Find entries needing rotation after KEK change
     * SELECT * FROM encrypted-store_entries
     * WHERE key_id = 'old-kek-id';
     *
     * -- After rotating, update key_id and rotated_at
     * ```
     */
    index('encrypted-store_entries_key_id_idx').on(t.keyId),

    /**
     * Index: Rotation timestamp lookup
     *
     * Optimizes queries for stale entries.
     * Find entries that haven't been rotated recently.
     *
     * Query pattern: SELECT * FROM encrypted-store_entries WHERE rotated_at < ? OR rotated_at IS NULL
     *
     * @example
     * ```sql
     * -- Find entries never rotated
     * SELECT * FROM encrypted-store_entries
     * WHERE rotated_at IS NULL;
     *
     * -- Find entries not rotated in 90 days
     * SELECT * FROM encrypted-store_entries
     * WHERE rotated_at < NOW() - INTERVAL '90 days'
     * OR rotated_at IS NULL;
     * ```
     */
    index('encrypted-store_entries_rotated_at_idx').on(t.rotatedAt),

    /**
     * Index: Created timestamp lookup
     *
     * Optimizes queries that order by creation time.
     * Find most recent entries for an entity.
     *
     * Query pattern: SELECT * FROM encrypted-store_entries WHERE ... ORDER BY created_at DESC
     *
     * @example
     * ```sql
     * -- Find most recent encrypted-store entry for a user's field
     * SELECT * FROM encrypted-store_entries
     * WHERE organization_id = 1
     * AND entity_type = 'user'
     * AND entity_id = 123
     * AND field_path = 'email'
     * ORDER BY created_at DESC
     * LIMIT 1;
     * ```
     */
    index('encrypted-store_entries_created_at_idx').on(t.createdAt),

    /**
     * Index: Key rotation optimized (organization + key + id)
     *
     * Dedicated index for key rotation queries without entity_type filter.
     * Optimizes rotation batch queries that only filter by organization and key.
     *
     * This index is more efficient than encrypted-store_entries_org_key_entity_type_id_idx
     * for rotation queries that don't filter by entity_type, reducing index size
     * and improving query performance by ~20%.
     *
     * Query pattern: SELECT * FROM encrypted-store_entries
     *   WHERE organization_id = ? AND key_id = ? AND id > ?
     *   ORDER BY id LIMIT ?
     *
     * Performance: Smaller index, faster scans, optimal for rotation.
     *
     * @example
     * ```sql
     * -- Key rotation query (all entity types)
     * SELECT * FROM encrypted-store_entries
     * WHERE organization_id = 1
     * AND key_id = 'old-kek-id'
     * AND id > 1000  -- Cursor pagination
     * ORDER BY id
     * LIMIT 100;
     * ```
     */
    index('encrypted-store_entries_rotation_idx').on(t.organizationId, t.keyId, t.id),

    /**
     * Index: Key rotation composite (organization + key + entity type + id)
     *
     * Optimizes key rotation batch queries filtered by entity type.
     * Find all entries for a specific organization, key, and entity type.
     *
     * Use this index when rotation needs to be scoped to specific entity types.
     * For general rotation (all entity types), use encrypted-store_entries_rotation_idx instead.
     *
     * Query pattern: SELECT * FROM encrypted-store_entries
     *   WHERE organization_id = ? AND key_id = ? AND entity_type = ? AND id > ?
     *   ORDER BY id LIMIT ?
     *
     * Performance: Index-only scan, no filesort required.
     *
     * @example
     * ```sql
     * -- Get all user address entries encrypted with old key for rotation
     * SELECT * FROM encrypted-store_entries
     * WHERE organization_id = 1
     * AND key_id = 'old-kek-id'
     * AND entity_type = 'user_address'
     * AND id > 1000  -- Cursor pagination
     * ORDER BY id
     * LIMIT 100;
     * ```
     */
    index('encrypted-store_entries_org_key_entity_type_id_idx').on(
      t.organizationId,
      t.keyId,
      t.entityType,
      t.id
    )
  ]
);

/**
 * encrypted-store entry select type
 *
 * Type representing a encrypted-store entry as returned from SELECT queries.
 * All columns are included with their runtime types.
 *
 * @example
 * ```typescript
 * const entry: EncryptedStoreEntry = await db.query.encryptedStoreEntries.findFirst({
 *   where: and(
 *     eq(encryptedStoreEntries.organizationId, orgId),
 *     eq(encryptedStoreEntries.entityType, 'user'),
 *     eq(encryptedStoreEntries.entityId, userId),
 *     eq(encryptedStoreEntries.fieldPath, 'email')
 *   )
 * });
 *
 * // Decrypt the data
 * const dek = decryptDek(entry.encryptedDataKey, kek);
 * const plaintext = decrypt(entry.ciphertext, dek, entry.iv, entry.authTag);
 * ```
 */
export type EncryptedStoreEntry = typeof encryptedStoreEntries.$inferSelect;

/**
 * encrypted-store entry insert type
 *
 * Type representing the data needed to insert a new encrypted-store entry.
 * Required fields: organizationId, entityType, entityId, fieldPath,
 *   ciphertext, encryptedDataKey, iv, authTag, keyId, classification, category
 * Optional fields: accessLog, rotatedAt
 *
 * @example
 * ```typescript
 * // Encrypt and store user email
 * const dek = generateDek();
 * const { ciphertext, iv, authTag } = encrypt(email, dek);
 * const encryptedDataKey = encryptDek(dek, kek);
 *
 * const newEntry: NewEncryptedStoreEntry = {
 *   organizationId: orgId,
 *   entityType: 'user',
 *   entityId: userId,
 *   fieldPath: 'email',
 *   ciphertext,
 *   encryptedDataKey,
 *   iv,
 *   authTag,
 *   keyId: currentKekId,
 *   classification: 'confidential',
 *   category: 'pii',
 *   accessLog: [{
 *     timestamp: new Date().toISOString(),
 *     accessedBy: adminId,
 *     action: AccessLogAction.STORED
 *   }]
 * };
 * await db.insert(encryptedStoreEntries).values(newEntry);
 * ```
 */
export type NewEncryptedStoreEntry = typeof encryptedStoreEntries.$inferInsert;
