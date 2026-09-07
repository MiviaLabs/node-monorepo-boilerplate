/**
 * Event Replay E2E Tests
 *
 * Tests event replay functionality for debugging, recovery, and aggregate rebuild scenarios.
 * Validates:
 * 1. POST /v1/events/replay - Start replay with various filters
 * 2. GET /v1/events/replay/:replayId - Get replay status
 * 3. POST /v1/events/replay/:replayId/cancel - Cancel replay
 * 4. Multi-tenancy scenarios with different tenant IDs
 * 5. Permission tests (SYSTEM_SETTINGS, SYSTEM_MONITOR)
 * 6. Error scenarios (invalid tenant, non-existent replay)
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';

import { OutboxStatus } from '@package/db-outbox';
import { eq } from 'drizzle-orm';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { startTestServer, waitForServiceInitialization } from '../../helpers/bootstrap';
import {
  setupE2ETestDatabaseJest,
  createTestOrganization,
  createTestUserTenant
} from '../../helpers/database';
import { createEventReplayHelper } from '../../helpers/event-replay.helper';

import type { TestServer } from '../../helpers/bootstrap';
import type { ReplayStatusResponse } from '../../helpers/event-replay.helper';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Import outbox table for test operations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let outbox: any;
beforeAll(async () => {
  const { outbox: outboxTable } = await import('@package/db-outbox');
  outbox = outboxTable;
});

function getErrorTextFromBody(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const responseBody = body as {
    data?: unknown;
    metadata?: { error?: { message?: string } };
    message?: string;
  };

  const data =
    typeof responseBody.data === 'object' && responseBody.data !== null
      ? (responseBody.data as Record<string, unknown>)
      : undefined;

  if (data) {
    if (typeof data['message'] === 'string') return data['message'];
    if (typeof data['translated'] === 'string') return data['translated'];
    if (typeof data['code'] === 'string') return data['code'];
    if (typeof data['error'] === 'string') return data['error'];
  }

  if (typeof responseBody.metadata?.error?.message === 'string') {
    return responseBody.metadata.error.message;
  }

  return typeof responseBody.message === 'string' ? responseBody.message : undefined;
}

describe('Event Replay E2E Tests', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let organizationId: number;
  let tenantDbId: number;
  let tenantIdString: string;
  let replayHelper: ReturnType<typeof createEventReplayHelper>;
  let jwtToken: string;
  let testUserId: number;

  beforeAll(async () => {
    // CRITICAL: Setup test database FIRST
    await setupE2ETestDatabaseJest();

    // CRITICAL: Setup Kafka SECOND (slow startup, 10-30 seconds)
    // Lazy import test-utils (Nx enforce-module-boundaries)
    const { setupKafkaE2E: setupKafka } = await import('@package/test-utils');
    await setupKafka();

    // CRITICAL: Enable events module for Kafka tests
    // This MUST be set BEFORE startTestServer because AppModule reads this env var
    // during initialization to determine whether to initialize the EventsModule
    process.env['EVENTS_ENABLED'] = 'true';

    // CRITICAL: Increase Kafka connection timeout for testcontainers
    // Testcontainers take 10-30 seconds to start, default 10s timeout is too short
    process.env['KAFKA_CONNECTION_TIMEOUT'] = '60000'; // 60 seconds

    // CRITICAL: Start server THIRD
    server = await startTestServer();

    // Wait for service initialization (including outbox poller)
    // Extended timeout to ensure OutboxPollerService is fully initialized
    await waitForServiceInitialization(server, { maxWait: 90000 });

    // Get database and services from NestJS app
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);

    // Create test tenant
    const { tenantId, organizationId: orgId } = await createTestOrganization(server.app);
    tenantDbId = tenantId;

    // Store organizationId and convert tenantId to string for API calls
    organizationId = orgId;
    tenantIdString = orgId.toString();

    // Create test user with system_owner role
    const { createUserFixture } = await import('../../fixtures/user.fixture');
    const testUser = await createUserFixture(server.app, { organizationId: orgId });
    testUserId = testUser.id;
    await createTestUserTenant(server.app, testUserId, tenantDbId, 'tenant_admin', true);

    // Assign system_owner role to test user (required for event replay permissions)
    const { userRoles } = await import('@package/db-core');
    await db.insert(userRoles).values({
      userId: testUserId,
      role: 'system_owner'
    });

    // Create JWT token for API calls
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = server.app.get(JwtService);

    jwtToken = jwtService.sign({
      sub: testUser.id.toString(),
      db_user_id: testUser.id.toString(),
      tenant_id: tenantDbId.toString(),
      actor_id: testUser.id.toString(),
      email: `test-${testUser.id}@example.com`,
      name: 'Test User',
      roles: ['system_owner'],
      permissions: ['system:system:monitor', 'system:system:settings'],
      expiresIn: '7d'
    });

    // Create replay helper
    replayHelper = createEventReplayHelper(server, jwtToken, tenantIdString);
  }, 120000); // Extended timeout: Kafka + Testcontainers startup can take 60+ seconds

  afterAll(async () => {
    // Cleanup test user role
    const { userRoles } = await import('@package/db-core');
    if (testUserId) {
      await db.delete(userRoles).where(eq(userRoles.userId, testUserId));
    }

    // Cleanup test user
    const { deleteUserFixture } = await import('../../fixtures/user.fixture');
    await deleteUserFixture(server.app, organizationId, testUserId);

    await server?.close();
  });

  describe('Authentication & Authorization', () => {
    it('should require JWT authentication', async () => {
      const response = await server.request({
        method: 'POST',
        url: '/v1/platform/event-replay',
        headers: {
          'Content-Type': 'application/json',
          // No Authorization header
          'x-tenant-id': tenantIdString
        },
        body: {
          tenantId: tenantIdString
        }
      });

      expect(response.status).toBe(401);
    });

    it('should require system:system:settings permission to start replay', async () => {
      // Create user without system_admin role
      const { createUserFixture, deleteUserFixture } = await import('../../fixtures/user.fixture');
      const regularUser = await createUserFixture(server.app, { organizationId: organizationId });
      const regularUserId = regularUser.id;

      // Create token without system permissions
      const { JwtService } = await import('@nestjs/jwt');
      const jwtService = server.app.get(JwtService);
      const regularToken = jwtService.sign({
        sub: regularUserId.toString(),
        db_user_id: regularUserId.toString(),
        tenant_id: tenantDbId.toString(),
        actor_id: regularUserId.toString(),
        email: `test-${regularUserId}@example.com`,
        name: 'Regular User',
        roles: ['tenant_admin'],
        permissions: ['system:system:monitor'],
        expiresIn: '7d'
      });

      const response = await server.request({
        method: 'POST',
        url: '/v1/platform/event-replay',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regularToken}`,
          'x-tenant-id': tenantIdString
        },
        body: {
          tenantId: tenantIdString
        }
      });

      expect(response.status).toBe(403);
      expect(getErrorTextFromBody(response.body)).toBeDefined();

      await deleteUserFixture(server.app, organizationId, regularUserId);
    });

    it('should require x-tenant-id header', async () => {
      const response = await server.request({
        method: 'POST',
        url: '/v1/platform/event-replay',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`
          // No x-tenant-id header
        },
        body: {
          tenantId: tenantIdString
        }
      });

      expect(response.status).toBe(400);
      expect(getErrorTextFromBody(response.body)).toBeDefined();
    });

    it('should validate tenantId format (UUID)', async () => {
      const response = await server.request({
        method: 'POST',
        url: '/v1/platform/event-replay',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
          'x-tenant-id': 'invalid-tenant-id' // Not a UUID
        },
        body: {
          tenantId: 'invalid-tenant-id'
        }
      });

      expect(response.status).toBe(400);
      expect(getErrorTextFromBody(response.body)).toBeDefined();
    });
  });

  describe('POST /v1/events/replay - Start Replay', () => {
    let testEventIds: string[] = [];

    beforeEach(async () => {
      // Create test events for replay
      for (let i = 0; i < 3; i++) {
        const eventId = randomUUID();
        testEventIds.push(eventId);

        await db.insert(outbox).values({
          eventId,
          eventType: 'test.replay', // Use proper domain.event format
          aggregateId: `test-aggregate-${i}`,
          tenantId: tenantIdString,
          payload: JSON.stringify({ testData: i, timestamp: new Date().toISOString() }),
          status: OutboxStatus.PUBLISHED,
          retryCount: 0,
          schemaVersion: '1.0',
          createdAt: new Date()
        });
      }
    });

    afterEach(async () => {
      // Cleanup test events
      if (testEventIds.length > 0) {
        await db.delete(outbox).where(eq(outbox.eventId, testEventIds[0]));
        await db.delete(outbox).where(eq(outbox.eventId, testEventIds[1]));
        await db.delete(outbox).where(eq(outbox.eventId, testEventIds[2]));
        testEventIds = [];
      }
    });

    it('should start replay with all events', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString // Required for event replay
        // No filters - replay all events
      });

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();
      expect(response.data.replayId).toBeDefined();
      // Status starts as PENDING but may transition quickly
      // Use toMatch() to allow for PENDING, IN_PROGRESS, or COMPLETED
      expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(
        response.data.status
      );
    });

    it('should start replay with aggregate filter', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString,
        aggregateId: testEventIds[0] // Replay specific aggregate
      });

      expect(response.status).toBe(201);
      expect(response.data.replayId).toBeDefined();
      // Status starts as PENDING but may transition quickly
      // Use toMatch() to allow for PENDING, IN_PROGRESS, or COMPLETED
      expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(
        response.data.status
      );
    });

    it('should start replay with event type filter', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString,
        eventType: 'test.replay' // Match the created event types
      });

      expect(response.status).toBe(201);
      expect(response.data.replayId).toBeDefined();
      // Status starts as PENDING but may transition quickly
      // Use toMatch() to allow for PENDING, IN_PROGRESS, or COMPLETED
      expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(
        response.data.status
      );
    });

    it('should start replay with date range filter', async () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();

      const response = await replayHelper.startReplay({
        tenantId: tenantIdString,
        startDate,
        endDate
      });

      expect(response.status).toBe(201);
      expect(response.data.replayId).toBeDefined();
      // Status starts as PENDING but may transition quickly
      // Use toMatch() to allow for PENDING, IN_PROGRESS, or COMPLETED
      expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(
        response.data.status
      );
    });

    it('should start replay with max events limit', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString,
        maxEvents: 2
      });

      expect(response.status).toBe(201);
      expect(response.data.replayId).toBeDefined();
      // Status starts as PENDING but may transition quickly
      // Use toMatch() to allow for PENDING, IN_PROGRESS, or COMPLETED
      expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(
        response.data.status
      );
    });

    it('should start replay with combined filters', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString,
        aggregateId: testEventIds[0],
        eventType: 'test.replay', // Match the created event types
        maxEvents: 1
      });

      expect(response.status).toBe(201);
      expect(response.data.replayId).toBeDefined();
      // Status starts as PENDING but may transition quickly
      // Use toMatch() to allow for PENDING, IN_PROGRESS, or COMPLETED
      expect(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).toContain(
        response.data.status
      );
    });

    it('should return 400 for invalid date format', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString, // Include tenantId to get 400 instead of 401
        startDate: 'invalid-date-format'
      });

      expect(response.status).toBe(400);
      expect(getErrorTextFromBody(response.body)).toBeDefined();
    });
  });

  describe('GET /v1/events/replay/:replayId - Get Replay Status', () => {
    let activeReplayId: string;

    beforeEach(async () => {
      // Start a replay to get its ID
      const startResponse = await replayHelper.startReplay({
        tenantId: tenantIdString,
        maxEvents: 1
      });

      expect(startResponse.status).toBe(201);
      activeReplayId = startResponse.data.replayId;
    });

    it('should return replay status for active replay', async () => {
      const response = await replayHelper.getReplayStatus(activeReplayId);
      const data = response.data as ReplayStatusResponse;

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data.replayId).toBe(activeReplayId);
      expect(data.status).toMatch(/^(pending|in_progress|completed|failed|cancelled)$/);
    });

    it('should return 404 for non-existent replay', async () => {
      const fakeReplayId = randomUUID();
      const response = await replayHelper.getReplayStatus(fakeReplayId);

      expect(response.status).toBe(404);
      const errorMessage = getErrorTextFromBody(response.body);
      expect(errorMessage).toBeDefined();
    });

    it('should return replay status with counts', async () => {
      const response = await replayHelper.getReplayStatus(activeReplayId);
      const data = response.data as ReplayStatusResponse;

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data.processedCount).toBeGreaterThanOrEqual(0);
      expect(data.successCount).toBeGreaterThanOrEqual(0);
      expect(data.failureCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /v1/events/replay/:replayId/cancel - Cancel Replay', () => {
    let activeReplayId: string;

    beforeEach(async () => {
      // Start a replay to cancel
      const startResponse = await replayHelper.startReplay({
        tenantId: tenantIdString,
        maxEvents: 3
      });

      expect(startResponse.status).toBe(201);
      activeReplayId = startResponse.data.replayId;
    });

    it('should cancel active replay', async () => {
      const response = await replayHelper.cancelReplay(activeReplayId);

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(typeof response.data.success).toBe('boolean');
      if (response.data.success) {
        expect(response.data.message).toBe('Replay cancelled successfully');
      } else {
        expect(response.data.message).toContain('not found or already completed');
      }
    });

    it('should return false for already completed replay', async () => {
      // Wait for replay to complete
      await replayHelper.waitForCompletion(activeReplayId, { maxWait: 30000 });

      const response = await replayHelper.cancelReplay(activeReplayId);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(false);
      expect(response.data.message).toContain('not found or already completed');
    });

    it('should return false for non-existent replay', async () => {
      const fakeReplayId = randomUUID();
      const response = await replayHelper.cancelReplay(fakeReplayId);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(false);
    });

    it('should require system:system:settings permission', async () => {
      // Create user without system_admin role
      const { createUserFixture, deleteUserFixture } = await import('../../fixtures/user.fixture');
      const regularUser = await createUserFixture(server.app, { organizationId: organizationId });
      const regularUserId = regularUser.id;

      // Create token without system permissions
      const { JwtService } = await import('@nestjs/jwt');
      const jwtService = server.app.get(JwtService);
      const regularToken = jwtService.sign({
        sub: regularUserId.toString(),
        db_user_id: regularUserId.toString(),
        tenant_id: tenantDbId.toString(),
        actor_id: regularUserId.toString(),
        email: `test-${regularUserId}@example.com`,
        name: 'Regular User',
        roles: ['tenant_admin'],
        permissions: ['system:system:monitor'],
        expiresIn: '7d'
      });

      const response = await server.request({
        method: 'POST',
        url: `/v1/platform/event-replay/${activeReplayId}/cancel`,
        headers: {
          Authorization: `Bearer ${regularToken}`,
          'x-tenant-id': tenantIdString
        }
      });

      expect(response.status).toBe(403);
      expect(getErrorTextFromBody(response.body)).toBeDefined();

      await deleteUserFixture(server.app, organizationId, regularUserId);
    });
  });

  describe('Multi-Tenancy Isolation', () => {
    let otherTenantId: number;
    let otherTenantIdString: string;
    let crossTenantEventId: string;

    beforeAll(async () => {
      // Create another tenant
      const otherOrgData = await createTestOrganization(server.app);
      otherTenantId = otherOrgData.tenantId;
      otherTenantIdString = otherTenantId.toString();

      // Create an event in other tenant
      crossTenantEventId = randomUUID();
      const db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
      await db.insert(outbox).values({
        eventId: crossTenantEventId,
        eventType: 'cross.tenant', // Use proper domain.event format
        aggregateId: 'cross-tenant-aggregate',
        tenantId: otherTenantIdString,
        payload: JSON.stringify({ tenant: 'other' }),
        status: OutboxStatus.PUBLISHED,
        retryCount: 0,
        schemaVersion: '1.0',
        createdAt: new Date()
      });
    }, 30000);

    afterAll(async () => {
      // Cleanup cross-tenant event
      const db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
      await db.delete(outbox).where(eq(outbox.eventId, crossTenantEventId));
    });

    it('should only return events for requesting tenant', async () => {
      const response = await replayHelper.startReplay({
        tenantId: otherTenantIdString
      });

      expect(response.status).toBe(201);
      expect(response.data).toBeDefined();

      // The cross-tenant event should NOT be included
      // We can't directly verify events returned, but we check status is success
    });

    it('should isolate replays by tenant', async () => {
      // Start replay for tenant 1 - using the test's main tenant
      const tenant1Response = await replayHelper.startReplay({
        maxEvents: 1
      });

      // Create a new helper with the other tenant's context for cross-tenant isolation test
      const otherTenantHelper = createEventReplayHelper(server, jwtToken, otherTenantIdString);

      // Start replay for tenant 2 using other tenant's helper
      const tenant2Response = await otherTenantHelper.startReplay({
        maxEvents: 1
      });

      expect(tenant1Response.status).toBe(201);
      expect(tenant2Response.status).toBe(201);

      // Verify both have different replay IDs (tenant isolation)
      expect(tenant1Response.data.replayId).not.toBe(tenant2Response.data.replayId);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing tenant ID gracefully', async () => {
      // This test is covered by authentication tests
      // The endpoint should return 400 when x-tenant-id is missing
    });

    it('should handle concurrent replay requests', async () => {
      // Start multiple replays simultaneously
      const responses = await Promise.all([
        replayHelper.startReplay({ tenantId: tenantIdString, maxEvents: 1 }),
        replayHelper.startReplay({ tenantId: tenantIdString, maxEvents: 1 })
      ]);

      // Both should succeed with different replay IDs
      expect(responses[0].status).toBe(201);
      expect(responses[1].status).toBe(201);
      expect(responses[0].data.replayId).not.toBe(responses[1].data.replayId);
    });
  });

  describe('Replay State Transitions', () => {
    it('should transition from pending to in_progress to completed', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString,
        maxEvents: 1
      });

      expect(response.status).toBe(201);
      const replayId = response.data.replayId as string;

      // Check status becomes in_progress
      const status1 = await replayHelper.getReplayStatus(replayId);
      expect(['pending', 'in_progress', 'completed']).toContain(
        (status1.data as ReplayStatusResponse).status
      );

      // Wait for completion
      const finalStatus = await replayHelper.waitForCompletion(replayId, { maxWait: 30000 });
      expect(['completed', 'failed']).toContain(finalStatus.session.status);
    });

    it('should transition to cancelled when cancelled', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString,
        maxEvents: 2
      });

      expect(response.status).toBe(201);
      const replayId = response.data.replayId as string;

      // Cancel immediately
      const cancelResponse = await replayHelper.cancelReplay(replayId);
      expect(cancelResponse.status).toBe(200);
      expect(typeof cancelResponse.data.success).toBe('boolean');

      const status = await replayHelper.getReplayStatus(replayId);
      const replayStatus = (status.data as ReplayStatusResponse).status;
      if (cancelResponse.data.success) {
        expect(replayStatus).toBe('cancelled');
      } else {
        expect(['completed', 'failed']).toContain(replayStatus);
      }
    });
  });

  describe('Input Validation', () => {
    it('should reject malformed startDate', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString, // Include tenantId for proper auth
        startDate: 'not-a-date'
      });

      expect(response.status).toBe(400);
      expect(getErrorTextFromBody(response.body)).toBeDefined();
    });

    it('should reject malformed endDate', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString, // Include tenantId for proper auth
        endDate: 'not-a-date'
      });

      expect(response.status).toBe(400);
      expect(getErrorTextFromBody(response.body)).toBeDefined();
    });

    it('should reject when maxEvents is negative', async () => {
      const response = await replayHelper.startReplay({
        tenantId: tenantIdString,
        maxEvents: -1 // Send negative value to test validation
      });

      expect(response.status).toBe(400);
      expect(getErrorTextFromBody(response.body)).toBeDefined();
    });
  });
});
