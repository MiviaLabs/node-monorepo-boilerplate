/**
 * User Event Utilities
 *
 * Helper functions for creating and validating user events.
 * Ensures consistency in event structure and reduces boilerplate.
 *
 * @example
 * ```typescript
 * import { createUserEvent } from './events/user-events.utils';
 * import { UserEventType } from './events/user-event-types.constants';
 *
 * const event = createUserEvent(UserEventType.USER_CREATED, {
 *   userId: 'user-123',
 *   organizationId: 'org-456',
 *   emailHash: 'abc123...',
 *   createdAt: new Date().toISOString(),
 * });
 * ```
 */

import { randomUUID } from 'node:crypto';

import {
  UserEventType,
  UserEventSchemaVersion,
  type UserEventTypes
} from './user-event-types.constants';
import { DeletionType, PasswordChangeActor } from './user-events.schema';

import type { UserEventDataSchemas } from './user-events.schema';
import type { EventMessage } from '@package/events';

/**
 * Create a user event with standard structure
 *
 * Helper function to create events with all required fields populated.
 * Ensures consistent event structure across the users module.
 *
 * @template TEvent - Event type (e.g., 'user.created')
 * @param eventType - The type of event to create
 * @param data - Event data matching the event type schema
 * @param options - Optional event metadata (correlationId, causationId, etc.)
 * @returns A properly structured EventMessage
 *
 * @example
 * ```typescript
 * const event = createUserEvent(UserEventType.USER_CREATED, {
 *   userId: 'user-123',
 *   organizationId: 'org-456',
 *   emailHash: 'abc123...',
 *   createdAt: new Date().toISOString(),
 * }, {
 *   tenantId: 'org-456',
 *   correlationId: 'req-123',
 * });
 * ```
 */
export function createUserEvent<TEvent extends UserEventTypes>(
  eventType: TEvent,
  data: UserEventDataSchemas[TEvent],
  options: {
    readonly correlationId?: string;
    readonly causationId?: string;
    readonly tenantId?: string;
    readonly userId?: string;
  } = {}
): EventMessage<UserEventDataSchemas[TEvent]> {
  const now = new Date();
  const eventId = randomUUID();

  return {
    eventType,
    eventId,
    timestamp: now,
    occurredAt: now,
    readonly: true,
    version: 1,
    aggregateId: data.userId,
    data,
    correlationId: options.correlationId,
    causationId: options.causationId,
    tenantId: options.tenantId ?? data.tenantId,
    schemaVersion: UserEventSchemaVersion.V1_0,
    metadata: {
      correlationId: options.correlationId,
      causationId: options.causationId,
      tenantId: options.tenantId ?? data.tenantId,
      userId: options.userId
    }
  } as EventMessage<UserEventDataSchemas[TEvent]>;
}

/**
 * Get topic name for event type
 *
 * Converts event type to Kafka topic name.
 * Pattern: Replace dots with dashes.
 *
 * @param eventType - The event type (e.g., 'user.created')
 * @returns The corresponding Kafka topic (e.g., 'user-created')
 *
 * @example
 * ```typescript
 * const topic = getTopicForEventType(UserEventType.USER_CREATED); // 'user-created'
 * ```
 */
export function getTopicForEventType(eventType: UserEventTypes): string {
  return eventType.replace(/\./g, '-');
}

/**
 * Validate event data schema
 *
 * Validates that event data matches the expected schema for the event type.
 * Throws TypeError if validation fails.
 *
 * @template TEvent - Event type
 * @param eventType - The type of event
 * @param data - Event data to validate
 * @returns True if valid, throws if invalid
 *
 * @example
 * ```typescript
 * try {
 *   validateEventData(UserEventType.USER_CREATED, {
 *     userId: 'user-123',
 *     organizationId: 'org-456',
 *     emailHash: 'abc123...',
 *     createdAt: new Date().toISOString(),
 *   });
 *   console.log('Event data is valid');
 * } catch (error) {
 *   console.error('Invalid event data:', error.message);
 * }
 * ```
 */
export function validateEventData<TEvent extends UserEventTypes>(
  eventType: TEvent,
  data: unknown
): data is UserEventDataSchemas[TEvent] {
  // Basic validation
  if (!data || typeof data !== 'object') {
    throw new TypeError(`Event data must be an object for ${eventType}`);
  }

  const eventData = data as Record<string, unknown>;

  // Validate base fields
  validateBaseFields(eventData, eventType);

  // Validate event-specific fields
  validateEventSpecificFields(eventType, eventData);

  return true;
}

/**
 * Validate base fields present in all events
 */
function validateBaseFields(eventData: Record<string, unknown>, eventType: string): void {
  if (typeof eventData['userId'] !== 'string') {
    throw new TypeError(`userId must be a string for ${eventType}`);
  }

  if (typeof eventData['timestamp'] !== 'string') {
    throw new TypeError(`timestamp must be a string for ${eventType}`);
  }
}

/**
 * Validate event-specific fields based on event type
 */
function validateEventSpecificFields(
  eventType: UserEventTypes,
  eventData: Record<string, unknown>
): void {
  const validators: Record<UserEventTypes, (data: Record<string, unknown>) => void> = {
    [UserEventType.USER_CREATED]: validateUserCreated,
    [UserEventType.USER_UPDATED]: validateUserUpdated,
    [UserEventType.USER_DELETED]: validateUserDeleted,
    [UserEventType.USER_EMAIL_UPDATED]: validateUserEmailUpdated,
    [UserEventType.USER_PASSWORD_CHANGED]: validateUserPasswordChanged,
    [UserEventType.USER_PROFILE_VIEWED]: validateUserProfileViewed,
    [UserEventType.USER_STATUS_CHANGED]: validateUserStatusChanged
  };

  const validator = validators[eventType];
  if (!validator) {
    throw new TypeError(`Unknown event type: ${eventType}`);
  }

  validator(eventData);
}

/**
 * Validate USER_CREATED event data
 */
function validateUserCreated(eventData: Record<string, unknown>): void {
  if (typeof eventData['organizationId'] !== 'string') {
    throw new TypeError(`organizationId must be a string for ${UserEventType.USER_CREATED}`);
  }
  if (typeof eventData['emailHash'] !== 'string') {
    throw new TypeError(`emailHash must be a string for ${UserEventType.USER_CREATED}`);
  }
}

/**
 * Validate USER_UPDATED event data
 */
function validateUserUpdated(eventData: Record<string, unknown>): void {
  if (typeof eventData['changes'] !== 'object' || eventData['changes'] === null) {
    throw new TypeError(`changes must be an object for ${UserEventType.USER_UPDATED}`);
  }
}

/**
 * Validate USER_DELETED event data
 */
function validateUserDeleted(eventData: Record<string, unknown>): void {
  if (
    eventData['deletionType'] !== DeletionType.Soft &&
    eventData['deletionType'] !== DeletionType.Hard
  ) {
    throw new TypeError(
      `deletionType must be DeletionType.Soft or DeletionType.Hard for ${UserEventType.USER_DELETED}`
    );
  }
}

/**
 * Validate USER_EMAIL_UPDATED event data
 */
function validateUserEmailUpdated(eventData: Record<string, unknown>): void {
  if (typeof eventData['oldEmailHash'] !== 'string') {
    throw new TypeError(`oldEmailHash must be a string for ${UserEventType.USER_EMAIL_UPDATED}`);
  }
  if (typeof eventData['newEmailHash'] !== 'string') {
    throw new TypeError(`newEmailHash must be a string for ${UserEventType.USER_EMAIL_UPDATED}`);
  }
  if (typeof eventData['verified'] !== 'boolean') {
    throw new TypeError(`verified must be a boolean for ${UserEventType.USER_EMAIL_UPDATED}`);
  }
}

/**
 * Validate USER_PASSWORD_CHANGED event data
 */
function validateUserPasswordChanged(eventData: Record<string, unknown>): void {
  if (typeof eventData['changedAt'] !== 'string') {
    throw new TypeError(`changedAt must be a string for ${UserEventType.USER_PASSWORD_CHANGED}`);
  }
  if (
    eventData['changedBy'] !== PasswordChangeActor.User &&
    eventData['changedBy'] !== PasswordChangeActor.Admin &&
    eventData['changedBy'] !== PasswordChangeActor.System
  ) {
    throw new TypeError(
      `changedBy must be PasswordChangeActor.User, Admin, or System for ${UserEventType.USER_PASSWORD_CHANGED}`
    );
  }
}

/**
 * Validate USER_PROFILE_VIEWED event data
 */
function validateUserProfileViewed(eventData: Record<string, unknown>): void {
  if (typeof eventData['viewedBy'] !== 'string') {
    throw new TypeError(`viewedBy must be a string for ${UserEventType.USER_PROFILE_VIEWED}`);
  }
  const fields = eventData['fields'];
  if (!Array.isArray(fields)) {
    throw new TypeError(`fields must be an array for ${UserEventType.USER_PROFILE_VIEWED}`);
  }
}

/**
 * Validate USER_STATUS_CHANGED event data
 */
function validateUserStatusChanged(eventData: Record<string, unknown>): void {
  if (typeof eventData['oldStatus'] !== 'string') {
    throw new TypeError(`oldStatus must be a string for ${UserEventType.USER_STATUS_CHANGED}`);
  }
  if (typeof eventData['newStatus'] !== 'string') {
    throw new TypeError(`newStatus must be a string for ${UserEventType.USER_STATUS_CHANGED}`);
  }
}

/**
 * Extract event type from EventMessage
 *
 * Type-safe helper to extract eventType from EventMessage.
 *
 * @param event - The EventMessage
 * @returns The event type
 *
 * @example
 * ```typescript
 * const eventType = extractEventType(event); // 'user.created'
 * ```
 */
export function extractEventType<TData>(event: EventMessage<TData>): string {
  return event.eventType;
}

/**
 * Check if event is a user event
 *
 * Type guard to check if an event is a user-related event.
 *
 * @param event - The EventMessage to check
 * @returns True if the event is a user event
 *
 * @example
 * ```typescript
 * if (isUserEvent(event)) {
 *   // Handle user event
 * }
 * ```
 */
export function isUserEvent(event: EventMessage): event is EventMessage<unknown> {
  return Object.values(UserEventType).includes(event.eventType as UserEventTypes);
}

/**
 * Get schema version for event
 *
 * Returns the schema version for an event type.
 * Currently all events use v1.0, but this allows for future versioning.
 *
 * @param eventType - The event type
 * @returns The schema version (e.g., '1.0')
 *
 * @example
 * ```typescript
 * const version = getSchemaVersion(UserEventType.USER_CREATED); // '1.0'
 * ```
 */
export function getSchemaVersion(_eventType: UserEventTypes): string {
  return UserEventSchemaVersion.V1_0;
}
