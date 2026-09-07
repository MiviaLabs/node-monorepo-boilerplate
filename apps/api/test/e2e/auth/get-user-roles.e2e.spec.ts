/**
 * Get User Roles E2E Test
 *
 * Tests the GET /auth/roles endpoint that fetches user roles and permissions
 * from the database (not from JWT claims).
 *
 * This tests the database-backed RBAC system where:
 * - Roles are stored in user_roles (system) and user_tenants (tenant) tables
 * - Permissions are resolved from roles using getPermissionsForRole()
 * - JWT contains minimal claims (db_user_id, tenant_id, sub)
 */

import { JwtService } from '@nestjs/jwt';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { startTestServer, type TestServer } from '../../helpers/bootstrap';
import {
  cleanupTenant,
  createTestOrganization,
  createTestUserTenant,
  setupE2ETestDatabaseJest,
  TEST_USER_ENCRYPTION_KEY_VERSION
} from '../../helpers/database';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

interface RolesResponse {
  status: number;
  body: {
    data: {
      roles: string[];
      permissions: string[];
    };
    metadata?: {
      timestamp: string;
    };
  };
}

// Helper function to safely extract first item from .returning() result
// Drizzle .returning() can return either an array or a single item depending on the dialect
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic import type cannot be statically imported
function getSingleResult(result: any): any {
  return Array.isArray(result) ? result[0] : result;
}

describe('GET /auth/roles - Database-Backed Roles', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let jwtService: JwtService;
  let tenantId: number;
  let organizationId: number;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    jwtService = server.app.get<JwtService>(JwtService);

    const result = await createTestOrganization(server.app, 'Test Org Roles');
    tenantId = result.tenantId;
    organizationId = result.organizationId;
  });

  afterAll(async () => {
    if (tenantId) {
      await cleanupTenant(server.app, tenantId);
    }
    await server?.close();
  });

  describe('User with system role only', () => {
    let userToken: string;
    let userId: number;

    beforeEach(async () => {
      const { users } = await import('@package/db-core');
      const { userRoles } = await import('@package/db-core');

      // Create user
      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId,
            emailHash: `system-admin-${Date.now()}`,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );
      userId = user.id;

      // Assign system role (no tenant role)
      await db.insert(userRoles).values({
        userId,
        role: 'system_admin'
      });

      // Generate JWT with MINIMAL claims (no roles/permissions)
      userToken = jwtService.sign({
        sub: userId.toString(),
        db_user_id: userId.toString(),
        tenant_id: String(organizationId),
        actor_id: userId.toString(),
        email: `system-admin-${Date.now()}@example.com`,
        name: 'System Admin'
      });
    });

    it('should return system roles from database', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-tenant-id': String(organizationId)
        }
      })) as unknown as RolesResponse;

      expect(response.status).toBe(200);
      expect(response.body.data.roles).toContain('system_admin');
    });

    it('should return permissions resolved from system role', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-tenant-id': String(organizationId)
        }
      })) as unknown as RolesResponse;

      expect(response.status).toBe(200);
      expect(response.body.data.permissions).toContain('system:users:read');
    });
  });

  describe('User with tenant role only', () => {
    let userToken: string;
    let userId: number;

    beforeEach(async () => {
      const { users } = await import('@package/db-core');

      // Create user
      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId,
            emailHash: `tenant-user-${Date.now()}`,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );
      userId = user.id;

      // Assign tenant role (no system role)
      await createTestUserTenant(server.app, userId, tenantId, 'tenant_user', false);

      // Generate JWT with MINIMAL claims
      userToken = jwtService.sign({
        sub: userId.toString(),
        db_user_id: userId.toString(),
        tenant_id: String(organizationId),
        actor_id: userId.toString(),
        email: `tenant-user-${Date.now()}@example.com`,
        name: 'Tenant User'
      });
    });

    it('should return tenant role from database', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-tenant-id': String(organizationId)
        }
      })) as unknown as RolesResponse;

      expect(response.status).toBe(200);
      expect(response.body.data.roles).toContain('tenant_user');
    });

    it('should return permissions resolved from tenant role', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-tenant-id': String(organizationId)
        }
      })) as unknown as RolesResponse;

      expect(response.status).toBe(200);
      expect(response.body.data.permissions).toContain('tenant:users:read');
    });
  });

  describe('User with both system and tenant roles', () => {
    let userToken: string;
    let userId: number;

    beforeEach(async () => {
      const { users } = await import('@package/db-core');
      const { userRoles } = await import('@package/db-core');

      // Create user
      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId,
            emailHash: `multi-role-${Date.now()}`,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );
      userId = user.id;

      // Assign system role
      await db.insert(userRoles).values({
        userId,
        role: 'system_admin'
      });

      // Assign tenant role
      await createTestUserTenant(server.app, userId, tenantId, 'tenant_admin', false);

      // Generate JWT with MINIMAL claims
      userToken = jwtService.sign({
        sub: userId.toString(),
        db_user_id: userId.toString(),
        tenant_id: String(organizationId),
        actor_id: userId.toString(),
        email: `multi-role-${Date.now()}@example.com`,
        name: 'Multi Role User'
      });
    });

    it('should return both system and tenant roles', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-tenant-id': String(organizationId)
        }
      })) as unknown as RolesResponse;

      expect(response.status).toBe(200);
      expect(response.body.data.roles).toContain('system_admin');
      expect(response.body.data.roles).toContain('tenant_admin');
    });

    it('should return combined permissions from both roles', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-tenant-id': String(organizationId)
        }
      })) as unknown as RolesResponse;

      expect(response.status).toBe(200);
      expect(response.body.data.permissions).toContain('system:users:read');
      expect(response.body.data.permissions).toContain('tenant:users:read');
    });
  });

  describe('User with no roles', () => {
    let userToken: string;

    beforeEach(async () => {
      const { users } = await import('@package/db-core');

      // Create user with no roles
      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId,
            emailHash: `no-role-${Date.now()}`,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );

      // Generate JWT with MINIMAL claims
      userToken = jwtService.sign({
        sub: user.id.toString(),
        db_user_id: user.id.toString(),
        tenant_id: String(organizationId),
        actor_id: user.id.toString(),
        email: `no-role-${Date.now()}@example.com`,
        name: 'No Role User'
      });
    });

    it('should return empty roles array', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-tenant-id': String(organizationId)
        }
      })) as unknown as RolesResponse;

      expect(response.status).toBe(200);
      expect(response.body.data.roles).toEqual([]);
    });

    it('should return empty permissions array', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-tenant-id': String(organizationId)
        }
      })) as unknown as RolesResponse;

      expect(response.status).toBe(200);
      expect(response.body.data.permissions).toEqual([]);
    });
  });

  describe('Authentication', () => {
    it('should deny unauthenticated requests', async () => {
      const response = await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          'x-tenant-id': String(organizationId)
        }
      });

      expect(response.status).toBe(401);
    });

    it('should require x-tenant-id header', async () => {
      const { users } = await import('@package/db-core');

      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId,
            emailHash: `test-${Date.now()}`,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );

      const token = jwtService.sign({
        sub: user.id.toString(),
        db_user_id: user.id.toString(),
        tenant_id: String(organizationId)
      });

      const response = await server.request({
        method: 'GET',
        url: '/v1/iam/roles',
        headers: {
          Authorization: `Bearer ${token}`
          // Missing x-tenant-id header
        }
      });

      expect(response.status).toBe(400);
    });
  });
});
