import { JwtService } from '@nestjs/jwt';
import { eq, userRoles, type NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { createUserWithTenantFixture, UserRole } from '../../fixtures/user.fixture';
import { startTestServer } from '../../helpers/bootstrap';
import {
  cleanupOrganization,
  createTestOrganization,
  setupE2ETestDatabaseJest
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';

describe('OPA Strict E2E Smoke', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let tenantId: number;
  let organizationId: number;
  let userId: number;
  let token: string;
  let adminUserId: number;
  let adminAdminToken: string;
  let db: NodePgDatabase;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    jwtService = server.app.get<JwtService>(JwtService);
    db = server.app.get<NodePgDatabase>(MAIN_DB);

    const org = await createTestOrganization(server.app, 'OPA Strict Smoke Org');
    tenantId = org.tenantId;
    organizationId = org.organizationId;

    const user = await createUserWithTenantFixture(server.app, {
      tenantId,
      organizationId,
      role: UserRole.USER,
      isDefault: true
    });
    userId = user.id;

    // In strict mode, policy compares user.organization_id to resource.organization_id.
    // x-tenant-id resolves to organizationId, so tenant_id claim must match organizationId.
    token = jwtService.sign({
      sub: String(userId),
      db_user_id: String(userId),
      actor_id: String(userId),
      tenant_id: String(organizationId),
      roles: ['tenant_user']
    });

    const adminUser = await createUserWithTenantFixture(server.app, {
      tenantId,
      organizationId,
      role: UserRole.USER,
      isDefault: true
    });
    adminUserId = adminUser.id;

    await db.insert(userRoles).values({
      userId: adminUserId,
      role: 'system_admin'
    });

    adminAdminToken = jwtService.sign({
      sub: String(adminUserId),
      db_user_id: String(adminUserId),
      actor_id: String(adminUserId),
      tenant_id: String(organizationId),
      roles: ['system_admin', 'tenant_user'],
      permissions: ['system:system:monitor', 'system:tenants:read', 'system:users:read']
    });
  });

  afterAll(async () => {
    if (adminUserId) {
      await db.delete(userRoles).where(eq(userRoles.userId, adminUserId));
    }
    if (organizationId) {
      await cleanupOrganization(server.app, organizationId);
    }
    await server?.close();
  });

  it('allows authenticated self-profile access with strict OPA', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/iam/identity',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.userId).toBe(String(userId));
    expect(response.body.data?.tenantId).toBe(String(organizationId));
  });

  it('allows admin health route with strict OPA when system monitor permission is embedded', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/health',
      headers: {
        Authorization: `Bearer ${adminAdminToken}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.services).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'database' })])
    );
    expect(response.body.data?.metrics).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'tenants_total' })])
    );
  });

  it('allows remaining admin monitor routes with strict OPA when system monitor permission is embedded', async () => {
    const monitorRoutes = [
      { url: '/v1/console/statistics', expectedStatus: 200 },
      { url: '/v1/console/mail/summary', expectedStatus: 200 },
      { url: '/v1/console/mail', expectedStatus: 200 },
      { url: '/v1/console/dispatch/summary', expectedStatus: 200 },
      { url: '/v1/console/dispatch', expectedStatus: 200 },
      { url: '/v1/console/inbox', expectedStatus: 501 }
    ];

    for (const route of monitorRoutes) {
      const response = await server.request({
        method: 'GET',
        url: route.url,
        headers: {
          Authorization: `Bearer ${adminAdminToken}`,
          'x-tenant-id': String(organizationId)
        }
      });

      expect(response.status).toBe(route.expectedStatus);
    }
  });

  it('allows admin tenant inventory route with strict OPA when tenants read permission is embedded', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/workspaces',
      headers: {
        Authorization: `Bearer ${adminAdminToken}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.items).toEqual(expect.any(Array));
  });

  it('allows admin access inventory route with strict OPA when users read permission is embedded', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/access',
      headers: {
        Authorization: `Bearer ${adminAdminToken}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(200);
    expect(response.body.data?.memberships).toEqual(expect.any(Array));
    expect(response.body.data?.invitations).toEqual(expect.any(Array));
  });

  it('denies admin access inventory route in strict OPA without system users read permission', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/console/access',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': String(organizationId)
      }
    });

    expect(response.status).toBe(403);
  });
});
