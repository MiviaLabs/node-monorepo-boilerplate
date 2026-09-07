/**
 * Event Versioning Test Helper
 *
 * Test schemas and migrations for event versioning E2E tests.
 * Provides reusable versioned event schemas and migration functions.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// Versioned event schema type for our tests
export interface VersionedEventSchema<T = unknown> {
  readonly version: `${number}.${number}`;
  readonly schema: z.ZodType<T>;
  readonly deprecationDate?: Date;
  readonly sunsetDate?: Date;
}

// Event migration types for our tests
export interface EventMigration<TOld = unknown, TNew = unknown> {
  readonly fromVersion: `${number}.${number}`;
  readonly toVersion: `${number}.${number}`;
  readonly migrate: (data: TOld) => TNew;
}

// Test event type for versioning tests
export const TEST_EVENT_TYPE = 'test.event.versioning';

// V1 Event Schema - simple structure
export interface TestEventV1 {
  readonly userId: string;
  readonly fullName: string;
  readonly isActive: boolean;
}

export const testEventV1Schema: VersionedEventSchema<TestEventV1> = {
  version: '1.0',
  schema: z.object({
    userId: z.string(),
    fullName: z.string(),
    isActive: z.boolean()
  })
};

// V2 Event Schema - split name into firstName/lastName
export interface TestEventV2 {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isActive: boolean;
  readonly email?: string;
}

export const testEventV2Schema: VersionedEventSchema<TestEventV2> = {
  version: '2.0',
  schema: z.object({
    userId: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    isActive: z.boolean(),
    email: z.string().optional()
  })
};

// V3 Event Schema - adds profile object
export interface TestEventV3 {
  readonly userId: string;
  readonly profile: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
  };
  readonly isActive: boolean;
  readonly metadata?: {
    readonly source: string;
    readonly timestamp: string;
  };
}

export const testEventV3Schema: VersionedEventSchema<TestEventV3> = {
  version: '3.0',
  schema: z.object({
    userId: z.string(),
    profile: z.object({
      firstName: z.string(),
      lastName: z.string(),
      email: z.string()
    }),
    isActive: z.boolean(),
    metadata: z
      .object({
        source: z.string(),
        timestamp: z.string()
      })
      .optional()
  })
};

// Migration functions

/**
 * v1 -> v2 migration: split fullName into firstName/lastName
 */
export const v1ToV2Migration: EventMigration<TestEventV1, TestEventV2> = {
  fromVersion: '1.0',
  toVersion: '2.0',
  migrate: (oldEvent) => {
    const nameParts = oldEvent.fullName.split(' ');
    return {
      userId: oldEvent.userId,
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' ') ?? '',
      isActive: oldEvent.isActive
      // email is not present in v1, so undefined is acceptable
    };
  }
};

/**
 * v2 -> v3 migration: wrap name fields in profile object
 */
export const v2ToV3Migration: EventMigration<TestEventV2, TestEventV3> = {
  fromVersion: '2.0',
  toVersion: '3.0',
  migrate: (oldEvent) => {
    return {
      userId: oldEvent.userId,
      profile: {
        firstName: oldEvent.firstName,
        lastName: oldEvent.lastName,
        email: oldEvent.email ?? 'default@example.com'
      },
      isActive: oldEvent.isActive,
      metadata: {
        source: 'migration',
        timestamp: new Date().toISOString()
      }
    };
  }
};

/**
 * Create test event for a specific version
 */
export function createTestEvent<T>(
  version: `${number}.${number}`,
  data: T
): {
  eventType: string;
  version: `${number}.${number}`;
  data: T;
} {
  return {
    eventType: TEST_EVENT_TYPE,
    version,
    data
  };
}

/**
 * Get all test schemas
 */
export function getAllTestSchemas(): ReadonlyArray<VersionedEventSchema<unknown>> {
  return [testEventV1Schema, testEventV2Schema, testEventV3Schema];
}

/**
 * Get all test migrations
 */
export function getAllTestMigrations(): ReadonlyArray<EventMigration<unknown, unknown>> {
  return [
    v1ToV2Migration as EventMigration<unknown, unknown>,
    v2ToV3Migration as EventMigration<unknown, unknown>
  ];
}

/**
 * Create test event data for v1
 */
export function createV1EventData(overrides?: Partial<TestEventV1>): TestEventV1 {
  return {
    userId: 'user-123',
    fullName: 'John Doe',
    isActive: true,
    ...overrides
  };
}

/**
 * Create test event data for v2
 */
export function createV2EventData(overrides?: Partial<TestEventV2>): TestEventV2 {
  return {
    userId: 'user-456',
    firstName: 'Jane',
    lastName: 'Smith',
    isActive: false,
    email: 'jane@example.com',
    ...overrides
  };
}

/**
 * Create test event data for v3
 */
export function createV3EventData(overrides?: Partial<TestEventV3>): TestEventV3 {
  return {
    userId: 'user-789',
    profile: {
      firstName: 'Bob',
      lastName: 'Johnson',
      email: 'bob@example.com'
    },
    isActive: true,
    metadata: {
      source: 'test',
      timestamp: new Date().toISOString()
    },
    ...overrides
  };
}
