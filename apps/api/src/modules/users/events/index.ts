/**
 * @module UsersEvents
 * @description Domain events for user and user address lifecycle operations.
 *
 * Centralized event structure for the users module.
 * Provides type-safe event creation, schema validation, and utilities.
 *
 * @example
 * ```typescript
 * import { UserEventType, createUserEvent } from './events';
 * import type { UserCreatedData } from './events';
 *
 * // Create event with utility
 * const event = createUserEvent(UserEventType.USER_CREATED, {
 *   userId: 'user-123',
 *   organizationId: 'org-456',
 *   emailHash: 'abc123...',
 *   createdAt: new Date().toISOString(),
 * });
 *
 * // Or use types directly
 * const eventData: UserCreatedData = {
 *   userId: 'user-123',
 *   organizationId: 'org-456',
 *   emailHash: 'abc123...',
 *   createdAt: new Date().toISOString(),
 *   tenantId: 'org-456',
 *   timestamp: new Date().toISOString(),
 * };
 * ```
 */

// User event type constants
export * from './user-event-types.constants';

// User event data schemas
export * from './user-events.schema';

// User event utilities
export * from './user-events.utils';

// User address event type constants
export * from './user-address-events.constants';

// User address event data schemas (type-only exports)
export type {
  UserAddressEventDataSchemas,
  BaseUserAddressEventData,
  UserAddressCreatedData,
  UserAddressUpdatedData,
  UserAddressDeletedData,
  UserAddressDefaultChangedData,
  UserAddressVerifiedData
} from './user-address-events.schema';

// Re-export AddressType from constants for convenience
export { AddressType } from '@package/constants';
