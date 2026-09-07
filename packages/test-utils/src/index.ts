/**
 * @package/test-utils - E2E Testing Utilities for Node Monorepo Boilerplate
 *
 * This package provides comprehensive testing utilities for E2E tests using
 * Testcontainers for PostgreSQL, Redis, and Kafka. It handles container lifecycle,
 * database migrations, and fixture management.
 *
 * @see @package/db-core for database schema being tested
 * @see @package/db-outbox for event store database testing
 * @see @package/redis for Redis cache testing
 * @see @package/queues for BullMQ queue testing
 * @see @package/events for event handling tests
 * @see @package/auth for authentication testing
 *
 * ## Critical Setup Order
 *
 * When setting up E2E tests, services MUST be initialized in this order:
 *
 * 1. **Database first** - Initialize the database container and run migrations
 * 2. **Kafka (if needed)** - Start Kafka container after database is ready
 * 3. **Server** - Start the NestJS application server
 * 4. **Wait for services** - Ensure all services are ready before running tests
 *
 * ## Standard Timeouts
 *
 * - **Standard E2E tests**: 60000ms (60 seconds)
 * - **Tests with Kafka**: 120000ms (120 seconds) - Kafka startup is slow (10-30s)
 * - **Database operations**: 30000ms connection timeout (increased for CI)
 *
 * ## Lazy Import Pattern for Nx Module Boundaries
 *
 * To comply with Nx module boundary rules, use lazy imports for test-utils:
 *
 * ```ts
 * // In test files, import lazily to avoid module boundary violations
 * const { setupTestDatabaseJest, getTestDb } = await import('@package/test-utils');
 * ```
 *
 * ## Standard E2E Test Structure
 *
 * @example Basic E2E test with database only (60000ms timeout)
 * ```ts
 * import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
 *
 * describe('My E2E Tests', () => {
 *   let server: TestServer;
 *   let testDb: ITestDatabase;
 *
 *   beforeAll(async () => {
 *     // Use lazy import for Nx module boundary compliance
 *     const { setupTestDatabaseJest, getTestDb } = await import('@package/test-utils');
 *
 *     // 1. Database first - runs migrations automatically
 *     await setupTestDatabaseJest();
 *     testDb = getTestDb();
 *
 *     // 2. Start server after database is ready
 *     server = await startTestServer();
 *   }, 60000);
 *
 *   afterEach(async () => {
 *     // Clean test data between tests for isolation
 *     const { cleanupTestDatabase } = await import('@package/test-utils');
 *     await cleanupTestDatabase();
 *   });
 *
 *   afterAll(async () => {
 *     // 1. Close server first
 *     await server?.close();
 *
 *     // 2. Then teardown database
 *     const { teardownTestDatabase } = await import('@package/test-utils');
 *     await teardownTestDatabase();
 *   }, 60000);
 *
 *   it('should test something', async () => {
 *     // Test implementation
 *   });
 * });
 * ```
 *
 * @example E2E test with Kafka (120000ms timeout)
 * ```ts
 * describe('Kafka E2E Tests', () => {
 *   beforeAll(async () => {
 *     const { setupTestDatabaseJest, setupKafkaE2E, getTestDb } = await import('@package/test-utils');
 *
 *     // 1. Database first
 *     await setupTestDatabaseJest();
 *
 *     // 2. Kafka second (slow startup: 10-30 seconds)
 *     await setupKafkaE2E();
 *
 *     // 3. Server last
 *     server = await startTestServer();
 *   }, 120000); // Extended timeout for Kafka
 *
 *   afterAll(async () => {
 *     await server?.close();
 *
 *     const { teardownKafkaE2E, teardownTestDatabase } = await import('@package/test-utils');
 *
 *     // Teardown in reverse order
 *     await teardownKafkaE2E();
 *     await teardownTestDatabase();
 *   }, 120000);
 * });
 * ```
 *
 * @example Multi-tenant isolation testing
 * ```ts
 * describe('Multi-Tenant Isolation', () => {
 *   let server: TestServer;
 *   let org1: { tenantId: number; organizationId: number };
 *   let org2: { tenantId: number; organizationId: number };
 *
 *   beforeAll(async () => {
 *     const { setupTestDatabaseJest } = await import('@package/test-utils');
 *     await setupTestDatabaseJest();
 *     server = await startTestServer();
 *
 *     // Create multiple organizations for isolation testing
 *     org1 = await createTestOrganization(server.app, 'Organization 1');
 *     org2 = await createTestOrganization(server.app, 'Organization 2');
 *   }, 60000);
 *
 *   afterAll(async () => {
 *     // Clean up organizations in reverse order
 *     await cleanupOrganization(server.app, org2.organizationId);
 *     await cleanupOrganization(server.app, org1.organizationId);
 *     await server?.close();
 *
 *     const { teardownTestDatabase } = await import('@package/test-utils');
 *     await teardownTestDatabase();
 *   }, 60000);
 *
 *   it('should isolate data between tenants', async () => {
 *     // Create user in org1
 *     const user = await createUserFixture(server.app, { organizationId: org1.organizationId });
 *
 *     // Query with org2's tenant ID - should not find user
 *     const response = await server.request({
 *       method: 'GET',
 *       url: `/v1/users/${user.id}`,
 *       headers: { 'x-tenant-id': org2.tenantId.toString() }
 *     });
 *
 *     expect(response.status).toBe(404);
 *   });
 * });
 * ```
 *
 * @packageDocumentation
 */

// Containers
export * from './containers/postgres.container';
export * from './containers/redis.container';
export * from './containers/kafka.container';

// Utils
export * from './utils/database';

// Fixtures
export * from './fixtures/data-helper';
export * from './fixtures/user.fixture';

// Helpers
export * from './helpers/setup';
export * from './helpers/kafka';
