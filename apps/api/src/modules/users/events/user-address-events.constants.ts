/**
 * User Address Event Types
 *
 * Centralized event type constants for user address operations.
 * Uses const enum for type safety and prevents magic strings.
 *
 * Event Naming Convention: `{entity}.{action}`
 * - Lowercase entity name
 * - Past tense action (created, updated, deleted)
 *
 * @module UsersEvents
 */

/**
 * User address event type constants
 *
 * All user address-related domain events.
 * Event types map to Kafka topics via dot-to-dash conversion.
 *
 * Topic Mapping:
 * - user.address.created -> user-address-created
 * - user.address.updated -> user-address-updated
 * - user.address.deleted -> user-address-deleted
 */
export const UserAddressEventType = {
  /**
   * User address created event
   *
   * Fired when a new user address is created.
   * Contains address metadata (no PII).
   *
   * Topic: user-address-created
   * Schema Version: 1.0
   */
  USER_ADDRESS_CREATED: 'user.address.created',

  /**
   * User address updated event
   *
   * Fired when user address information is updated.
   * Contains only the changed fields (no PII values).
   *
   * Topic: user-address-updated
   * Schema Version: 1.0
   */
  USER_ADDRESS_UPDATED: 'user.address.updated',

  /**
   * User address deleted event
   *
   * Fired when a user address is deleted (soft delete).
   * Contains address ID and deletion metadata.
   *
   * Topic: user-address-deleted
   * Schema Version: 1.0
   */
  USER_ADDRESS_DELETED: 'user.address.deleted',

  /**
   * User address default changed event
   *
   * Fired when the default address for a user is changed.
   * Contains old and new default address IDs.
   *
   * Topic: user-address-default-changed
   * Schema Version: 1.0
   */
  USER_ADDRESS_DEFAULT_CHANGED: 'user.address.default.changed',

  /**
   * User address verified event
   *
   * Fired when an address is verified (e.g., via postal service).
   * Contains address ID and verification status.
   *
   * Topic: user-address-verified
   * Schema Version: 1.0
   */
  USER_ADDRESS_VERIFIED: 'user.address.verified'
} as const;

/**
 * User address event type union
 *
 * Type-safe union of all user address event types.
 */
export type UserAddressEventTypes =
  (typeof UserAddressEventType)[keyof typeof UserAddressEventType];

/**
 * Event schema version constants
 *
 * All events include a schemaVersion field for backward compatibility.
 * Format: MAJOR.MINOR (e.g., '1.0')
 *
 * Versioning Rules:
 * - MAJOR: Breaking changes to event structure
 * - MINOR: Non-breaking additions (backward compatible)
 */
export const UserAddressEventSchemaVersion = {
  /**
   * Version 1.0 - Initial event schema
   *
   * All address events use this version unless specified otherwise.
   */
  V1_0: '1.0'
} as const;

/**
 * Schema version type
 */
export type UserAddressEventSchemaVersion =
  (typeof UserAddressEventSchemaVersion)[keyof typeof UserAddressEventSchemaVersion];

/**
 * Event topic mapping
 *
 * Maps event types to Kafka topics.
 * Pattern: Replace dots with dashes.
 */
export const UserAddressEventTopics: Record<UserAddressEventTypes, string> = {
  [UserAddressEventType.USER_ADDRESS_CREATED]: 'user-address-created',
  [UserAddressEventType.USER_ADDRESS_UPDATED]: 'user-address-updated',
  [UserAddressEventType.USER_ADDRESS_DELETED]: 'user-address-deleted',
  [UserAddressEventType.USER_ADDRESS_DEFAULT_CHANGED]: 'user-address-default-changed',
  [UserAddressEventType.USER_ADDRESS_VERIFIED]: 'user-address-verified'
} as const;
