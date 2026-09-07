/**
 * User Events E2E Tests
 *
 * Tests the complete event flow from user creation to Kafka event consumption.
 * Validates:
 * 1. User creation via API
 * 2. Outbox event publishing
 * 3. Kafka event delivery
 * 4. Event consumer processing
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { JwtService } from '@nestjs/jwt';

import {
  createUserWithTenantFixture,
  deleteUserFixture,
  UserRole
} from '../../fixtures/user.fixture';
import { startTestServer, waitForServiceInitialization } from '../../helpers/bootstrap';
import { setupE2ETestDatabaseJest, createTestOrganization } from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';

describe('User Events E2E Tests', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let tenantId: number;
  let organizationId: number;
  let testUserId: number;
  let kafkaSetupCompleted = false;

  function hasSharedKafkaBroker(): boolean {
    const connectionFile = resolve(process.cwd(), '.test-db-connection.json');
    if (!existsSync(connectionFile)) {
      return false;
    }

    try {
      const payload = JSON.parse(readFileSync(connectionFile, 'utf-8')) as {
        kafka?: { broker?: string; brokers?: string };
      };
      return Boolean(payload.kafka?.brokers?.trim() || payload.kafka?.broker?.trim());
    } catch {
      return false;
    }
  }

  beforeAll(async () => {
    // CRITICAL: Setup test database FIRST
    await setupE2ETestDatabaseJest();

    // Prefer the shared Kafka broker from the E2E daemon when available.
    // Fall back to an isolated Testcontainer only when the shared broker
    // metadata is unavailable so this spec still works outside the full shard.
    if (!hasSharedKafkaBroker()) {
      const { setupKafkaE2E: setupKafka } = await import('@package/test-utils');
      await setupKafka();
      kafkaSetupCompleted = true;
    }

    // CRITICAL: Enable events module for Kafka tests
    // This MUST be set BEFORE startTestServer because AppModule reads this env var
    // during initialization to determine whether to initialize the EventsModule
    process.env['EVENTS_ENABLED'] = 'true';
    process.env['KAFKA_CONNECTION_TIMEOUT'] = '60000';

    // CRITICAL: Start server THIRD
    server = await startTestServer();

    // CRITICAL: Wait for all services to be initialized BEFORE running tests
    // This ensures the outbox poller is ready to process events
    await waitForServiceInitialization(server, { maxWait: 45000 });

    // Get JwtService for generating tokens
    jwtService = server.app.get<JwtService>(JwtService);

    // Create test tenant
    const orgData = await createTestOrganization(server.app);
    tenantId = orgData.tenantId;
    organizationId = orgData.organizationId;

    // Create test user for authentication
    const user = await createUserWithTenantFixture(server.app, {
      tenantId,
      organizationId,
      role: UserRole.ADMIN,
      isDefault: true
    });
    testUserId = user.id;
  }, 120000); // Extended timeout: Kafka + Testcontainers startup can take 60+ seconds

  afterAll(async () => {
    if (testUserId) {
      try {
        await deleteUserFixture(server.app, organizationId, testUserId);
      } catch {
        // Ignore if already deleted
      }
    }
    await server?.close();
    if (kafkaSetupCompleted) {
      const { teardownKafkaE2E: teardownKafka } = await import('@package/test-utils');
      await teardownKafka();
    }
  }, 30000); // Extended timeout for Kafka teardown

  describe('User Created Event Flow', () => {
    let createdUserId = 0;
    let freshToken: string;

    beforeEach(async () => {
      // Generate a fresh token before each test to avoid expiration
      // Set expiration to 24 hours to ensure it doesn't expire during test execution
      freshToken = jwtService.sign(
        {
          sub: testUserId.toString(),
          db_user_id: testUserId.toString(),
          tenant_id: String(organizationId),
          actor_id: testUserId.toString(),
          email: `test-user-${testUserId}@example.com`,
          name: 'Test User',
          roles: ['tenant_admin'],
          permissions: ['*']
        },
        { expiresIn: '24h' }
      );
    });

    afterEach(async () => {
      if (createdUserId) {
        try {
          await deleteUserFixture(server.app, organizationId, createdUserId);
          createdUserId = 0;
        } catch {
          // Ignore if already deleted
        }
      }
    });

    it('should consume user.created event after user creation', async () => {
      const createResponse = await server.request({
        method: 'POST',
        url: '/v1/people',
        headers: {
          'x-tenant-id': String(organizationId),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: {
          isActive: true,
          isVerified: false
        }
      });

      expect(createResponse.status).toBe(201);
    }, 15000); // Extended timeout for Kafka startup
  });

  describe('Outbox Health Monitoring', () => {
    it('should return outbox health status', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/ops/health'
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.details).toBeDefined();

      // Check that outbox health is included
      const { outbox } = response.body.data.details;
      expect(outbox).toBeDefined();
      expect(outbox.status).toBeDefined();
      expect(['up', 'degraded', 'down']).toContain(outbox.status);

      // Verify outbox details
      expect(outbox.details).toBeDefined();
      expect(outbox.details.pendingCount).toBeDefined();
      expect(outbox.details.failedCount).toBeDefined();
      expect(outbox.details.isProcessing).toBeDefined();
      expect(outbox.details.workerId).toBeDefined();
    });

    it('should return healthy status when outbox is empty', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/ops/health'
      });

      expect(response.status).toBe(200);
      const { outbox } = response.body.data.details;

      // Outbox should be healthy (0 failed events, low pending count)
      expect(outbox.status).toBe('up');
      expect(outbox.details.failedCount).toBe(0);
      expect(outbox.details.pendingCount).toBeLessThan(100);
    });
  });

  describe('Multiple User Events', () => {
    let createdUserIds: number[] = [];
    let freshToken: string;

    beforeEach(async () => {
      // Generate a fresh token before each test to avoid expiration
      // Set expiration to 24 hours to ensure it doesn't expire during test execution
      freshToken = jwtService.sign(
        {
          sub: testUserId.toString(),
          db_user_id: testUserId.toString(),
          tenant_id: String(organizationId),
          actor_id: testUserId.toString(),
          email: `test-user-${testUserId}@example.com`,
          name: 'Test User',
          roles: ['tenant_admin'],
          permissions: ['*']
        },
        { expiresIn: '24h' }
      );
    });

    afterEach(async () => {
      for (const id of createdUserIds) {
        try {
          await deleteUserFixture(server.app, organizationId, id);
        } catch {
          // Ignore errors
        }
      }
      createdUserIds = [];
    });

    it('should process multiple user.created events in sequence', async () => {
      for (let i = 0; i < 3; i++) {
        const createResponse = await server.request({
          method: 'POST',
          url: '/v1/people',
          headers: {
            'x-tenant-id': String(organizationId),
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`
          },
          body: {
            isActive: true
          }
        });

        expect(createResponse.status).toBe(201);
      }
    }, 15000);
  });
});
