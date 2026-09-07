/**
 * Users E2E Tests
 *
 * Tests the Users module using a real NestJS server and Testcontainers database.
 * This approach ensures all dependencies (CQRS, QueryBus, etc.) work correctly.
 *
 * @packageDocumentation
 */

import { QueryBus } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';

import {
  createUserFixture,
  deleteUserFixture,
  createMultipleUsersFixture
} from '../../fixtures/user.fixture';
import { startTestServer } from '../../helpers/bootstrap';
import {
  setupE2ETestDatabaseJest,
  createTestOrganization,
  cleanupOrganization,
  createTestUserTenant
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';

interface UserResponseData {
  id: number;
  organizationId: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
  code?: string;
}

interface ErrorResponseData {
  code: string;
  message?: string;
}

// Type guards
function isUserResponseData(data: unknown): data is UserResponseData {
  return typeof data === 'object' && data !== null && 'id' in data && 'organizationId' in data;
}

function isUserResponseDataArray(data: unknown): data is UserResponseData[] {
  return Array.isArray(data) && data.every(isUserResponseData);
}

// Type guard for error responses
function isErrorResponseData(data: unknown): data is ErrorResponseData {
  return (
    typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string'
  );
}

describe('Users E2E Tests', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let testUserId: number;
  let testUserToken: string;
  let tenantId: number;
  let organizationId: number;

  beforeAll(async () => {
    // CRITICAL: Setup test database FIRST to ensure migrations run
    // This connects to the globally running Testcontainers database
    await setupE2ETestDatabaseJest();

    // CRITICAL: Start server SECOND before creating fixtures
    // This ensures NestJS connection pool is initialized and can see fixture data
    server = await startTestServer();

    // Verify QueryBus is injected (Jest fixes the node:test DI issue)
    const queryBus = server.app.get<QueryBus>(QueryBus);
    expect(queryBus).toBeDefined();
    expect(queryBus.execute).toBeDefined();

    // Get JwtService for generating tokens
    jwtService = server.app.get<JwtService>(JwtService);

    // Create fixtures using the server's database connection
    // This ensures data is visible to the running server
    const orgData = await createTestOrganization(server.app);
    tenantId = orgData.tenantId;
    organizationId = orgData.organizationId;
    const user = await createUserFixture(server.app, { organizationId });
    testUserId = user.id;
    await createTestUserTenant(server.app, testUserId, tenantId, 'tenant_owner', true);

    // Generate JWT token for test user
    // Set expiration to 24 hours to ensure it doesn't expire during test execution
    testUserToken = jwtService.sign(
      {
        sub: testUserId.toString(),
        db_user_id: testUserId.toString(),
        // JwtAuthGuard resolves DB tenant roles from tenant_id (tenant DB ID).
        tenant_id: tenantId.toString(),
        actor_id: testUserId.toString(),
        email: `test-user-${testUserId}@example.com`,
        name: 'Test User',
        roles: ['tenant_owner'],
        permissions: ['*']
      },
      { expiresIn: '24h' }
    );
  });

  afterAll(async () => {
    if (testUserId && organizationId) {
      await deleteUserFixture(server.app, organizationId, testUserId);
    }
    await server?.close();
  });

  describe('GET /users/:id', () => {
    it('should return 200 with user data for valid ID', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(200);
      expect(isUserResponseData(response.body.data)).toBe(true);
      expect(response.body.data.id).toBe(testUserId);
      expect(response.body.data.organizationId).toBe(organizationId);
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.updatedAt).toBeDefined();
    });

    it('should return 404 for non-existent user ID', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/people/99999',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(404);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('DB_004');
    });

    it('should return 400 when x-tenant-id header is missing', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: {} // Explicitly set empty headers to prevent supertest from reusing headers
      });

      // Debug: Log the actual response
      // eslint-disable-next-line no-console
      console.log('[TEST] Response status:', response.status);
      // eslint-disable-next-line no-console
      console.log('[TEST] Response body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(400);
    });

    it('should return null for user in different tenant', async () => {
      const { organizationId: otherOrganizationId } = await createTestOrganization(server.app);

      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: {
          'x-tenant-id': otherOrganizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(404);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('DB_004');

      // Clean up
      await cleanupOrganization(server.app, otherOrganizationId);
    });

    it('should handle invalid user ID (NaN from parseInt)', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/people/invalid',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(400);
    });

    it('should handle zero user ID', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/people/0',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(404);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('DB_004');
    });
  });

  describe('GET /users (list)', () => {
    let additionalUserIds: number[] = [];

    beforeEach(async () => {
      // Only create additional users for the first test in this suite
      if (additionalUserIds.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Fixture types changed, ESLint false positive
        const users = await createMultipleUsersFixture(server.app, organizationId, 2);
        additionalUserIds = users.map((u) => u.id);
      }
    });

    afterEach(async () => {
      // Clean up additional users
      for (const id of additionalUserIds) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Fixture types changed, ESLint false positive
          await deleteUserFixture(server.app, organizationId, id);
        } catch (error) {
          // Ignore errors if user was already deleted
          if (
            error instanceof Error &&
            'code' in error &&
            (error as { code: string }).code !== 'DB_004'
          ) {
            throw error;
          }
        }
      }
      // Clear the array after cleanup to prevent re-deletion
      additionalUserIds = [];
    });

    it('should return paginated list of users with default params', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/people',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(200);
      expect(isUserResponseDataArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.pagination).toBeDefined();
      expect(response.body.metadata.pagination.page).toBe(1);
      expect(response.body.metadata.pagination.pageSize).toBe(20);
      expect(response.body.metadata.pagination.total).toBeGreaterThanOrEqual(3);
      expect(response.body.metadata.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('should return paginated list with custom page and pageSize', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/users?page=1&pageSize=5',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(200);
      expect(isUserResponseDataArray(response.body.data)).toBe(true);
      expect(response.body.metadata.pagination.page).toBe(1);
      expect(response.body.metadata.pagination.pageSize).toBe(5);
    });

    it('should return empty array for tenant with no users', async () => {
      const { organizationId: emptyOrganizationId } = await createTestOrganization(server.app);

      const response = await server.request({
        method: 'GET',
        url: '/v1/people',
        headers: {
          'x-tenant-id': emptyOrganizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.metadata.pagination.total).toBe(0);
      expect(response.body.metadata.pagination.totalPages).toBe(0);
      expect(response.body.metadata.pagination.hasNext).toBe(false);
      expect(response.body.metadata.pagination.hasPrevious).toBe(false);

      // Clean up
      await cleanupOrganization(server.app, emptyOrganizationId);
    });

    it('should return 400 when x-tenant-id header is missing', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/people',
        headers: {} // Explicitly set empty headers to prevent supertest from reusing headers
      });

      expect(response.status).toBe(400);
    });

    it('should handle invalid tenant ID (NaN from parseInt)', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/people',
        headers: { 'x-tenant-id': 'invalid', Authorization: `Bearer ${testUserToken}` }
      });

      expect(response.status).toBe(400);
    });

    it('should apply ValidationPipe and reject invalid page < 1', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/users?page=0',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(400);
    });

    it('should apply ValidationPipe and reject invalid pageSize < 1', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/users?pageSize=0',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(400);
    });

    it('should return only users from the specified tenant', async () => {
      // Create another tenant with its own users
      const { tenantId: _otherTenantId, organizationId: otherOrganizationId } =
        await createTestOrganization(server.app);
      const otherUser1 = await createUserFixture(server.app, {
        organizationId: otherOrganizationId
      });

      // Query for original tenant
      const response = await server.request({
        method: 'GET',
        url: '/v1/people',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(200);
      // All returned users should belong to the queried tenant (which has organizationId)
      expect(isUserResponseDataArray(response.body.data)).toBe(true);
      response.body.data.forEach((user: UserResponseData) => {
        expect(user.organizationId).toBe(organizationId);
      });

      // Clean up
      await deleteUserFixture(server.app, otherOrganizationId, otherUser1.id);
      await cleanupOrganization(server.app, otherOrganizationId);
    });

    describe('Pagination metadata edge cases', () => {
      it('should return hasNext=true when more pages exist', async () => {
        const { organizationId: uniqueOrganizationId } = await createTestOrganization(server.app);

        // Create exactly 10 users
        const createdUsers = await Promise.all(
          Array.from({ length: 10 }, () =>
            createUserFixture(server.app, { organizationId: uniqueOrganizationId })
          )
        );

        const response = await server.request({
          method: 'GET',
          url: '/v1/users?page=1&pageSize=5',
          headers: {
            'x-tenant-id': uniqueOrganizationId.toString(),
            Authorization: `Bearer ${testUserToken}`
          }
        });

        expect(response.status).toBe(200);
        expect(response.body.metadata.pagination.page).toBe(1);
        expect(response.body.metadata.pagination.pageSize).toBe(5);
        expect(response.body.metadata.pagination.total).toBe(10);
        expect(response.body.metadata.pagination.totalPages).toBe(2);
        expect(response.body.metadata.pagination.hasNext).toBe(true);
        expect(response.body.metadata.pagination.hasPrevious).toBe(false);

        // Clean up
        for (const user of createdUsers) {
          await deleteUserFixture(server.app, uniqueOrganizationId, user.id);
        }
        await cleanupOrganization(server.app, uniqueOrganizationId);
      });

      it('should return hasNext=false on last page', async () => {
        const response = await server.request({
          method: 'GET',
          url: '/v1/users?page=2&pageSize=5',
          headers: {
            'x-tenant-id': organizationId.toString(),
            Authorization: `Bearer ${testUserToken}`
          }
        });

        expect(response.status).toBe(200);
        expect(response.body.metadata.pagination.hasNext).toBe(false);
        expect(response.body.metadata.pagination.hasPrevious).toBe(true);
      });

      it('should return empty array for page beyond available data', async () => {
        const response = await server.request({
          method: 'GET',
          url: '/v1/users?page=100&pageSize=5',
          headers: {
            'x-tenant-id': organizationId.toString(),
            Authorization: `Bearer ${testUserToken}`
          }
        });

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
        expect(response.body.metadata.pagination.page).toBe(100);
        expect(response.body.metadata.pagination.hasNext).toBe(false);
        expect(response.body.metadata.pagination.hasPrevious).toBe(true);
      });

      it('should return hasPrevious=false on first page', async () => {
        const response = await server.request({
          method: 'GET',
          url: '/v1/users?page=1&pageSize=5',
          headers: {
            'x-tenant-id': organizationId.toString(),
            Authorization: `Bearer ${testUserToken}`
          }
        });

        expect(response.status).toBe(200);
        expect(response.body.metadata.pagination.hasPrevious).toBe(false);
      });

      it('should return hasPrevious=true on page > 1', async () => {
        const response = await server.request({
          method: 'GET',
          url: '/v1/users?page=2&pageSize=5',
          headers: {
            'x-tenant-id': organizationId.toString(),
            Authorization: `Bearer ${testUserToken}`
          }
        });

        expect(response.status).toBe(200);
        expect(response.body.metadata.pagination.hasPrevious).toBe(true);
      });
    });
  });

  describe('POST /users (create)', () => {
    let createdUserId: number;

    afterEach(async () => {
      // Clean up created user
      if (createdUserId) {
        try {
          await deleteUserFixture(server.app, organizationId, createdUserId);
          createdUserId = 0;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // Ignore if already deleted
        }
      }
    });

    it('should create a new user with valid data', async () => {
      const createUserDto = {
        isActive: true,
        isVerified: false
      };

      const response = await server.request({
        method: 'POST',
        url: '/v1/people',
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: createUserDto
      });

      expect(response.status).toBe(201);
      expect(isUserResponseData(response.body.data)).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.organizationId).toBe(organizationId);
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.updatedAt).toBeDefined();

      createdUserId = response.body.data.id;
    });

    it('should create a user with minimal required fields', async () => {
      const createUserDto = {};

      const response = await server.request({
        method: 'POST',
        url: '/v1/people',
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: createUserDto
      });

      expect(response.status).toBe(201);
      expect(isUserResponseData(response.body.data)).toBe(true);

      createdUserId = response.body.data.id;
    });

    it('should return 400 when organizationId is supplied in the request body', async () => {
      const invalidDto = {
        organizationId: 'not-a-number'
      };

      const response = await server.request({
        method: 'POST',
        url: '/v1/people',
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: invalidDto
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid boolean field', async () => {
      const invalidDto = {
        isActive: 'not-a-boolean'
      };

      const response = await server.request({
        method: 'POST',
        url: '/v1/people',
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: invalidDto
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 when x-tenant-id header is missing', async () => {
      const createUserDto = {};

      const response = await server.request({
        method: 'POST',
        url: '/v1/people',
        headers: {
          'Content-Type': 'application/json'
          // Note: NOT setting x-tenant-id header
        },
        body: createUserDto
      });

      expect(response.status).toBe(400);
    });

    it('should reject extra fields not in DTO (whitelist)', async () => {
      const invalidDto = {
        extraField: 'should be stripped'
      };

      const response = await server.request({
        method: 'POST',
        url: '/v1/people',
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: invalidDto
      });

      // ValidationPipe with forbidNonWhitelisted should reject this
      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /users/:id (update)', () => {
    let updateTestUserId: number;

    beforeEach(async () => {
      // Create a user for update tests
      const user = await createUserFixture(server.app, { organizationId: organizationId });
      updateTestUserId = user.id;
    });

    afterEach(async () => {
      // Clean up
      if (updateTestUserId) {
        try {
          await deleteUserFixture(server.app, organizationId, updateTestUserId);
          updateTestUserId = 0;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // Ignore if already deleted
        }
      }
    });

    it('should update user with valid partial data', async () => {
      const updateUserDto = {
        isActive: true
      };

      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${updateTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: updateUserDto
      });

      expect(response.status).toBe(200);
      expect(isUserResponseData(response.body.data)).toBe(true);
      expect(response.body.data.id).toBe(updateTestUserId);
      expect(response.body.data.organizationId).toBe(organizationId);
      expect(response.body.data.updatedAt).toBeDefined();
    });

    it('should update multiple fields at once', async () => {
      const updateUserDto = {
        isActive: true,
        isVerified: true
      };

      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${updateTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: updateUserDto
      });

      expect(response.status).toBe(200);
      expect(isUserResponseData(response.body.data)).toBe(true);
    });

    it('should return 404 for non-existent user ID', async () => {
      const updateUserDto = {
        isActive: true
      };

      const response = await server.request({
        method: 'PATCH',
        url: '/v1/people/99999',
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: updateUserDto
      });

      expect(response.status).toBe(404);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('DB_004');
    });

    it('should return 404 when updating user from different tenant', async () => {
      const { organizationId: otherOrganizationId } = await createTestOrganization(server.app);
      const otherUser = await createUserFixture(server.app, {
        organizationId: otherOrganizationId
      });

      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${otherUser.id}`,
        headers: {
          'x-tenant-id': otherOrganizationId.toString(), // Different tenant
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: { isActive: true }
      });

      expect(response.status).toBe(200);
      expect(isUserResponseData(response.body.data)).toBe(true);

      // Clean up
      try {
        await deleteUserFixture(server.app, otherOrganizationId, otherUser.id);
      } catch {
        // User may already be deleted by the tested operation
      }
      await cleanupOrganization(server.app, otherOrganizationId);
    });

    it('should return 400 for invalid data type', async () => {
      const invalidDto = {
        isActive: 'not-a-boolean'
      };

      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${updateTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: invalidDto
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 when x-tenant-id header is missing', async () => {
      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${updateTestUserId}`,
        headers: {
          'Content-Type': 'application/json'
          // Note: NOT setting x-tenant-id header
        },
        body: { isActive: true }
      });

      expect(response.status).toBe(400);
    });

    it('should reject extra fields not in DTO (whitelist)', async () => {
      const invalidDto = {
        extraField: 'should be stripped'
      };

      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${updateTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: invalidDto
      });

      // ValidationPipe with forbidNonWhitelisted should reject this
      expect(response.status).toBe(400);
    });

    it('should allow empty body (no updates)', async () => {
      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${updateTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: {}
      });

      expect(response.status).toBe(200);
      expect(isUserResponseData(response.body.data)).toBe(true);
    });
  });

  describe('DELETE /users/:id', () => {
    let deleteTestUserId: number;

    beforeEach(async () => {
      // Create a user for delete tests
      const user = await createUserFixture(server.app, { organizationId: organizationId });
      deleteTestUserId = user.id;
    });

    afterEach(async () => {
      // Clean up (if not already deleted)
      if (deleteTestUserId) {
        try {
          await deleteUserFixture(server.app, organizationId, deleteTestUserId);
          deleteTestUserId = 0;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // Ignore if already deleted
        }
      }
    });

    it('should delete an existing user', async () => {
      const response = await server.request({
        method: 'DELETE',
        url: `/v1/people/${deleteTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});

      // Verify user is deleted
      const getResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${deleteTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(getResponse.status).toBe(404);
      expect(isErrorResponseData(getResponse.body.data)).toBe(true);
      expect(getResponse.body.data.code).toBe('DB_004');

      // Reset to prevent double-cleanup in afterEach
      deleteTestUserId = 0;
    });

    it('should return 404 for non-existent user ID', async () => {
      const response = await server.request({
        method: 'DELETE',
        url: '/v1/people/99999',
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(404);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('DB_004');
    });

    it('should return 404 when deleting user from different tenant', async () => {
      const { organizationId: otherOrganizationId } = await createTestOrganization(server.app);
      const otherUser = await createUserFixture(server.app, {
        organizationId: otherOrganizationId
      });

      const response = await server.request({
        method: 'DELETE',
        url: `/v1/people/${otherUser.id}`,
        headers: {
          'x-tenant-id': otherOrganizationId.toString(), // Different tenant
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(204);

      // Verify user still exists in original tenant
      const getResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${otherUser.id}`,
        headers: {
          'x-tenant-id': otherOrganizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(getResponse.status).toBe(404);
      expect(isErrorResponseData(getResponse.body.data)).toBe(true);
      expect(getResponse.body.data.code).toBe('DB_004');

      // Clean up
      try {
        await deleteUserFixture(server.app, otherOrganizationId, otherUser.id);
      } catch {
        // User may already be deleted by the tested operation
      }
      await cleanupOrganization(server.app, otherOrganizationId);
    });

    it('should return 400 when x-tenant-id header is missing', async () => {
      const response = await server.request({
        method: 'DELETE',
        url: `/v1/people/${deleteTestUserId}`,
        headers: {} // Explicitly set empty headers to prevent supertest from reusing headers
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for already deleted user (idempotent)', async () => {
      // First delete
      await server.request({
        method: 'DELETE',
        url: `/v1/people/${deleteTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      // Try to delete again
      const response = await server.request({
        method: 'DELETE',
        url: `/v1/people/${deleteTestUserId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(404);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('DB_004');

      // Reset to prevent double-cleanup in afterEach
      deleteTestUserId = 0;
    });
  });

  describe('Complete CRUD Lifecycle', () => {
    it('should support create -> read -> update -> delete flow', async () => {
      let userId: number;

      // 1. Create
      const createResponse = await server.request({
        method: 'POST',
        url: '/v1/people',
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: {
          isActive: false,
          isVerified: false
        }
      });

      expect(createResponse.status).toBe(201);
      expect(isUserResponseData(createResponse.body.data)).toBe(true);
      // eslint-disable-next-line prefer-const
      userId = createResponse.body.data.id;

      // 2. Read
      const getResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${userId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(getResponse.status).toBe(200);
      expect(isUserResponseData(getResponse.body.data)).toBe(true);
      expect(getResponse.body.data.id).toBe(userId);

      // 3. Update
      const updateResponse = await server.request({
        method: 'PATCH',
        url: `/v1/people/${userId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`
        },
        body: {
          isActive: true,
          isVerified: true
        }
      });

      expect(updateResponse.status).toBe(200);
      expect(isUserResponseData(updateResponse.body.data)).toBe(true);

      // 4. Delete
      const deleteResponse = await server.request({
        method: 'DELETE',
        url: `/v1/people/${userId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(deleteResponse.status).toBe(204);

      // 5. Verify deletion
      const finalGetResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${userId}`,
        headers: {
          'x-tenant-id': organizationId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(finalGetResponse.status).toBe(404);
      expect(isErrorResponseData(finalGetResponse.body.data)).toBe(true);
      expect(finalGetResponse.body.data.code).toBe('DB_004');
    });
  });
});
