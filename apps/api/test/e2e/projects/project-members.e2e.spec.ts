import { JwtService } from '@nestjs/jwt';

import { createUserFixture } from '../../fixtures/user.fixture';
import { startTestServer, waitForServiceInitialization } from '../../helpers/bootstrap';
import {
  cleanupTenant,
  createTestOrganization,
  createTestUserTenant,
  setupE2ETestDatabaseJest
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';

describe('Project Members E2E', () => {
  let server: TestServer;
  let jwtService: JwtService;

  let tenantId: number;
  let organizationId: number;
  let creatorUserId: number;
  let memberUserId: number;
  let otherTenantUserId: number;
  let projectId: number;

  let creatorToken: string;
  let assignedMemberToken: string;
  let nonOwnerToken: string;

  let otherTenantContext: { tenantId: number; organizationId: number };
  let originalEventsEnabled: string | undefined;
  let originalKafkaBrokers: string | undefined;

  beforeAll(async () => {
    originalEventsEnabled = process.env['EVENTS_ENABLED'];
    originalKafkaBrokers = process.env['KAFKA_BROKERS'];
    process.env['EVENTS_ENABLED'] = 'false';
    process.env['KAFKA_BROKERS'] = '';

    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    jwtService = server.app.get(JwtService);

    const organization = await createTestOrganization(server.app, 'Project Members Org');
    tenantId = organization.tenantId;
    organizationId = organization.organizationId;

    const creator = await createUserFixture(server.app, { organizationId });
    const member = await createUserFixture(server.app, { organizationId });
    const nonOwner = await createUserFixture(server.app, { organizationId });

    creatorUserId = creator.id;
    memberUserId = member.id;

    await createTestUserTenant(server.app, creator.id, tenantId, 'tenant_user', true);
    await createTestUserTenant(server.app, member.id, tenantId, 'tenant_user', false);
    await createTestUserTenant(server.app, nonOwner.id, tenantId, 'tenant_user', false);

    otherTenantContext = await createTestOrganization(server.app, 'Other Project Org');
    const otherTenantUser = await createUserFixture(server.app, {
      organizationId: otherTenantContext.organizationId
    });
    otherTenantUserId = otherTenantUser.id;
    await createTestUserTenant(
      server.app,
      otherTenantUser.id,
      otherTenantContext.tenantId,
      'tenant_user',
      true
    );

    creatorToken = createToken(jwtService, creator.id, tenantId, [
      'tenant:projects:create',
      'tenant:projects:read',
      'tenant:projects:update'
    ]);
    assignedMemberToken = createToken(jwtService, member.id, tenantId, ['tenant:projects:read']);
    nonOwnerToken = createToken(jwtService, nonOwner.id, tenantId, ['tenant:projects:update']);

    await waitForServiceInitialization(server, { maxWait: 30000 });
  });

  afterAll(async () => {
    if (originalEventsEnabled === undefined) {
      delete process.env['EVENTS_ENABLED'];
    } else {
      process.env['EVENTS_ENABLED'] = originalEventsEnabled;
    }
    if (originalKafkaBrokers === undefined) {
      delete process.env['KAFKA_BROKERS'];
    } else {
      process.env['KAFKA_BROKERS'] = originalKafkaBrokers;
    }
    await cleanupTenant(server.app, otherTenantContext.tenantId);
    await cleanupTenant(server.app, tenantId);
    await server.close();
  });

  it('creates a private project and auto-adds the creator as a member', async () => {
    const response = await server.httpPost({
      path: '/v1/spaces',
      tenantId: String(organizationId),
      body: {
        name: 'Private Delivery Project',
        visibility: 'private'
      },
      headers: {
        Authorization: `Bearer ${creatorToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(response.status).toBe(201);
    projectId = Number((response.body as { data?: { id?: number } }).data?.id);
    expect(projectId).toBeGreaterThan(0);

    const membersResponse = await server.httpGet(
      `/v1/spaces/${projectId}/members`,
      String(organizationId)
    );

    const securedMembersResponse = await server.request({
      method: 'GET',
      url: `/v1/spaces/${projectId}/members`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${creatorToken}`
      }
    });

    expect(membersResponse.status).toBe(401);
    expect(securedMembersResponse.status).toBe(200);
    expect((securedMembersResponse.body as { data?: unknown[] }).data).toEqual([
      expect.objectContaining({
        userId: creatorUserId,
        isCreator: true
      })
    ]);
  });

  it('allows the project creator to add an organization member', async () => {
    const response = await server.httpPost({
      path: `/v1/spaces/${projectId}/members`,
      tenantId: String(organizationId),
      body: {
        userId: memberUserId
      },
      headers: {
        Authorization: `Bearer ${creatorToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(response.status).toBe(201);
    expect((response.body as { data?: unknown }).data).toEqual(
      expect.objectContaining({
        userId: memberUserId,
        isCreator: false
      })
    );
  });

  it('allows an assigned member to read a private project', async () => {
    const response = await server.request({
      method: 'GET',
      url: `/v1/spaces/${projectId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${assignedMemberToken}`
      }
    });

    expect(response.status).toBe(200);
    expect((response.body as { data?: unknown }).data).toEqual(
      expect.objectContaining({
        id: projectId,
        visibility: 'private'
      })
    );
  });

  it('rejects adding a member from another organization', async () => {
    const response = await server.httpPost({
      path: `/v1/spaces/${projectId}/members`,
      tenantId: String(organizationId),
      body: {
        userId: otherTenantUserId
      },
      headers: {
        Authorization: `Bearer ${creatorToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(response.status).toBe(404);
  });

  it('rejects a non-owner tenant user trying to manage project members', async () => {
    const response = await server.httpPost({
      path: `/v1/spaces/${projectId}/members`,
      tenantId: String(organizationId),
      body: {
        userId: creatorUserId
      },
      headers: {
        Authorization: `Bearer ${nonOwnerToken}`,
        'Content-Type': 'application/json'
      }
    });

    expect(response.status).toBe(404);
  });

  it('allows the creator to remove an assigned member', async () => {
    const response = await server.request({
      method: 'DELETE',
      url: `/v1/spaces/${projectId}/members/${memberUserId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${creatorToken}`
      }
    });

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);

    const readAfterRemoval = await server.request({
      method: 'GET',
      url: `/v1/spaces/${projectId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${assignedMemberToken}`
      }
    });

    expect(readAfterRemoval.status).toBe(404);
  });
});

function createToken(
  jwtService: JwtService,
  userId: number,
  tenantId: number,
  permissions: string[]
): string {
  return jwtService.sign({
    sub: String(userId),
    userId: String(userId),
    db_user_id: String(userId),
    tenant_id: String(tenantId),
    actor_id: String(userId),
    email: `user-${userId}@example.com`,
    permissions
  });
}
