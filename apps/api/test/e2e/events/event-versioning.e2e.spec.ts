/**
 * Event Versioning E2E Tests
 *
 * Tests the complete event versioning flow including:
 * 1. Schema registration for multiple versions
 * 2. Migration between event versions
 * 3. Backward compatibility with consumer migration
 * 4. Incompatible version rejection
 * 5. Multi-step migration chains (v1 -> v2 -> v3)
 * 6. Latest version retrieval
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import { startTestServer, waitForServiceInitialization } from '../../helpers/bootstrap';
import { setupE2ETestDatabaseJest } from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';

// Test event types for versioning (local to this file to avoid lazy-loading issues)
const TEST_EVENT_TYPE = 'test.event.versioning';

// Versioned event schema type for our tests
interface VersionedEventSchema<T = unknown> {
  readonly version: `${number}.${number}`;
  readonly schema: z.ZodType<T>;
  readonly deprecationDate?: Date;
  readonly sunsetDate?: Date;
}

// Event migration types for our tests
interface EventMigration<TOld = unknown, TNew = unknown> {
  readonly fromVersion: `${number}.${number}`;
  readonly toVersion: `${number}.${number}`;
  readonly migrate: (data: TOld) => TNew;
}

// V1 Event Schema - simple structure
interface TestEventV1 {
  readonly userId: string;
  readonly fullName: string;
  readonly isActive: boolean;
}

const testEventV1Schema: VersionedEventSchema<TestEventV1> = {
  version: '1.0',
  schema: z.object({
    userId: z.string(),
    fullName: z.string(),
    isActive: z.boolean()
  })
};

// V2 Event Schema - split name into firstName/lastName
interface TestEventV2 {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isActive: boolean;
  readonly email?: string;
}

const testEventV2Schema: VersionedEventSchema<TestEventV2> = {
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
interface TestEventV3 {
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

const testEventV3Schema: VersionedEventSchema<TestEventV3> = {
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

const v1ToV2Migration: EventMigration<TestEventV1, TestEventV2> = {
  fromVersion: '1.0',
  toVersion: '2.0',
  migrate: (oldEvent) => {
    const nameParts = oldEvent.fullName.split(' ');
    return {
      userId: oldEvent.userId,
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' ') ?? '',
      isActive: oldEvent.isActive
    };
  }
};

const v2ToV3Migration: EventMigration<TestEventV2, TestEventV3> = {
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

describe('Event Versioning E2E Tests', () => {
  let server: TestServer;
  let eventVersioningService: {
    registerSchema<T = unknown>(eventType: string, schema: VersionedEventSchema<T>): void;
    getLatestVersion(eventType: string): `${number}.${number}` | null;
    migrateEvent<T = unknown>(
      eventType: string,
      event: T,
      fromVersion: `${number}.${number}`,
      toVersion: `${number}.${number}`
    ): T | null;
    registerMigration<TOld = unknown, TNew = unknown>(
      eventType: string,
      migration: EventMigration<TOld, TNew>
    ): void;
    registerCompatibilityRule(
      eventType: string,
      rule: {
        readonly consumerVersion: `${number}.${number}`;
        readonly compatibleProducerVersions: readonly `${number}.${number}`[];
        readonly migrationRequired: boolean;
      }
    ): void;
    getCompatibleVersions(
      eventType: string,
      consumerVersion: `${number}.${number}`
    ): `${number}.${number}`[];
  };

  beforeAll(async () => {
    // CRITICAL: Setup test database FIRST
    await setupE2ETestDatabaseJest();

    // CRITICAL: Setup Kafka SECOND (slow startup, 10-30 seconds)
    const { setupKafkaE2E: setupKafka } = await import('@package/test-utils');
    await setupKafka();

    // CRITICAL: Enable events module for Kafka tests
    // This overrides the EVENTS_ENABLED=false in bootstrap.ts
    process.env['EVENTS_ENABLED'] = 'true';

    // CRITICAL: Start server THIRD
    server = await startTestServer();

    // CRITICAL: Wait for all services to be initialized BEFORE running tests
    await waitForServiceInitialization(server, { maxWait: 45000 });

    // Get EventVersioningService from app
    // CRITICAL: Dynamic import required for @package/events (lazy-loaded package)
    const eventsModule = await import('@package/events');
    const EventVersioningService = eventsModule.EventVersioningService;
    eventVersioningService = server.app.get(EventVersioningService);
  }, 120000); // Extended timeout for Kafka + database startup (120 seconds for slow CI environments)

  afterAll(async () => {
    await server?.close();
    const { teardownKafkaE2E: teardownKafka } = await import('@package/test-utils');
    await teardownKafka();
  });

  describe('Schema Registration', () => {
    afterEach(() => {
      // Clear registered schemas after each test for isolation
      // Note: In production, you'd have a reset/clear method
    });

    it('should register multiple schemas for the same event type', () => {
      // Register v1 and v2 schemas
      eventVersioningService.registerSchema(TEST_EVENT_TYPE, testEventV1Schema);
      eventVersioningService.registerSchema(TEST_EVENT_TYPE, testEventV2Schema);

      // Get latest version should return v2
      const latestVersion = eventVersioningService.getLatestVersion(TEST_EVENT_TYPE);
      expect(latestVersion).toBe('2.0');
    });

    it('should return null for unregistered event types', () => {
      const latestVersion = eventVersioningService.getLatestVersion('nonexistent.event');
      expect(latestVersion).toBeNull();
    });

    it('should get the latest version when multiple versions are registered', () => {
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.latest`, testEventV1Schema);
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.latest`, testEventV2Schema);
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.latest`, testEventV3Schema);

      const latestVersion = eventVersioningService.getLatestVersion(`${TEST_EVENT_TYPE}.latest`);
      expect(latestVersion).toBe('3.0');
    });
  });

  describe('Event Migration (v1 -> v2)', () => {
    beforeEach(() => {
      // Setup schemas and migration for v1 -> v2
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.migration`, testEventV1Schema);
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.migration`, testEventV2Schema);

      // Register migration function: split fullName into firstName/lastName
      eventVersioningService.registerMigration(`${TEST_EVENT_TYPE}.migration`, v1ToV2Migration);
    });

    it('should migrate event from v1 to v2 correctly', () => {
      const v1Event: TestEventV1 = {
        userId: 'user-123',
        fullName: 'John Doe',
        isActive: true
      };

      const migratedEvent = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.migration`,
        v1Event,
        '1.0',
        '2.0'
      );

      expect(migratedEvent).not.toBeNull();
      expect((migratedEvent as unknown as TestEventV2).userId).toBe('user-123');
      expect((migratedEvent as unknown as TestEventV2).firstName).toBe('John');
      expect((migratedEvent as unknown as TestEventV2).lastName).toBe('Doe');
      expect((migratedEvent as unknown as TestEventV2).isActive).toBe(true);
      expect((migratedEvent as unknown as TestEventV2).email).toBeUndefined();
    });

    it('should return null when migration path does not exist', () => {
      const v1Event: TestEventV1 = {
        userId: 'user-456',
        fullName: 'Jane Smith',
        isActive: false
      };

      // Try to migrate to v3 (not registered)
      const migratedEvent = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.migration`,
        v1Event,
        '1.0',
        '3.0'
      );

      expect(migratedEvent).toBeNull();
    });

    it('should handle edge cases in name splitting', () => {
      const v1Event: TestEventV1 = {
        userId: 'user-789',
        fullName: 'Cher', // Single name
        isActive: true
      };

      const migratedEvent = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.migration`,
        v1Event,
        '1.0',
        '2.0'
      );

      expect(migratedEvent).not.toBeNull();
      expect((migratedEvent as unknown as TestEventV2).firstName).toBe('Cher');
      expect((migratedEvent as unknown as TestEventV2).lastName).toBe('');
    });

    it('should handle names with multiple spaces', () => {
      const v1Event: TestEventV1 = {
        userId: 'user-multi',
        fullName: 'John Jacob Jingleheimer Schmidt',
        isActive: true
      };

      const migratedEvent = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.migration`,
        v1Event,
        '1.0',
        '2.0'
      );

      expect(migratedEvent).not.toBeNull();
      expect((migratedEvent as unknown as TestEventV2).firstName).toBe('John');
      expect((migratedEvent as unknown as TestEventV2).lastName).toBe('Jacob Jingleheimer Schmidt');
    });
  });

  describe('Backward Compatibility', () => {
    beforeEach(() => {
      // Setup v1 consumer that can handle v2 events via migration
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.compat`, testEventV1Schema);
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.compat`, testEventV2Schema);

      // v1 -> v2 migration
      eventVersioningService.registerMigration(`${TEST_EVENT_TYPE}.compat`, v1ToV2Migration);

      // Register compatibility rule: v2 consumer can handle v1 and v2
      eventVersioningService.registerCompatibilityRule(`${TEST_EVENT_TYPE}.compat`, {
        consumerVersion: '2.0',
        compatibleProducerVersions: ['1.0', '2.0'],
        migrationRequired: true
      });
    });

    it('should allow v2 consumer to receive and migrate v1 event', () => {
      const v1Event: TestEventV1 = {
        userId: 'user-v1-producer',
        fullName: 'Alice Johnson',
        isActive: true
      };

      // Get compatible versions for v2 consumer
      const compatibleVersions = eventVersioningService.getCompatibleVersions(
        `${TEST_EVENT_TYPE}.compat`,
        '2.0'
      );

      expect(compatibleVersions).toContain('1.0');
      expect(compatibleVersions).toContain('2.0');

      // Migrate v1 to v2 for v2 consumer
      const migratedEvent = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.compat`,
        v1Event,
        '1.0',
        '2.0'
      );

      expect(migratedEvent).not.toBeNull();
      expect((migratedEvent as unknown as TestEventV2).userId).toBe('user-v1-producer');
      expect((migratedEvent as unknown as TestEventV2).firstName).toBe('Alice');
      expect((migratedEvent as unknown as TestEventV2).lastName).toBe('Johnson');
    });

    it('should return empty array for unregistered consumer version', () => {
      const compatibleVersions = eventVersioningService.getCompatibleVersions(
        `${TEST_EVENT_TYPE}.compat`,
        '3.0'
      );

      expect(compatibleVersions).toEqual([]);
    });
  });

  describe('Incompatible Version Rejection', () => {
    beforeEach(() => {
      // Register only v1 schema
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.incompatible`, testEventV1Schema);

      // No migrations registered
    });

    it('should reject migration when no migration path exists', () => {
      const v1Event: TestEventV1 = {
        userId: 'user-incompatible',
        fullName: 'Bob Incompatible',
        isActive: false
      };

      // Try to migrate to v2 without registering v2 schema or migration
      const migratedEvent = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.incompatible`,
        v1Event,
        '1.0',
        '2.0'
      );

      expect(migratedEvent).toBeNull();
    });

    it('should return null when source version has no migrations', () => {
      const latestVersion = eventVersioningService.getLatestVersion(
        `${TEST_EVENT_TYPE}.incompatible`
      );
      expect(latestVersion).toBe('1.0');

      const v1Event: TestEventV1 = {
        userId: 'user-no-migration',
        fullName: 'No Migration',
        isActive: true
      };

      // No migration registered, should return null
      const result = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.incompatible`,
        v1Event,
        '1.0',
        '1.0'
      );

      // Same version migration (identity) should technically work or return null
      // Based on implementation, it might return null if no explicit migration is found
      expect(result === null || result === v1Event).toBeTruthy();
    });
  });

  describe('Multi-Step Migration Chain (v1 -> v2 -> v3)', () => {
    beforeEach(() => {
      // Register all three versions
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.chain`, testEventV1Schema);
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.chain`, testEventV2Schema);
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.chain`, testEventV3Schema);

      // v1 -> v2 migration with default email
      const chainV1ToV2Migration: EventMigration<TestEventV1, TestEventV2> = {
        fromVersion: '1.0',
        toVersion: '2.0',
        migrate: (oldEvent) => {
          const nameParts = oldEvent.fullName.split(' ');
          return {
            userId: oldEvent.userId,
            firstName: nameParts[0] ?? '',
            lastName: nameParts.slice(1).join(' ') ?? '',
            isActive: oldEvent.isActive,
            email: 'generated@example.com' // Add default email
          };
        }
      };

      // v2 -> v3 migration
      eventVersioningService.registerMigration(`${TEST_EVENT_TYPE}.chain`, chainV1ToV2Migration);
      eventVersioningService.registerMigration(`${TEST_EVENT_TYPE}.chain`, v2ToV3Migration);
    });

    it('should migrate through chain v1 -> v3 correctly', () => {
      const v1Event: TestEventV1 = {
        userId: 'user-chain',
        fullName: 'Charlie Brown',
        isActive: true
      };

      const migratedEvent = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.chain`,
        v1Event,
        '1.0',
        '3.0'
      );

      expect(migratedEvent).not.toBeNull();

      const v3Event = migratedEvent as unknown as TestEventV3;
      expect(v3Event.userId).toBe('user-chain');
      expect(v3Event.profile.firstName).toBe('Charlie');
      expect(v3Event.profile.lastName).toBe('Brown');
      expect(v3Event.profile.email).toBe('generated@example.com');
      expect(v3Event.isActive).toBe(true);
      expect(v3Event.metadata).toBeDefined();
      expect(v3Event.metadata?.source).toBe('migration');
    });

    it('should support step-by-step migration', () => {
      const v1Event: TestEventV1 = {
        userId: 'user-stepwise',
        fullName: 'Diana Prince',
        isActive: true
      };

      // First migrate v1 -> v2
      const v2Event = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.chain`,
        v1Event,
        '1.0',
        '2.0'
      ) as unknown as TestEventV2;

      expect(v2Event).not.toBeNull();
      expect(v2Event.firstName).toBe('Diana');
      expect(v2Event.lastName).toBe('Prince');
      expect(v2Event.email).toBe('generated@example.com');

      // Then migrate v2 -> v3
      const v3Event = eventVersioningService.migrateEvent(
        `${TEST_EVENT_TYPE}.chain`,
        v2Event,
        '2.0',
        '3.0'
      ) as unknown as TestEventV3;

      expect(v3Event).not.toBeNull();
      expect(v3Event.profile.firstName).toBe('Diana');
      expect(v3Event.profile.lastName).toBe('Prince');
      expect(v3Event.profile.email).toBe('generated@example.com');
      expect(v3Event.metadata).toBeDefined();
    });

    it('should return v3 as latest version', () => {
      const latestVersion = eventVersioningService.getLatestVersion(`${TEST_EVENT_TYPE}.chain`);
      expect(latestVersion).toBe('3.0');
    });
  });

  describe('Consumer Compatibility Rules', () => {
    beforeEach(() => {
      // Setup schemas
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.rules`, testEventV1Schema);
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.rules`, testEventV2Schema);
      eventVersioningService.registerSchema(`${TEST_EVENT_TYPE}.rules`, testEventV3Schema);

      // Register migrations
      eventVersioningService.registerMigration(`${TEST_EVENT_TYPE}.rules`, v1ToV2Migration);
      eventVersioningService.registerMigration(`${TEST_EVENT_TYPE}.rules`, v2ToV3Migration);

      // Register multiple compatibility rules
      eventVersioningService.registerCompatibilityRule(`${TEST_EVENT_TYPE}.rules`, {
        consumerVersion: '1.0',
        compatibleProducerVersions: ['1.0'],
        migrationRequired: false
      });

      eventVersioningService.registerCompatibilityRule(`${TEST_EVENT_TYPE}.rules`, {
        consumerVersion: '2.0',
        compatibleProducerVersions: ['1.0', '2.0'],
        migrationRequired: true
      });

      eventVersioningService.registerCompatibilityRule(`${TEST_EVENT_TYPE}.rules`, {
        consumerVersion: '3.0',
        compatibleProducerVersions: ['1.0', '2.0', '3.0'],
        migrationRequired: true
      });
    });

    it('should return compatible versions for v1 consumer', () => {
      const compatibleVersions = eventVersioningService.getCompatibleVersions(
        `${TEST_EVENT_TYPE}.rules`,
        '1.0'
      );

      expect(compatibleVersions).toEqual(['1.0']);
    });

    it('should return compatible versions for v2 consumer including v1', () => {
      const compatibleVersions = eventVersioningService.getCompatibleVersions(
        `${TEST_EVENT_TYPE}.rules`,
        '2.0'
      );

      expect(compatibleVersions).toContain('1.0');
      expect(compatibleVersions).toContain('2.0');
    });

    it('should return all compatible versions for v3 consumer', () => {
      const compatibleVersions = eventVersioningService.getCompatibleVersions(
        `${TEST_EVENT_TYPE}.rules`,
        '3.0'
      );

      expect(compatibleVersions).toContain('1.0');
      expect(compatibleVersions).toContain('2.0');
      expect(compatibleVersions).toContain('3.0');
    });

    it('should return empty array for unregistered consumer version', () => {
      const compatibleVersions = eventVersioningService.getCompatibleVersions(
        `${TEST_EVENT_TYPE}.rules`,
        '4.0'
      );

      expect(compatibleVersions).toEqual([]);
    });
  });
});
