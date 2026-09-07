/**
 * Key Rotation State table schema
 *
 * Stores the state of key rotation operations for resumable batch processing.
 * This table enables the AddressKeyRotationService to recover from container
 * restarts and continue rotation from where it left off.
 *
 * Architecture:
 * - One row per organization/key pair rotation operation
 * - Tracks progress, errors, and completion status
 * - Supports continue-on-error mode with error collection
 * - Enables verification of rotation completion
 *
 * Use Cases:
 * - Resumable rotation after container restart
 * - Progress tracking for long-running rotations
 * - Error collection and analysis
 * - Verification that all entries were rotated
 *
 * @module db-core/schemas/key-rotation-state
 */

import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';

/**
 * Rotation status enum
 *
 * Defines the current state of a key rotation operation.
 */
export const ROTATION_STATUS = {
  /** Rotation is in progress */
  IN_PROGRESS: 'in_progress',
  /** Rotation completed successfully */
  COMPLETED: 'completed',
  /** Rotation failed with errors */
  FAILED: 'failed',
  /** Rotation was cancelled */
  CANCELLED: 'cancelled'
} as const;

/**
 * Rotation status type
 */
export type RotationStatus = (typeof ROTATION_STATUS)[keyof typeof ROTATION_STATUS];

/**
 * Key rotation state table
 *
 * Stores the state of key rotation operations for encrypted-store entries.
 * Enables resumable batch processing after container restarts.
 *
 * @example
 * ```typescript
 * // Start a rotation operation
 * await db.insert(keyRotationState).values({
 *   organizationId: orgId,
 *   oldKeyId: 'tenant-123',
 *   newKeyId: 'tenant-123-rotated-1701234567890',
 *   status: 'in_progress',
 *   totalEntries: 1500,
 *   processedEntries: 0
 * });
 *
 * // Update progress
 * await db.update(keyRotationState)
 *   .set({ processedEntries: 500 })
 *   .where(eq(keyRotationState.id, stateId));
 *
 * // Mark complete
 * await db.update(keyRotationState)
 *   .set({ status: 'completed', completedAt: new Date() })
 *   .where(eq(keyRotationState.id, stateId));
 * ```
 */
export const keyRotationState = pgTable(
  'key_rotation_state',
  {
    // ============================================
    // IDENTIFICATION
    // Primary key and entity reference
    // ============================================

    /**
     * Auto-incrementing primary key
     *
     * Internal identifier for the rotation state record.
     *
     * @type {number} Serial integer, auto-generated
     */
    id: serial('id').primaryKey(),

    // ============================================
    // FOREIGN KEY RELATIONSHIPS
    // Multi-tenancy and organization association
    // ============================================

    /**
     * Foreign key reference to the organizations table
     *
     * Links this rotation state to its parent organization.
     * Provides multi-tenancy isolation for rotation operations.
     *
     * Constraints:
     * - NOT NULL: Every rotation must belong to an organization
     * - ON DELETE CASCADE: Automatic cleanup when organization is deleted
     *
     * @type {number} Integer referencing organizations.id
     * @see organizations
     */
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // ============================================
    // KEY INFORMATION
    // Old and new key IDs for rotation
    // ============================================

    /**
     * Old key ID being rotated from
     *
     * The KMS key ID that is being rotated away from.
     * Used to query encrypted-store_entries for rotation.
     *
     * @type {string} VARCHAR(255), NOT NULL
     */
    oldKeyId: varchar('old_key_id', { length: 255 }).notNull(),

    /**
     * New key ID being rotated to
     *
     * The KMS key ID that is being rotated to.
     * Used to re-encrypt encrypted-store entries.
     *
     * @type {string} VARCHAR(255), NOT NULL
     */
    newKeyId: varchar('new_key_id', { length: 255 }).notNull(),

    // ============================================
    // ROTATION STATUS
    // Current state and progress
    // ============================================

    /**
     * Current rotation status
     *
     * One of: in_progress, completed, failed, cancelled
     *
     * @type {RotationStatus} VARCHAR with enum constraint, NOT NULL
     * @see ROTATION_STATUS
     */
    status: varchar('status', {
      enum: ['in_progress', 'completed', 'failed', 'cancelled']
    }).notNull(),

    /**
     * Total number of encrypted-store entries to rotate
     *
     * The count of entries found with oldKeyId.
     *
     * @type {number} INTEGER, NOT NULL
     */
    totalEntries: integer('total_entries').notNull(),

    /**
     * Number of entries successfully processed
     *
     * Incremented as entries are rotated.
     * When this equals totalEntries, rotation is complete.
     *
     * @type {number} INTEGER, NOT NULL, default: 0
     */
    processedEntries: integer('processed_entries').notNull().default(0),

    /**
     * Number of entries that failed to rotate
     *
     * Incremented when rotation fails for an entry.
     * Used for error tracking and reporting.
     *
     * @type {number} INTEGER, NOT NULL, default: 0
     */
    failedEntries: integer('failed_entries').notNull().default(0),

    // ============================================
    // ERROR COLLECTION
    // Details about rotation failures
    // ============================================

    /**
     * Collection of rotation errors (JSONB array)
     *
     * Stores error details for failed entries in continue-on-error mode.
     * Each error includes entry ID, error message, and timestamp.
     *
     * May be periodically archived and truncated.
     *
     * @type {IRotationError[] | null} JSONB, nullable
     * @see IRotationError
     */
    errors: jsonb('errors').$type<IRotationError[]>(),

    // ============================================
    // TIMESTAMPS
    // Audit trail for rotation lifecycle
    // ============================================

    /**
     * Record creation timestamp
     *
     * When this rotation state was first created.
     * Set automatically on insert, never updated.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    createdAt: timestamp('created_at').defaultNow().notNull(),

    /**
     * Last update timestamp
     *
     * When this rotation state was last modified.
     * Updated on progress updates and status changes.
     *
     * @type {Date} TIMESTAMP, NOT NULL, default: now()
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    /**
     * Rotation completion timestamp
     *
     * When the rotation completed (successfully or with errors).
     * Null means rotation is still in progress.
     *
     * @type {Date | null} TIMESTAMP, nullable (null = in progress)
     */
    completedAt: timestamp('completed_at'),

    /**
     * Last processed entry cursor
     *
     * Opaque cursor for resuming rotation from last processed entry.
     * Enables efficient resumption without re-processing completed entries.
     *
     * @type {string | null} TEXT, nullable
     */
    lastCursor: text('last_cursor'),

    /**
     * Additional metadata (JSONB)
     *
     * Stores rotation configuration and context:
     * - batch_size: Number of entries per batch
     * - continue_on_error: Whether to continue on errors
     * - verification_enabled: Whether to verify rotation
     * - trigger_type: How rotation was triggered (for example manual or scheduled)
     *
     * @type {Record<string, unknown> | null} JSONB, nullable
     */
    metadata: jsonb('metadata')
  },
  (t) => [
    // ============================================
    // INDEXES
    // Query optimization for common access patterns
    // ============================================

    /**
     * Index: Organization
     *
     * Optimizes queries for rotation operations by organization.
     *
     * Query pattern: SELECT * FROM key_rotation_state WHERE organization_id = ?
     */
    index('key_rotation_state_organization_id_idx').on(t.organizationId),

    /**
     * Index: Organization + old key + status
     *
     * Optimizes queries for active rotation operations by organization.
     *
     * Query pattern: SELECT * FROM key_rotation_state
     *   WHERE organization_id = ? AND old_key_id = ? AND status = 'in_progress'
     */
    index('key_rotation_state_org_old_key_status_idx').on(t.organizationId, t.oldKeyId, t.status),

    /**
     * Unique index: one state row per rotation tuple
     *
     * Prevents duplicate state rows when concurrent workers attempt to create
     * state for the same organization + old/new key pair.
     */
    uniqueIndex('key_rotation_state_org_old_new_key_unique_idx').on(
      t.organizationId,
      t.oldKeyId,
      t.newKeyId
    ),

    /**
     * Index: Status lookup
     *
     * Optimizes queries for rotations by status.
     *
     * Query pattern: SELECT * FROM key_rotation_state WHERE status = 'in_progress'
     */
    index('key_rotation_state_status_idx').on(t.status),

    /**
     * Index: Created timestamp lookup
     *
     * Optimizes queries for recent rotation operations.
     *
     * Query pattern: SELECT * FROM key_rotation_state ORDER BY created_at DESC
     */
    index('key_rotation_state_created_at_idx').on(t.createdAt)
  ]
);

/**
 * Rotation error structure
 *
 * Details about a failed rotation operation for a single encrypted-store entry.
 *
 * @example
 * ```typescript
 * const error: IRotationError = {
 *   entryId: 12345,
 *   entityType: 'user_address',
 *   entityId: 'addr-123',
 *   fieldPath: 'street',
 *   errorMessage: 'Failed to decrypt with old key',
 *   timestamp: '2026-03-07T12:00:00.000Z'
 * };
 * ```
 */
export interface IRotationError {
  /**
   * encrypted-store entry ID that failed to rotate
   *
   * References encrypted-store_entries.id
   */
  entryId: number;

  /**
   * Entity type of the failed entry
   *
   * Examples: 'user_address', 'payment_method'
   */
  entityType: string;

  /**
   * Entity ID that contains the failed field
   *
   * ID of the entity (e.g., user_addresses.id)
   */
  entityId: string;

  /**
   * Field path that failed to rotate
   *
   * Which field within the entity failed
   */
  fieldPath: string;

  /**
   * Error message describing the failure
   *
   * Human-readable error description
   */
  errorMessage: string;

  /**
   * ISO 8601 timestamp of when the error occurred
   *
   * @example "2026-03-07T12:00:00.000Z"
   */
  timestamp: string;
}

/**
 * Key rotation state select type
 *
 * Type representing a rotation state as returned from SELECT queries.
 */
export type KeyRotationState = typeof keyRotationState.$inferSelect;

/**
 * Key rotation state insert type
 *
 * Type representing the data needed to insert a new rotation state.
 */
export type NewKeyRotationState = typeof keyRotationState.$inferInsert;
