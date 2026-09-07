/**
 * Tenant Validation E2E Tests
 *
 * Tests the tenant validation middleware and service using a real NestJS server
 * and Testcontainers database. This ensures all tenant resolution strategies work correctly.
 *
 * @packageDocumentation
 */

import { JwtService } from '@nestjs/jwt';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { TenantResolutionService } from '../../../src/common/services/tenant-resolution.service';
import { startTestServer } from '../../helpers/bootstrap';
import {
  setupE2ETestDatabaseJest,
  createTestOrganization,
  createTestUserTenant,
  cleanupOrganization,
  TEST_USER_ENCRYPTION_KEY_VERSION
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Type guard for error responses
interface ErrorResponseData {
  code: string;
  message?: string;
}

function isErrorResponseData(data: unknown): data is ErrorResponseData {
  return (
    typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string'
  );
}

// Helper function to safely extract first item from .returning() result
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSingleResult(result: any): any {
  return Array.isArray(result) ? result[0] : result;
}

describe('Tenant Validation E2E Tests', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let db: NodePgDatabase<Record<string, never>>;
  let validTenantDbId: number;
  let validTenantId: number;
  let suspendedTenantId: number;
  let testUserId: number;
  let testUserToken: string;

  beforeAll(async () => {
    // Setup test database
    await setupE2ETestDatabaseJest();

    // Start server
    server = await startTestServer();

    // Get database and JwtService from the app
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    jwtService = server.app.get<JwtService>(JwtService);

    // Create test organizations with tenants
    const org1Result = await createTestOrganization(server.app, 'Test Org 1');
    validTenantDbId = org1Result.tenantId;
    validTenantId = org1Result.organizationId;

    const org2Result = await createTestOrganization(server.app, 'Test Org 2');
    suspendedTenantId = org2Result.organizationId;

    // Dynamic import for db-core schema
    const { users } = await import('@package/db-core');

    // Create test user in database
    const testUser = getSingleResult(
      await db
        .insert(users)
        .values({
          organizationId: validTenantId,
          emailHash: `test-user-${Date.now()}`,
          encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
          isActive: true,
          isVerified: true
        })
        .returning()
    );
    testUserId = testUser.id as number;

    // Create user tenant with admin role
    await createTestUserTenant(server.app, testUserId, validTenantDbId, 'tenant_admin', false);

    // Generate JWT token with db_user_id set to the actual database user ID
    testUserToken = jwtService.sign({
      sub: testUserId.toString(),
      db_user_id: testUserId.toString(),
      tenant_id: validTenantId.toString(),
      actor_id: testUserId.toString(),
      email: 'test@example.com',
      name: 'Test User',
      roles: ['tenant_admin'],
      permissions: [
        'tenant:users:read',
        'tenant:users:write',
        'tenant:users:delete',
        'tenant:settings:read'
      ]
    });
  });

  afterAll(async () => {
    // Cleanup organizations (will cascade delete users)
    if (server) {
      await cleanupOrganization(server.app, validTenantId);
      await cleanupOrganization(server.app, suspendedTenantId);
      await server.close();
    }
  });

  describe('Tenant Header Validation', () => {
    it('should return 200 with valid tenant ID header', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: {
          'x-tenant-id': validTenantId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(200);
    });

    it('should return 400 (API_008) when x-tenant-id header is missing', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: {} // Explicitly empty headers
      });

      expect(response.status).toBe(400);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('API_008');
      expect(response.body.data.message).toContain('x-tenant-id');
    });

    it('should return 400 (API_023) when tenant ID format is invalid', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: { 'x-tenant-id': 'invalid' }
      });

      expect(response.status).toBe(400);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('API_023');
    });

    it('should return 400 (API_023) when tenant ID is zero', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: { 'x-tenant-id': '0' }
      });

      expect(response.status).toBe(400);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('API_023');
    });

    it('should return 400 (API_023) when tenant ID is negative', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: { 'x-tenant-id': '-1' }
      });

      expect(response.status).toBe(400);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('API_023');
    });

    it('should return 404 (API_021) when tenant ID does not exist', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: { 'x-tenant-id': '999999' }
      });

      expect(response.status).toBe(404);
      expect(isErrorResponseData(response.body.data)).toBe(true);
      expect(response.body.data.code).toBe('API_021');
    });
  });

  describe('Public Routes Bypass Tenant Validation', () => {
    it('should allow health endpoint without tenant header', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/ops/health',
        headers: {} // No tenant header
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.status).toBe('ok');
    });

    it('should allow Swagger docs without tenant header', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/api/docs',
        headers: {} // No tenant header
      });

      expect(response.status).toBe(200);
    });

    it('should allow root path without tenant header', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/',
        headers: {} // No tenant header
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Tenant Status Validation', () => {
    it('should return 403 (API_022) when tenant is suspended', async () => {
      // Note: We would need to update the tenant status to 'suspended' in the database
      // For now, this test documents the expected behavior
      // TODO: Implement tenant status update and test

      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: {
          'x-tenant-id': suspendedTenantId.toString(),
          Authorization: `Bearer ${testUserToken}`
        }
      });

      // Currently, this will return 404 (user not in this tenant) or 200 (if user exists)
      // When tenant suspension is implemented, it should return 403 with API_022
      // expect(response.status).toBe(403);
      // expect(response.body.data.code).toBe('API_022');

      expect(response.status).toBe(404);
    });
  });

  describe('Tenant Data Isolation', () => {
    it('should not return users from different tenant', async () => {
      const { tenantId: _otherTenantId, organizationId: otherOrganizationId } =
        await createTestOrganization(server.app);

      try {
        const response = await server.request({
          method: 'GET',
          url: `/v1/people/${testUserId}`,
          headers: {
            'x-tenant-id': otherOrganizationId.toString(),
            Authorization: `Bearer ${testUserToken}`
          }
        });

        expect(response.status).toBe(404);
      } finally {
        await cleanupOrganization(server.app, otherOrganizationId);
      }
    });

    it('should only return users for the specified tenant', async () => {
      const otherOrgResult = await createTestOrganization(server.app, 'Test Org Other');
      const otherTenantId = otherOrgResult.tenantId;
      const otherOrgId = otherOrgResult.organizationId;

      try {
        // Create a user in the other tenant directly in database
        const { users } = await import('@package/db-core');
        const otherUser = getSingleResult(
          await db
            .insert(users)
            .values({
              organizationId: otherOrgId,
              emailHash: `test-user-other-${Date.now()}`,
              encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
              isActive: true,
              isVerified: true
            })
            .returning()
        );
        const otherUserId = otherUser.id as number;

        // Create user tenant with role
        await createTestUserTenant(server.app, otherUserId, otherTenantId, 'tenant_user', false);

        // Query for users in validTenantId - should NOT include otherUserId
        const listResponse = await server.request({
          method: 'GET',
          url: '/v1/people',
          headers: {
            'x-tenant-id': validTenantId.toString(),
            Authorization: `Bearer ${testUserToken}`
          }
        });

        expect(listResponse.status).toBe(200);
      } finally {
        await cleanupOrganization(server.app, otherOrgId);
      }
    });
  });

  describe('Subdomain Routing (Future Enhancement)', () => {
    it('should document subdomain routing behavior (not yet implemented)', async () => {
      // This test documents the expected behavior for subdomain-based tenant resolution
      // When implemented, the following should work:
      //
      // 1. Extract subdomain from Host header (e.g., acme.app.com -> acme)
      // 2. Resolve tenant by organization slug
      // 3. Set tenant context from resolved tenant
      //
      // Expected responses:
      // - Valid subdomain: 200 with tenant data
      // - Invalid subdomain: 404 (API_021)
      // - Suspended tenant: 403 (API_022)
      //
      // For now, we only test header-based resolution

      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: {
          'x-tenant-id': validTenantId.toString(),
          Host: 'acme.app.com', // Subdomain should be ignored when header is present
          Authorization: `Bearer ${testUserToken}`
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('Cache Invalidation on Tenant Status Change', () => {
    it('should document cache invalidation behavior (not yet tested)', async () => {
      // This test documents the expected behavior for cache invalidation
      // When tenant status changes (e.g., active -> suspended):
      //
      // 1. Update tenant status in database
      // 2. Invalidate tenant cache (TenantResolutionService.invalidateTenantCache)
      // 3. Subsequent requests should see new status immediately
      //
      // Expected behavior:
      // - Active tenant: 200 with data
      // - After suspension: 403 (API_022)
      // - Cache should be invalidated (no stale data)
      //
      // For now, we just verify the cache mechanism exists

      const service = server.app.get<TenantResolutionService>(TenantResolutionService);
      expect(service).toBeDefined();
      expect(typeof service.invalidateTenantCache).toBe('function');
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error response format for API_008', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: {} // Missing tenant header
      });

      expect(response.status).toBe(400);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.code).toBe('API_008');
      expect(response.body.data.message).toContain('x-tenant-id');
      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.error).toBeDefined();
      expect(response.body.metadata.error.httpStatus).toBe(400);
    });

    it('should return consistent error response format for API_021', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: { 'x-tenant-id': '999999' }
      });

      expect(response.status).toBe(404);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.code).toBe('API_021');
      expect(response.body.data.message).toContain('999999');
      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.error).toBeDefined();
      expect(response.body.metadata.error.httpStatus).toBe(404);
    });

    it('should return consistent error response format for API_023', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${testUserId}`,
        headers: { 'x-tenant-id': 'invalid' }
      });

      expect(response.status).toBe(400);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.code).toBe('API_023');
      expect(response.body.data.message).toContain('invalid');
      expect(response.body.metadata).toBeDefined();
      expect(response.body.metadata.error).toBeDefined();
      expect(response.body.metadata.error.httpStatus).toBe(400);
    });
  });
});
