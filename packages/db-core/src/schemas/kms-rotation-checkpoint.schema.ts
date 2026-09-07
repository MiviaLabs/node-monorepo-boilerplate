/**
 * KMS rotation checkpoint table schema
 *
 * Stores global polling state for KMS primary-version detection.
 * This table is intentionally separate from per-tenant rotation progress
 * so the scheduler can persist one checkpoint row per logical KMS key.
 *
 * @module db-core/schemas/kms-rotation-checkpoint
 */

import { index, pgTable, serial, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

/**
 * KMS rotation checkpoint table
 *
 * Each row tracks the last observed and last processed version transition
 * for a single KMS key name, such as `primary-encryption-key`.
 */
export const kmsRotationCheckpoint = pgTable(
  'kms_rotation_checkpoint',
  {
    /**
     * Auto-incrementing primary key.
     */
    id: serial('id').primaryKey(),

    /**
     * Logical KMS key name.
     *
     * Example: `primary-encryption-key`
     */
    keyName: varchar('key_name', { length: 255 }).notNull(),

    /**
     * Last version observed by the poller.
     *
     * Stored as a normalized versioned key identifier.
     */
    lastSeenVersion: varchar('last_seen_version', { length: 255 }).notNull(),

    /**
     * Last processed transition source version.
     *
     * Null until the first successful rotation transition is emitted.
     */
    lastProcessedFromVersion: varchar('last_processed_from_version', { length: 255 }),

    /**
     * Last processed transition destination version.
     *
     * Null until the first successful rotation transition is emitted.
     */
    lastProcessedToVersion: varchar('last_processed_to_version', { length: 255 }),

    /**
     * Timestamp of the most recent polling check.
     */
    lastCheckedAt: timestamp('last_checked_at').defaultNow().notNull(),

    /**
     * Timestamp of the most recent successfully emitted rotation.
     */
    lastRotatedAt: timestamp('last_rotated_at'),

    /**
     * Last update timestamp.
     *
     * Managed by application updates; defaulted on insert only.
     */
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (t) => [
    /**
     * Enforce one checkpoint row per logical key name.
     */
    uniqueIndex('kms_rotation_checkpoint_key_name_unique_idx').on(t.keyName),

    /**
     * Supports operational queries ordered by most recent update time.
     */
    index('kms_rotation_checkpoint_updated_at_idx').on(t.updatedAt)
  ]
);

/**
 * KMS rotation checkpoint select type.
 */
export type KmsRotationCheckpoint = typeof kmsRotationCheckpoint.$inferSelect;

/**
 * KMS rotation checkpoint insert type.
 */
export type NewKmsRotationCheckpoint = typeof kmsRotationCheckpoint.$inferInsert;
