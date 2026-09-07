/**
 * User Address Event Schemas
 *
 * Type-safe event data schemas for all user address-related events.
 * All schemas include schema version for backward compatibility.
 *
 * Event data schemas define the structure of the `data` field in EventMessage.
 *
 * IMPORTANT: No PII in event payloads.
 * Events contain only metadata and field names (not encrypted values).
 *
 * @module UsersEvents
 */

import type { UserAddressEventType } from './user-address-events.constants';
import type { AddressType } from '@package/constants';

/**
 * Base address event data interface
 *
 * Common fields shared across all user address events.
 */
export interface BaseUserAddressEventData {
  /**
   * Tenant/organization ID
   *
   * Required for multi-tenant isolation.
   */
  readonly tenantId: string;

  /**
   * User ID
   *
   * ID of the user who owns this address.
   */
  readonly userId: string;

  /**
   * Address ID
   *
   * Unique identifier for the address.
   */
  readonly addressId: string;

  /**
   * Event timestamp
   *
   * When the event occurred (ISO 8601 format).
   */
  readonly timestamp: string;
}

/**
 * User address created event data
 *
 * Fired when a new user address is created.
 * Contains address metadata (no PII values).
 *
 * @example
 * ```typescript
 * const data: UserAddressCreatedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   addressId: 'addr-789',
 *   addressType: AddressType.Primary,
 *   isDefault: true,
 *   encryptedStoreFields: ['street', 'city', 'state', 'postalCode', 'country'],
 *   createdAt: '2024-01-01T00:00:00.000Z',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserAddressCreatedData extends BaseUserAddressEventData {
  /**
   * Address type
   *
   * Categorizes the address (primary, billing, shipping)
   */
  readonly addressType: AddressType;

  /**
   * Whether this is the default address
   *
   * Indicates if this is the user's default address for the type.
   */
  readonly isDefault: boolean;

  /**
   * encrypted-store field names
   *
   * List of address components stored in encrypted-store.
   * Does NOT include actual PII values.
   */
  readonly encryptedStoreFields: readonly string[];

  /**
   * Creation timestamp
   *
   * When the address was created (ISO 8601 format).
   */
  readonly createdAt: string;
}

/**
 * User address updated event data
 *
 * Fired when user address information is updated.
 * Contains only the changed field names (no PII values).
 *
 * @example
 * ```typescript
 * const data: UserAddressUpdatedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   addressId: 'addr-789',
 *   changedFields: ['city', 'state', 'postalCode'],
 *   changedNonPiiFields: {
 *     isDefault: true,
 *     addressType: 'billing'
 *   },
 *   updatedBy: 'user-456',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserAddressUpdatedData extends BaseUserAddressEventData {
  /**
   * Changed PII field names
   *
   * List of encrypted-store-managed fields that were updated.
   * Does NOT include actual values (only field names).
   */
  readonly changedFields: readonly string[];

  /**
   * Changed non-PII fields
   *
   * Non-sensitive fields that were updated with their new values.
   */
  readonly changedNonPiiFields: Readonly<{
    readonly addressType?: AddressType;
    readonly isDefault?: boolean;
    readonly isVerified?: boolean;
  }>;

  /**
   * Updated by
   *
   * ID of the user or system that made the change.
   */
  readonly updatedBy?: string;
}

/**
 * User address deleted event data
 *
 * Fired when a user address is deleted (soft delete).
 * Contains address ID and deletion metadata.
 *
 * @example
 * ```typescript
 * const data: UserAddressDeletedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   addressId: 'addr-789',
 *   deletedBy: 'user-456',
 *   reason: 'User requested deletion',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserAddressDeletedData extends BaseUserAddressEventData {
  /**
   * Deleted by
   *
   * ID of the user or system that performed the deletion.
   */
  readonly deletedBy?: string;

  /**
   * Deletion reason
   *
   * Optional reason for deletion (user request, duplicate, etc.).
   */
  readonly reason?: string;
}

/**
 * User address default changed event data
 *
 * Fired when the default address for a user is changed.
 * Contains old and new default address IDs.
 *
 * @example
 * ```typescript
 * const data: UserAddressDefaultChangedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   addressType: 'primary',
 *   oldDefaultAddressId: 'addr-111',
 *   newDefaultAddressId: 'addr-789',
 *   changedBy: 'user-456',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserAddressDefaultChangedData extends BaseUserAddressEventData {
  /**
   * Address type
   *
   * The type of address for which default was changed.
   */
  readonly addressType: AddressType;

  /**
   * Old default address ID
   *
   * ID of the previously default address (now unset).
   */
  readonly oldDefaultAddressId?: string;

  /**
   * New default address ID
   *
   * ID of the newly default address.
   */
  readonly newDefaultAddressId: string;

  /**
   * Changed by
   *
   * ID of the user or system that changed the default.
   */
  readonly changedBy?: string;
}

/**
 * User address verified event data
 *
 * Fired when an address is verified (e.g., via postal service).
 * Contains address ID and verification status.
 *
 * @example
 * ```typescript
 * const data: UserAddressVerifiedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   addressId: 'addr-789',
 *   verified: true,
 *   verifiedBy: 'postal-service',
 *   verificationDate: '2024-01-01T00:00:00.000Z',
 *   timestamp: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserAddressVerifiedData extends BaseUserAddressEventData {
  /**
   * Verification status
   *
   * Whether the address was successfully verified.
   */
  readonly verified: boolean;

  /**
   * Verified by
   *
   * Service or system that performed verification.
   */
  readonly verifiedBy?: string;

  /**
   * Verification date
   *
   * When the address was verified (ISO 8601 format).
   */
  readonly verificationDate?: string;
}

/**
 * Event data schema mapping
 *
 * Maps event types to their corresponding data schemas.
 * Provides type safety when working with events.
 */
export type UserAddressEventDataSchemas = {
  [UserAddressEventType.USER_ADDRESS_CREATED]: UserAddressCreatedData;
  [UserAddressEventType.USER_ADDRESS_UPDATED]: UserAddressUpdatedData;
  [UserAddressEventType.USER_ADDRESS_DELETED]: UserAddressDeletedData;
  [UserAddressEventType.USER_ADDRESS_DEFAULT_CHANGED]: UserAddressDefaultChangedData;
  [UserAddressEventType.USER_ADDRESS_VERIFIED]: UserAddressVerifiedData;
};
