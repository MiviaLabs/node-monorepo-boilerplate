/**
 * Auth Event Types
 *
 * Centralized event type constants for the auth module.
 * Uses const enum for type safety and prevents magic strings.
 *
 * Event Naming Convention: `{entity}.{action}`
 * - Lowercase entity name
 * - Past tense action (registered, loggedin, loggedout)
 *
 * @example
 * ```typescript
 * import { AuthEventType } from './events/auth-event-types.constants';
 *
 * // Publish event
 * await this.eventBus.publish(AuthEventType.USER_REGISTERED, userData);
 * ```
 */

/**
 * Auth event type constants
 *
 * All authentication-related domain events.
 * Event types map to Kafka topics via dot-to-dash conversion.
 *
 * Topic Mapping:
 * - user.registered -> user-registered
 * - user.loggedin -> user-loggedin
 * - user.loggedout -> user-loggedout
 */
export const AuthEventType = {
  /**
   * User registered event
   *
   * Fired when a new user completes registration.
   * Triggers GCP provisioning via async consumer.
   *
   * Topic: user-registered
   * Schema Version: 1.0
   */
  USER_REGISTERED: 'user.registered',

  /**
   * User logged in event
   *
   * Fired when a user successfully authenticates.
   * Used for audit logging and analytics.
   *
   * Topic: user-loggedin
   * Schema Version: 1.0
   */
  USER_LOGGED_IN: 'user.loggedin',

  /**
   * User logged out event
   *
   * Fired when a user logs out.
   * Used for session tracking and analytics.
   *
   * Topic: user-loggedout
   * Schema Version: 1.0
   */
  USER_LOGGED_OUT: 'user.loggedout',

  /**
   * Token refreshed event
   *
   * Fired when an access token is refreshed.
   * Used for security monitoring.
   *
   * Topic: token-refreshed
   * Schema Version: 1.0
   */
  TOKEN_REFRESHED: 'token.refreshed',

  /**
   * Identity linked event
   *
   * Fired when a new identity provider is linked to a user.
   *
   * Topic: identity-linked
   * Schema Version: 1.0
   */
  IDENTITY_LINKED: 'identity.linked',

  /**
   * Identity unlinked event
   *
   * Fired when an identity provider is unlinked from a user.
   *
   * Topic: identity-unlinked
   * Schema Version: 1.0
   */
  IDENTITY_UNLINKED: 'identity.unlinked',

  /**
   * User data exported event
   *
   * Fired when a user exports their data for GDPR compliance.
   * Used for audit logging and compliance tracking.
   *
   * Topic: user-data-exported
   * Schema Version: 1.0
   */
  USER_DATA_EXPORTED: 'user.dataexported',

  /**
   * User profile updated event
   *
   * Fired when a user updates self profile fields.
   * Used for audit logging and compliance tracking.
   *
   * Topic: user-profile-updated
   * Schema Version: 1.0
   */
  USER_PROFILE_UPDATED: 'user.profileupdated'
} as const;

/**
 * Auth event type union
 *
 * Type-safe union of all auth event types.
 */
export type AuthEventTypes = (typeof AuthEventType)[keyof typeof AuthEventType];

/**
 * Event schema version constants
 *
 * All events include a schemaVersion field for backward compatibility.
 * Format: MAJOR.MINOR (e.g., '1.0')
 */
export const AuthEventSchemaVersion = {
  /**
   * Version 1.0 - Initial event schema
   */
  V1_0: '1.0'
} as const;

/**
 * Schema version type
 */
export type AuthEventSchemaVersion =
  (typeof AuthEventSchemaVersion)[keyof typeof AuthEventSchemaVersion];

/**
 * Event topic mapping
 *
 * Maps event types to Kafka topics.
 * Pattern: Replace dots with dashes.
 */
export const AuthEventTopics: Record<AuthEventTypes, string> = {
  [AuthEventType.USER_REGISTERED]: 'user-registered',
  [AuthEventType.USER_LOGGED_IN]: 'user-loggedin',
  [AuthEventType.USER_LOGGED_OUT]: 'user-loggedout',
  [AuthEventType.TOKEN_REFRESHED]: 'token-refreshed',
  [AuthEventType.IDENTITY_LINKED]: 'identity-linked',
  [AuthEventType.IDENTITY_UNLINKED]: 'identity-unlinked',
  [AuthEventType.USER_DATA_EXPORTED]: 'user-data-exported',
  [AuthEventType.USER_PROFILE_UPDATED]: 'user-profile-updated'
} as const;
