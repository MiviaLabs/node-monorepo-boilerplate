/**
 * User Event Schemas
 *
 * Type-safe event data schemas for all user-related events.
 * All schemas include schema version for backward compatibility.
 *
 * Event data schemas define the structure of the `data` field in EventMessage.
 *
 * @example
 * ```typescript
 * import { EventMessage } from '@package/events';
 * import type { UserCreatedData } from './events/user-events.schema';
 *
 * const event: EventMessage<UserCreatedData> = {
 *   eventType: 'user.created',
 *   schemaVersion: '1.0',
 *   data: {
 *     userId: 'user-123',
 *     organizationId: 'org-456',
 *     emailHash: 'abc123...',
 *     createdAt: new Date(),
 *   }
 * };
 * ```
 */

/**
 * Deletion type const enum
 *
 * Type-safe deletion type values.
 */
const enum DeletionType {
  /** User is marked as deleted but data is retained */
  Soft = 'soft',
  /** User data is permanently removed */
  Hard = 'hard'
}

/**
 * Password change actor const enum
 *
 * Type-safe password change actor values.
 */
const enum PasswordChangeActor {
  /** User changed their own password */
  User = 'user',
  /** Admin reset the password */
  Admin = 'admin',
  /** System-initiated change (e.g., expiration) */
  System = 'system'
}

/**
 * Base event data interface
 *
 * Common fields shared across all user events.
 */
export interface BaseUserEventData {
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
 * User created event data
 *
 * Fired when a new user is created in the system.
 *
 * @example
 * ```typescript
 * const data: UserCreatedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   emailHash: 'a1b2c3...',
 *   createdAt: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserCreatedData extends BaseUserEventData {
  /**
   * Organization ID
   *
   * The organization this user belongs to.
   */
  readonly organizationId: string;

  /**
   * Email hash
   *
   * SHA-256 hash of the user's email for privacy.
   * Actual email is stored encrypted separately.
   */
  readonly emailHash: string;

  /**
   * Creation timestamp
   *
   * When the user was created (ISO 8601 format).
   */
  readonly createdAt: string;
}

/**
 * User updated event data
 *
 * Fired when user information is updated.
 * Contains only the changed fields.
 *
 * @example
 * ```typescript
 * const data: UserUpdatedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   changes: {
 *     name: 'John Doe',
 *     updatedAt: '2024-01-01T00:00:00.000Z',
 *   },
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserUpdatedData extends BaseUserEventData {
  /**
   * Changed fields
   *
   * Key-value pairs of fields that were changed.
   * Only includes modified fields, not the entire user object.
   */
  readonly changes: Readonly<Record<string, unknown>>;

  /**
   * Updated by
   *
   * ID of the user or system that made the change.
   */
  readonly updatedBy?: string;
}

/**
 * User deleted event data
 *
 * Fired when a user is deleted (soft or hard delete).
 *
 * @example
 * ```typescript
 * const data: UserDeletedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   deletionType: 'soft',
 *   deletedBy: 'admin-789',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserDeletedData extends BaseUserEventData {
  /**
   * Deletion type
   *
   * - DeletionType.Soft: User is marked as deleted but data is retained
   * - DeletionType.Hard: User data is permanently removed
   */
  readonly deletionType: DeletionType;

  /**
   * Deleted by
   *
   * ID of the user or system that performed the deletion.
   */
  readonly deletedBy?: string;

  /**
   * Deletion reason
   *
   * Optional reason for deletion (GDPR, request, etc.).
   */
  readonly reason?: string;
}

/**
 * User email updated event data
 *
 * Fired when user email is changed.
 * Contains old and new email hashes (never actual emails).
 *
 * @example
 * ```typescript
 * const data: UserEmailUpdatedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   oldEmailHash: 'old-hash...',
 *   newEmailHash: 'new-hash...',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserEmailUpdatedData extends BaseUserEventData {
  /**
   * Old email hash
   *
   * SHA-256 hash of the previous email.
   */
  readonly oldEmailHash: string;

  /**
   * New email hash
   *
   * SHA-256 hash of the new email.
   */
  readonly newEmailHash: string;

  /**
   * Verified
   *
   * Whether the new email has been verified.
   */
  readonly verified: boolean;
}

/**
 * User password changed event data
 *
 * Fired when user password is changed.
 * Contains user ID and timestamp (never the password itself).
 *
 * @example
 * ```typescript
 * const data: UserPasswordChangedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   changedAt: '2024-01-01T00:00:00.000Z',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserPasswordChangedData extends BaseUserEventData {
  /**
   * Change timestamp
   *
   * When the password was changed (ISO 8601 format).
   */
  readonly changedAt: string;

  /**
   * Changed by
   *
   * - PasswordChangeActor.User: User changed their own password
   * - PasswordChangeActor.Admin: Admin reset the password
   * - PasswordChangeActor.System: System-initiated change (e.g., expiration)
   */
  readonly changedBy: PasswordChangeActor;

  /**
   * Force change on next login
   *
   * Whether user must change password on next login.
   */
  readonly forceChange?: boolean;
}

/**
 * User profile viewed event data
 *
 * Fired when user profile is accessed.
 * For PII access tracking and audit logging.
 *
 * @example
 * ```typescript
 * const data: UserProfileViewedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   viewedBy: 'admin-789',
 *   fields: ['email', 'name', 'phone'],
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserProfileViewedData extends BaseUserEventData {
  /**
   * Viewer ID
   *
   * ID of the user who viewed the profile.
   */
  readonly viewedBy: string;

  /**
   * Viewed fields
   *
   * List of PII fields that were accessed.
   */
  readonly fields: readonly string[];

  /**
   * View purpose
   *
   * Optional reason for viewing (support, audit, etc.).
   */
  readonly purpose?: string;
}

/**
 * User status changed event data
 *
 * Fired when user status changes.
 *
 * @example
 * ```typescript
 * const data: UserStatusChangedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   oldStatus: 'active',
 *   newStatus: 'suspended',
 *   reason: 'Violation of terms',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserStatusChangedData extends BaseUserEventData {
  /**
   * Old status
   *
   * Previous user status.
   */
  readonly oldStatus: string;

  /**
   * New status
   *
   * Current user status.
   */
  readonly newStatus: string;

  /**
   * Change reason
   *
   * Optional reason for status change.
   */
  readonly reason?: string;

  /**
   * Changed by
   *
   * ID of the user or system that changed the status.
   */
  readonly changedBy?: string;
}

/**
 * Event data schema mapping
 *
 * Maps event types to their corresponding data schemas.
 * Provides type safety when working with events.
 *
 * @example
 * ```typescript
 * import { UserEventDataSchemas } from './events/user-events.schema';
 *
 * type UserCreatedData = UserEventDataSchemas['user.created'];
 * ```
 */
export type UserEventDataSchemas = {
  [UserEventType.USER_CREATED]: UserCreatedData;
  [UserEventType.USER_UPDATED]: UserUpdatedData;
  [UserEventType.USER_DELETED]: UserDeletedData;
  [UserEventType.USER_EMAIL_UPDATED]: UserEmailUpdatedData;
  [UserEventType.USER_PASSWORD_CHANGED]: UserPasswordChangedData;
  [UserEventType.USER_PROFILE_VIEWED]: UserProfileViewedData;
  [UserEventType.USER_STATUS_CHANGED]: UserStatusChangedData;
};

// Export const enums for use in validation and other utilities
export { DeletionType, PasswordChangeActor };

// Import UserEventType for the mapping above
import type { UserEventType } from './user-event-types.constants';
