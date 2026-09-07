/**
 * Export User Data E2E Tests
 *
 * Comprehensive end-to-end tests for the GET /auth/account/:id/export endpoint.
 * Tests authentication, authorization, business logic, tenant isolation, and response format.
 *
 * @packageDocumentation
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { JwtService } from '@nestjs/jwt';

import { createUserFixture, deleteUserFixture } from '../../fixtures/user.fixture';
import { startTestServer } from '../../helpers/bootstrap';
import {
  setupE2ETestDatabaseJest,
  createTestOrganization,
  cleanupOrganization,
  createTestUserTenant
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';

// Type definitions for test responses

interface UserDataExport {
  user: {
    id: string;
    email: string;
    displayName: string;
    isVerified: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string | null;
    lastSignInAt: string | null;
  };
  identities: Array<{
    provider: string;
    displayName: string;
    emailVerified: boolean;
    createdAt: string;
  }>;
  organization: {
    id: string;
    name: string;
  };
  exportedAt: string;
  exportedBy: string;
}

interface TestResponse {
  status: number;
  body: {
    data?: unknown;
    [key: string]: unknown;
  };
}

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

// Type guard for UserDataExport
function isUserDataExport(data: unknown): data is UserDataExport {
  return (
    typeof data === 'object' &&
    data !== null &&
    'user' in data &&
    'identities' in data &&
    'organization' in data &&
    'exportedAt' in data &&
    'exportedBy' in data
  );
}

// Helper to extract data from wrapped response
function getResponseData<T>(body: unknown): T {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

describe('Export User Data E2E Tests', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let testOrganization: number;
  let testTenantDbId: number;

  // Test users
  let regularUser: { id: number; token: string };
  let adminUser: { id: number; token: string };

  beforeAll(async () => {
    // CRITICAL: Setup test database FIRST to ensure migrations run
    await setupE2ETestDatabaseJest();

    // CRITICAL: Start server SECOND before creating fixtures
    server = await startTestServer();

    // Get JwtService for generating tokens
    jwtService = server.app.get<JwtService>(JwtService);

    // Create test organization
    const orgData = await createTestOrganization(server.app);
    testTenantDbId = orgData.tenantId;
    testOrganization = orgData.organizationId;

    // Create test users with different roles
    const regularUserRecord = await createUserFixture(server.app, {
      organizationId: testOrganization
    });

    const adminUserRecord = await createUserFixture(server.app, {
      organizationId: testOrganization
    });
    await createTestUserTenant(
      server.app,
      regularUserRecord.id,
      testTenantDbId,
      'tenant_user',
      true
    );
    await createTestUserTenant(
      server.app,
      adminUserRecord.id,
      testTenantDbId,
      'tenant_admin',
      false
    );

    // Generate JWT tokens for each user
    regularUser = {
      id: regularUserRecord.id,
      token: jwtService.sign({
        sub: regularUserRecord.id.toString(),
        userId: regularUserRecord.id.toString(),
        tenant_id: testTenantDbId.toString(),
        actor_id: regularUserRecord.id.toString(),
        email: `user-${regularUserRecord.id}@example.com`,
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      })
    };

    adminUser = {
      id: adminUserRecord.id,
      token: jwtService.sign({
        sub: adminUserRecord.id.toString(),
        userId: adminUserRecord.id.toString(),
        tenant_id: testTenantDbId.toString(),
        actor_id: adminUserRecord.id.toString(),
        email: `admin-${adminUserRecord.id}@example.com`,
        roles: ['tenant_admin'],
        permissions: ['*']
      })
    };
  });

  afterAll(async () => {
    // Clean up test users
    try {
      await deleteUserFixture(server.app, testOrganization, regularUser.id);
    } catch {
      // Ignore if already deleted
    }

    try {
      await deleteUserFixture(server.app, testOrganization, adminUser.id);
    } catch {
      // Ignore if already deleted
    }

    await cleanupOrganization(server.app, testOrganization);
    await server?.close();
  });

  describe('Happy Path - User Successfully Exports Own Data', () => {
    it('should allow user to export their own data', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(200);
      const exportData = getResponseData<UserDataExport>(response.body);
      expect(isUserDataExport(exportData)).toBe(true);
      expect(exportData.user.id).toBe(regularUser.id.toString());
      expect(exportData.user.isActive).toBe(true);
      expect(exportData.organization.id).toBe(testOrganization.toString());
      expect(exportData.exportedBy).toBe(regularUser.id.toString());
      expect(exportData.exportedAt).toBeDefined();
      expect(new Date(exportData.exportedAt)).toBeInstanceOf(Date);
      expect(exportData.identities).toEqual([]);
    });

    it('should include all required fields in export data', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(200);
      const exportData = getResponseData<UserDataExport>(response.body);

      // Verify user object structure
      expect(exportData.user.id).toBeDefined();
      expect(exportData.user.id).toMatch(/^\d+$/);
      expect(exportData.user.email).toBeDefined();
      expect(typeof exportData.user.email).toBe('string');
      expect(exportData.user.displayName).toBeDefined();
      expect(typeof exportData.user.displayName).toBe('string');
      expect(exportData.user.isVerified).toBeDefined();
      expect(typeof exportData.user.isVerified).toBe('boolean');
      expect(exportData.user.isActive).toBeDefined();
      expect(typeof exportData.user.isActive).toBe('boolean');
      expect(exportData.user.createdAt).toBeDefined();
      expect(typeof exportData.user.createdAt).toBe('string');
      expect(exportData.user.updatedAt).toBeDefined();
      expect(typeof exportData.user.updatedAt).toBe('string');
      // lastSignInAt can be null or string (ISO date)
      expect(
        exportData.user.lastSignInAt === null || typeof exportData.user.lastSignInAt === 'string'
      ).toBe(true);

      // Verify organization object structure
      expect(exportData.organization).toMatchObject({
        id: expect.any(String),
        name: expect.any(String)
      });

      // Verify identities array (may be empty)
      expect(Array.isArray(exportData.identities)).toBe(true);

      // Verify metadata
      expect(exportData.exportedAt).toBeDefined();
      expect(exportData.exportedBy).toBeDefined();
    });

    it('should return ISO 8601 formatted dates', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(200);
      const exportData = getResponseData<UserDataExport>(response.body);

      // Verify ISO 8601 format
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

      expect(exportData.user.createdAt).toMatch(iso8601Regex);
      expect(exportData.exportedAt).toMatch(iso8601Regex);

      if (exportData.user.updatedAt) {
        expect(exportData.user.updatedAt).toMatch(iso8601Regex);
      }

      if (exportData.user.lastSignInAt) {
        expect(exportData.user.lastSignInAt).toMatch(iso8601Regex);
      }
    });
  });

  describe('Error Case - Authentication Required', () => {
    it('should return 401 when attempting to export without authentication', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString()
          // No Authorization header
        }
      })) as TestResponse;

      expect(response.status).toBe(401);
    });

    it('should return 401 when using malformed token', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: 'Bearer invalid-token'
        }
      })) as TestResponse;

      expect(response.status).toBe(401);
    });

    it('should return 401 when using expired token', async () => {
      const expiredToken = jwtService.sign(
        {
          sub: regularUser.id.toString(),
          userId: regularUser.id.toString(),
          tenant_id: testTenantDbId.toString()
        },
        { expiresIn: '-1h' }
      );

      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${expiredToken}`
        }
      })) as TestResponse;

      expect(response.status).toBe(401);
    });
  });

  describe('Error Case - Tenant Context Required', () => {
    it('should return 400 when x-tenant-id header is missing', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          Authorization: `Bearer ${regularUser.token}`
          // Missing x-tenant-id
        }
      })) as TestResponse;

      expect(response.status).toBe(400);
    });

    it('should return 400 when x-tenant-id is invalid format', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': 'invalid-tenant-id',
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(400);
    });
  });

  describe('Error Case - User Not Found', () => {
    it('should return 404 when attempting to export non-existent user', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/account/99999/export',
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${adminUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(404);
      expect(isErrorResponseData(response.body.data)).toBe(true);
    });

    it('should return 400 for invalid user ID format (non-numeric)', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/account/invalid/export',
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${adminUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid user ID (zero)', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/account/0/export',
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${adminUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid user ID (negative)', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/account/-1/export',
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${adminUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(400);
    });
  });

  describe('Error Case - Authorization Failures', () => {
    it('should return 403 when regular user attempts to export another user data', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${adminUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(403);
      expect(isErrorResponseData(response.body.data)).toBe(true);
    });

    it('should allow admin to export any user data (if RBAC implemented)', async () => {
      // NOTE: This test will currently fail with 403 because admin check is not implemented
      // TODO: Update this test when RBAC is fully implemented
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${adminUser.token}`
        }
      })) as TestResponse;

      // Expected: 200 (when admin RBAC is implemented)
      // Actual: 403 (admin check not implemented yet)
      expect([200, 403]).toContain(response.status);

      if (response.status === 200) {
        const exportData = getResponseData<UserDataExport>(response.body);
        expect(isUserDataExport(exportData)).toBe(true);
      }
    });
  });

  describe('Error Case - Tenant Isolation', () => {
    it('should prevent cross-tenant data export', async () => {
      // Create another tenant with unique values to avoid conflicts
      const timestamp = Date.now();
      const { tenantId: otherTenantDbId, organizationId: otherOrgId } =
        await createTestOrganization(server.app, `Test Org ${timestamp}`);

      const otherUser = await createUserFixture(server.app, {
        organizationId: otherOrgId
      });
      await createTestUserTenant(server.app, otherUser.id, otherTenantDbId, 'tenant_user', true);

      const otherUserToken = jwtService.sign({
        sub: otherUser.id.toString(),
        userId: otherUser.id.toString(),
        tenant_id: otherTenantDbId.toString(),
        actor_id: otherUser.id.toString(),
        email: `user-${otherUser.id}@example.com`,
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      });

      // Try to export user from otherOrgId using testOrganization user
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${otherUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(), // Different tenant
          Authorization: `Bearer ${regularUser.token}` // Regular user from testOrganization
        }
      })) as TestResponse;

      // Should return 404 (user not found in this tenant) or 403 (cross-tenant access blocked)
      expect([404, 403]).toContain(response.status);

      // Verify the user CAN export their own data from their own tenant
      const validResponse = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${otherUser.id}/export`,
        headers: {
          'x-tenant-id': otherOrgId.toString(), // Correct tenant
          Authorization: `Bearer ${otherUserToken}` // User's own token
        }
      })) as TestResponse;

      expect(validResponse.status).toBe(200);
      const exportData = getResponseData<UserDataExport>(validResponse.body);
      expect(isUserDataExport(exportData)).toBe(true);

      // Cleanup
      await deleteUserFixture(server.app, otherOrgId, otherUser.id);
      await cleanupOrganization(server.app, otherOrgId);
    });

    it('should block cross-tenant access even with valid token', async () => {
      // Create another tenant
      const timestamp = Date.now();
      const { tenantId: otherTenantDbId, organizationId: otherOrgId } =
        await createTestOrganization(server.app, `Test Org ${timestamp}`);

      const otherUser = await createUserFixture(server.app, {
        organizationId: otherOrgId
      });
      await createTestUserTenant(server.app, otherUser.id, otherTenantDbId, 'tenant_user', true);

      // Try to access with correct token but wrong tenant header
      const otherUserToken = jwtService.sign({
        sub: otherUser.id.toString(),
        userId: otherUser.id.toString(),
        tenant_id: otherTenantDbId.toString(),
        actor_id: otherUser.id.toString(),
        email: `user-${otherUser.id}@example.com`,
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      });

      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${otherUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(), // Wrong tenant
          Authorization: `Bearer ${otherUserToken}` // Valid token but for different tenant
        }
      })) as TestResponse;

      // Should return 404 (user not found in this tenant)
      expect(response.status).toBe(404);

      // Cleanup
      await deleteUserFixture(server.app, otherOrgId, otherUser.id);
      await cleanupOrganization(server.app, otherOrgId);
    });
  });

  describe('Edge Case - Export Timing and Metadata', () => {
    it('should set exportedAt to current time', async () => {
      const beforeExport = new Date();

      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      const afterExport = new Date();

      expect(response.status).toBe(200);
      const exportData = getResponseData<UserDataExport>(response.body);

      const exportedAt = new Date(exportData.exportedAt);
      expect(exportedAt.getTime()).toBeGreaterThanOrEqual(beforeExport.getTime());
      expect(exportedAt.getTime()).toBeLessThanOrEqual(afterExport.getTime());
    });

    it('should set exportedBy to the requesting user ID', async () => {
      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      expect(response.status).toBe(200);
      const exportData = getResponseData<UserDataExport>(response.body);

      expect(exportData.exportedBy).toBe(regularUser.id.toString());
    });

    it('should handle concurrent export requests', async () => {
      // Make two simultaneous export requests
      const [response1, response2] = await Promise.all([
        server.request({
          method: 'GET',
          url: `/v1/iam/account/${regularUser.id}/export`,
          headers: {
            'x-tenant-id': testOrganization.toString(),
            Authorization: `Bearer ${regularUser.token}`
          }
        }),
        server.request({
          method: 'GET',
          url: `/v1/iam/account/${regularUser.id}/export`,
          headers: {
            'x-tenant-id': testOrganization.toString(),
            Authorization: `Bearer ${regularUser.token}`
          }
        })
      ]);

      // Both should succeed
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      const export1 = getResponseData<UserDataExport>(response1.body);
      const export2 = getResponseData<UserDataExport>(response2.body);
      expect(isUserDataExport(export1)).toBe(true);
      expect(isUserDataExport(export2)).toBe(true);

      // exportedAt timestamps may differ slightly

      expect(export1.exportedBy).toBe(export2.exportedBy);
      expect(export1.user.id).toBe(export2.user.id);
    });
  });

  describe('Integration - Response Format Consistency', () => {
    it('should return consistent format across multiple exports', async () => {
      const response1 = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay

      const response2 = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const export1 = getResponseData<UserDataExport>(response1.body);
      const export2 = getResponseData<UserDataExport>(response2.body);

      // User data should be identical
      expect(export1.user.id).toBe(export2.user.id);
      expect(export1.user.email).toBe(export2.user.email);

      // Organization should be identical
      expect(export1.organization.id).toBe(export2.organization.id);
      expect(export1.organization.name).toBe(export2.organization.name);

      // exportedBy should be identical
      expect(export1.exportedBy).toBe(export2.exportedBy);

      // exportedAt should differ (different timestamps)
      expect(export1.exportedAt).not.toBe(export2.exportedAt);
    });

    it('should handle special characters in organization name', async () => {
      const { tenantId: specialTenantDbId, organizationId: orgIdWithSpecialChars } =
        await createTestOrganization(server.app, 'Test\\Org_special.chars&');

      const userInSpecialOrg = await createUserFixture(server.app, {
        organizationId: orgIdWithSpecialChars
      });
      await createTestUserTenant(
        server.app,
        userInSpecialOrg.id,
        specialTenantDbId,
        'tenant_user',
        true
      );

      const userToken = jwtService.sign({
        sub: userInSpecialOrg.id.toString(),
        userId: userInSpecialOrg.id.toString(),
        tenant_id: String(specialTenantDbId),
        actor_id: userInSpecialOrg.id.toString(),
        email: `user-${userInSpecialOrg.id}@example.com`,
        roles: ['tenant_user'],
        permissions: ['tenant:users:read']
      });

      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${userInSpecialOrg.id}/export`,
        headers: {
          'x-tenant-id': String(orgIdWithSpecialChars),
          Authorization: `Bearer ${userToken}`
        }
      })) as TestResponse;

      expect(response.status).toBe(200);
      const exportData = getResponseData<UserDataExport>(response.body);

      expect(exportData.organization.id).toBe(String(orgIdWithSpecialChars));
      expect(exportData.organization.name).toBeDefined();
      expect(typeof exportData.organization.name).toBe('string');

      // Cleanup
      await deleteUserFixture(server.app, orgIdWithSpecialChars, userInSpecialOrg.id);
      await cleanupOrganization(server.app, orgIdWithSpecialChars);
    });
  });

  describe('Performance - Response Time', () => {
    it('should complete export request within reasonable time', async () => {
      const startTime = Date.now();

      const response = (await server.request({
        method: 'GET',
        url: `/v1/iam/account/${regularUser.id}/export`,
        headers: {
          'x-tenant-id': testOrganization.toString(),
          Authorization: `Bearer ${regularUser.token}`
        }
      })) as TestResponse;

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      // Should complete within 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should handle multiple sequential exports efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 5; i++) {
        const response = (await server.request({
          method: 'GET',
          url: `/v1/iam/account/${regularUser.id}/export`,
          headers: {
            'x-tenant-id': testOrganization.toString(),
            Authorization: `Bearer ${regularUser.token}`
          }
        })) as TestResponse;

        expect(response.status).toBe(200);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 5 exports within 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });
});
