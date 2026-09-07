/**
 * User Event Types
 *
 * Centralized event type constants for the users module.
 * Uses const enum for type safety and prevents magic strings.
 *
 * Event Naming Convention: `{entity}.{action}`
 * - Lowercase entity name
 * - Past tense action (created, updated, deleted)
 *
 * @example
 * ```typescript
 * import { UserEventType } from './events/user-event-types.constants';
 *
 * // Publish event
 * await this.eventBus.publish(UserEventType.USER_CREATED, userData);
 * ```
 */

/**
 * User event type constants
 *
 * All user-related domain events.
 * Event types map to Kafka topics via dot-to-dash conversion.
 *
 * Topic Mapping:
 * - user.created -> user-created
 * - user.updated -> user-updated
 * - user.deleted -> user-deleted
 */
export const UserEventType = {
  /**
   * User created event
   *
   * Fired when a new user is created in the system.
   * Contains user profile information.
   *
   * Topic: user-created
   * Schema Version: 1.0
   */
  USER_CREATED: 'user.created',

  /**
   * User updated event
   *
   * Fired when user information is updated.
   * Contains only the changed fields.
   *
   * Topic: user-updated
   * Schema Version: 1.0
   */
  USER_UPDATED: 'user.updated',

  /**
   * User deleted event
   *
   * Fired when a user is deleted (soft or hard delete).
   * Contains user ID and deletion type.
   *
   * Topic: user-deleted
   * Schema Version: 1.0
   */
  USER_DELETED: 'user.deleted',

  /**
   * User email updated event
   *
   * Fired when user email is changed.
   * Contains old and new email (hashed).
   *
   * Topic: user-email-updated
   * Schema Version: 1.0
   */
  USER_EMAIL_UPDATED: 'user.email.updated',

  /**
   * User password changed event
   *
   * Fired when user password is changed.
   * Contains user ID and timestamp (never the password itself).
   *
   * Topic: user-password-changed
   * Schema Version: 1.0
   */
  USER_PASSWORD_CHANGED: 'user.password.changed',

  /**
   * User profile viewed event
   *
   * Fired when user profile is accessed.
   * For PII access tracking and audit logging.
   *
   * Topic: user-profile-viewed
   * Schema Version: 1.0
   */
  USER_PROFILE_VIEWED: 'user.profile.viewed',

  /**
   * User status changed event
   *
   * Fired when user status changes (active, suspended, deleted).
   * Contains old and new status.
   *
   * Topic: user-status-changed
   * Schema Version: 1.0
   */
  USER_STATUS_CHANGED: 'user.status.changed'
} as const;

/**
 * User event type union
 *
 * Type-safe union of all user event types.
 *
 * @example
 * ```typescript
 * function handleEvent(eventType: UserEventTypes) {
 *   switch (eventType) {
 *     case UserEventType.USER_CREATED:
 *       // Handle user created
 *       break;
 *     case UserEventType.USER_UPDATED:
 *       // Handle user updated
 *       break;
 *   }
 * }
 * ```
 */
export type UserEventTypes = (typeof UserEventType)[keyof typeof UserEventType];

/**
 * Event schema version constants
 *
 * All events include a schemaVersion field for backward compatibility.
 * Format: MAJOR.MINOR (e.g., '1.0')
 *
 * Versioning Rules:
 * - MAJOR: Breaking changes to event structure
 * - MINOR: Non-breaking additions (backward compatible)
 *
 * @example
 * ```typescript
 * const event = {
 *   eventType: UserEventType.USER_CREATED,
 *   schemaVersion: UserEventSchemaVersion.V1_0,
 *   data: { userId: '123' }
 * };
 * ```
 */
export const UserEventSchemaVersion = {
  /**
   * Version 1.0 - Initial event schema
   *
   * All events use this version unless specified otherwise.
   */
  V1_0: '1.0'
} as const;

/**
 * Schema version type
 */
export type UserEventSchemaVersion =
  (typeof UserEventSchemaVersion)[keyof typeof UserEventSchemaVersion];

/**
 * Event topic mapping
 *
 * Maps event types to Kafka topics.
 * Pattern: Replace dots with dashes.
 *
 * @example
 * ```typescript
 * const topic = UserEventTopics[UserEventType.USER_CREATED]; // 'user-created'
 * ```
 */
export const UserEventTopics: Record<UserEventTypes, string> = {
  [UserEventType.USER_CREATED]: 'user-created',
  [UserEventType.USER_UPDATED]: 'user-updated',
  [UserEventType.USER_DELETED]: 'user-deleted',
  [UserEventType.USER_EMAIL_UPDATED]: 'user-email-updated',
  [UserEventType.USER_PASSWORD_CHANGED]: 'user-password-changed',
  [UserEventType.USER_PROFILE_VIEWED]: 'user-profile-viewed',
  [UserEventType.USER_STATUS_CHANGED]: 'user-status-changed'
} as const;
