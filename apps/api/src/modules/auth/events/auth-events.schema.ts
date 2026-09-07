/**
 * Auth Event Schemas
 *
 * Type-safe event data schemas for all auth-related events.
 * All schemas include schema version for backward compatibility.
 *
 * Event data schemas define the structure of the `data` field in EventMessage.
 *
 * @example
 * ```typescript
 * import { EventMessage } from '@package/events';
 * import type { UserRegisteredData } from './events/auth-events.schema';
 *
 * const event: EventMessage<UserRegisteredData> = {
 *   eventType: 'user.registered',
 *   schemaVersion: '1.0',
 *   data: {
 *     userId: 'user-123',
 *     organizationId: 'org-456',
 *     email: 'user@example.com',
 *     tenantId: 'org-456',
 *     timestamp: '2024-01-01T00:00:00.000Z',
 *   }
 * };
 * ```
 */

import type { AuthEventType } from './auth-event-types.constants';

/**
 * Base event data interface
 *
 * Common fields shared across all auth events.
 */
export interface BaseAuthEventData {
  /**
   * Tenant/organization ID
   *
   * Required for multi-tenant isolation.
   */
  readonly tenantId: string;

  /**
   * User ID
   *
   * Unique identifier for the user.
   */
  readonly userId: string;

  /**
   * Event timestamp
   *
   * When the event occurred (ISO 8601 format).
   */
  readonly timestamp: string;
}

/**
 * User registered event data
 *
 * Fired when a new user completes registration in the database.
 * Contains all information needed for asynchronous GCP provisioning.
 *
 * @example
 * ```typescript
 * const data: UserRegisteredData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   email: 'user@example.com',
 *   displayName: 'John Doe',
 *   organizationId: 'org-123',
 *   organizationName: "John's Organization",
 *   isNewOrganization: true,
 *   provider: 'email_password',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserRegisteredData extends BaseAuthEventData {
  /**
   * Email address
   *
   * User's email (NOT hashed, needed for GCP provisioning).
   */
  readonly email: string;

  /**
   * Display name
   *
   * User's full name or chosen display name.
   */
  readonly displayName?: string;

  /**
   * Organization ID
   *
   * The organization this user belongs to.
   */
  readonly organizationId: string;

  /**
   * Organization name
   *
   * Name of the organization (needed for GCP tenant creation).
   */
  readonly organizationName?: string;

  /**
   * Is new organization
   *
   * True if this registration created a new organization.
   * If true, GCP tenant provisioning is required.
   */
  readonly isNewOrganization: boolean;

  /**
   * Authentication provider
   *
   * The provider used for registration (email_password, google, etc.).
   */
  readonly provider: string;

  /**
   * Password (optional, for GCP user creation)
   *
   * Only included if provider is email_password.
   * Consumed by GCP provisioning consumer and not persisted in outbox.
   */
  readonly password?: string;

  /**
   * Is verified
   *
   * Whether the email is verified.
   */
  readonly isVerified?: boolean;

  /**
   * Is active
   *
   * Whether the user account is active.
   */
  readonly isActive?: boolean;
}

/**
 * User logged in event data
 *
 * Fired when a user successfully authenticates.
 *
 * @example
 * ```typescript
 * const data: UserLoggedInData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   provider: 'email_password',
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserLoggedInData extends BaseAuthEventData {
  /**
   * Authentication provider
   *
   * The provider used for login (email_password, google, etc.).
   */
  readonly provider: string;

  /**
   * IP address
   *
   * Client IP address for security monitoring.
   */
  readonly ipAddress?: string;

  /**
   * User agent
   *
   * Client user agent for security monitoring.
   */
  readonly userAgent?: string;

  /**
   * Session ID
   *
   * Optional session identifier.
   */
  readonly sessionId?: string;
}

/**
 * User logged out event data
 *
 * Fired when a user logs out.
 *
 * @example
 * ```typescript
 * const data: UserLoggedOutData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   sessionId: 'session-789',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserLoggedOutData extends BaseAuthEventData {
  /**
   * Session ID
   *
   * Optional session identifier that was terminated.
   */
  readonly sessionId?: string;
}

/**
 * Token refreshed event data
 *
 * Fired when an access token is refreshed.
 *
 * @example
 * ```typescript
 * const data: TokenRefreshedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface TokenRefreshedData extends BaseAuthEventData {
  /**
   * IP address
   *
   * Client IP address for security monitoring.
   */
  readonly ipAddress?: string;

  /**
   * Session ID
   *
   * Optional session identifier.
   */
  readonly sessionId?: string;
}

/**
 * Identity linked event data
 *
 * Fired when a new identity provider is linked to a user.
 *
 * @example
 * ```typescript
 * const data: IdentityLinkedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   provider: 'google',
 *   providerUid: 'google-uid-789',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface IdentityLinkedData extends BaseAuthEventData {
  /**
   * Authentication provider
   *
   * The provider that was linked (google, github, etc.).
   */
  readonly provider: string;

  /**
   * Provider UID
   *
   * The unique identifier for this user on the provider.
   */
  readonly providerUid: string;
}

/**
 * Identity unlinked event data
 *
 * Fired when an identity provider is unlinked from a user.
 *
 * @example
 * ```typescript
 * const data: IdentityUnlinkedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   provider: 'google',
 *   providerUid: 'google-uid-789',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface IdentityUnlinkedData extends BaseAuthEventData {
  /**
   * Authentication provider
   *
   * The provider that was unlinked.
   */
  readonly provider: string;

  /**
   * Provider UID
   *
   * The unique identifier for this user on the provider.
   */
  readonly providerUid: string;
}

/**
 * User data exported event data
 *
 * Fired when a user exports their data for GDPR compliance (Article 15).
 * Used for audit logging and compliance tracking.
 *
 * @example
 * ```typescript
 * const data: UserDataExportedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   exportedAt: '2024-01-01T00:00:00.000Z',
 *   exportedBy: 'user-456',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserDataExportedData extends BaseAuthEventData {
  /**
   * Export timestamp
   *
   * When the data export was created (ISO 8601 format).
   */
  readonly exportedAt: string;

  /**
   * Exported by
   *
   * User ID of who requested the export.
   * Usually same as userId (self-export).
   */
  readonly exportedBy: string;
}

/**
 * User profile updated event data
 *
 * Fired when a user updates profile fields in self-service profile management.
 * Contains only metadata and changed field names, never raw PII values.
 */
export interface UserProfileUpdatedData extends BaseAuthEventData {
  /**
   * Actor that performed the update.
   * For self-profile updates this is the same as userId.
   */
  readonly actorId: string;

  /**
   * Profile fields updated in this operation.
   */
  readonly changedFields: readonly string[];
}

/**
 * Event data schema mapping
 *
 * Maps event types to their corresponding data schemas.
 * Provides type safety when working with events.
 */
export type AuthEventDataSchemas = {
  [AuthEventType.USER_REGISTERED]: UserRegisteredData;
  [AuthEventType.USER_LOGGED_IN]: UserLoggedInData;
  [AuthEventType.USER_LOGGED_OUT]: UserLoggedOutData;
  [AuthEventType.TOKEN_REFRESHED]: TokenRefreshedData;
  [AuthEventType.IDENTITY_LINKED]: IdentityLinkedData;
  [AuthEventType.IDENTITY_UNLINKED]: IdentityUnlinkedData;
  [AuthEventType.USER_DATA_EXPORTED]: UserDataExportedData;
  [AuthEventType.USER_PROFILE_UPDATED]: UserProfileUpdatedData;
};
