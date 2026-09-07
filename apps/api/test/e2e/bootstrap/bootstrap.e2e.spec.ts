/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { createHash } from 'node:crypto';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { AuthRepository } from '../../../src/modules/auth/repositories/auth.repository';
import { AuthService } from '../../../src/modules/auth/services/auth.service';
import { startTestServer } from '../../helpers/bootstrap';
import {
  TEST_USER_ENCRYPTION_KEY_VERSION,
  createTestOrganization,
  createTestUserTenant,
  setupE2ETestDatabaseJest
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('Bootstrap Install (E2E)', () => {
  type AuthServiceInternals = {
    provisionGcpTenantSync: (displayName: string) => Promise<string>;
    provisionGcpUserSync: (
      email: string,
      password: string,
      displayName: string,
      gcpTenantId: string | null
    ) => Promise<string>;
    setUserCustomClaims: (
      gcpUid: string,
      tenantId: string,
      userId: number,
      gcpTenantId: string | null
    ) => Promise<void>;
  };

  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let authService: AuthService;
  let authRepository: AuthRepository;

  function createRunId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    authService = server.app.get(AuthService);
    authRepository = server.app.get(AuthRepository);
  }, 120000);

  beforeEach(async () => {
    const authServiceInternals = authService as unknown as AuthServiceInternals;
    const { eq, inArray, organizations, tenants, userIdentities, userRoles, userTenants, users } =
      await import('@package/db-core');

    const bootstrapOrganizations = await db
      .select({ id: organizations.id, tenantId: organizations.tenantId, slug: organizations.slug })
      .from(organizations)
      .then((rows) => rows.filter((organization) => organization.slug.startsWith('bootstrap-')));

    const bootstrapOrganizationIds = bootstrapOrganizations.map((organization) => organization.id);
    const bootstrapTenantIds = bootstrapOrganizations.map((organization) => organization.tenantId);

    if (bootstrapOrganizationIds.length > 0) {
      const bootstrapUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.organizationId, bootstrapOrganizationIds));
      const bootstrapUserIds = bootstrapUsers.map((user) => user.id);

      if (bootstrapUserIds.length > 0) {
        await db.delete(userRoles).where(inArray(userRoles.userId, bootstrapUserIds));
        await db.delete(userTenants).where(inArray(userTenants.userId, bootstrapUserIds));
        await db.delete(userIdentities).where(inArray(userIdentities.userId, bootstrapUserIds));
        await db.delete(users).where(inArray(users.id, bootstrapUserIds));
      }

      await db.delete(organizations).where(inArray(organizations.id, bootstrapOrganizationIds));
      await db.delete(tenants).where(inArray(tenants.id, bootstrapTenantIds));
    }

    await db.delete(userRoles).where(eq(userRoles.role, 'system_owner'));

    jest
      .spyOn(authServiceInternals, 'provisionGcpTenantSync')
      .mockImplementation(
        async (displayName: string) =>
          `bootstrap-tenant-${displayName.toLowerCase().replace(/\s+/g, '-')}-${createRunId()}`
      );
    jest
      .spyOn(authServiceInternals, 'provisionGcpUserSync')
      .mockImplementation(async (email: string) => `bootstrap-user-${email.toLowerCase()}`);
    jest.spyOn(authServiceInternals, 'setUserCustomClaims').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await server.close();
  }, 30000);

  it('returns initialized=false when no system owner exists', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/setup/status'
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      initialized: false,
      systemOwnerExists: false,
      installAllowed: true
    });
  });

  it('returns initialized=true when an active system owner exists', async () => {
    const { tenantId, organizationId } = await createTestOrganization(server.app, 'Bootstrap Seed');
    const { userRoles, users } = await import('@package/db-core');

    const [user] = await db
      .insert(users)
      .values({
        organizationId,
        emailHash: `bootstrap-seed-${Date.now()}`,
        encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
        isActive: true,
        isVerified: true
      })
      .returning();

    if (!user) {
      throw new Error('Failed to seed bootstrap user');
    }

    await createTestUserTenant(server.app, user.id, tenantId, 'tenant_owner', true);
    await db.insert(userRoles).values({
      userId: user.id,
      role: 'system_owner',
      assignedBy: null
    });

    const response = await server.request({
      method: 'GET',
      url: '/v1/setup/status'
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      initialized: true,
      systemOwnerExists: true,
      installAllowed: false
    });
  });

  it('creates the initial organization, owner membership, identity, and system role', async () => {
    const runId = createRunId();
    const email = `bootstrap.owner.${runId}@example.com`;
    const organizationSlug = `bootstrap-org-${runId}`;
    const { organizations, eq } = await import('@package/db-core');

    const response = await server.request({
      method: 'POST',
      url: '/v1/setup/install',
      body: {
        email,
        password: 'StrongPassword123!',
        displayName: 'Platform Owner',
        organizationName: `Bootstrap Org ${runId}`,
        organizationSlug,
        firstName: 'Platform',
        lastName: 'Owner'
      }
    });

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      success: true,
      requiresLogin: true
    });

    const created = await authRepository.findWithOrganizationByEmail(email);
    expect(created).not.toBeNull();

    const { userIdentities, userRoles, userTenants, and } = await import('@package/db-core');

    if (!created) {
      throw new Error('Expected bootstrap-created user');
    }

    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, created.user.organizationId!))
      .limit(1);
    const [identity] = await db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, created.user.id))
      .limit(1);
    const [systemRole] = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, created.user.id), eq(userRoles.role, 'system_owner')))
      .limit(1);
    const [tenantMembership] = await db
      .select()
      .from(userTenants)
      .where(eq(userTenants.userId, created.user.id))
      .limit(1);

    expect(organization?.ownerId).toBe(created.user.id);
    expect(identity?.providerUid).toBe(`bootstrap-user-${email.toLowerCase()}`);
    expect(systemRole).toBeDefined();
    expect(tenantMembership?.role).toBe('tenant_owner');
    expect(tenantMembership?.isDefault).toBe(true);
  });

  it('rejects installation when the owner email already exists', async () => {
    const runId = createRunId();
    const existingEmail = `bootstrap.existing.${runId}@example.com`;
    const { organizationId } = await createTestOrganization(server.app, 'Existing Seed');
    const { users } = await import('@package/db-core');

    await db.insert(users).values({
      organizationId,
      emailHash: createHash('sha256').update(existingEmail.trim().toLowerCase()).digest('hex'),
      encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
      isActive: true,
      isVerified: true
    });

    const response = await server.request({
      method: 'POST',
      url: '/v1/setup/install',
      body: {
        email: existingEmail,
        password: 'StrongPassword123!',
        displayName: 'Duplicate Owner',
        organizationName: `Duplicate Bootstrap ${runId}`,
        organizationSlug: `bootstrap-duplicate-${runId}`
      }
    });

    expect(response.status).toBe(409);

    const matchingUsers = await authRepository.findWithOrganizationByEmail(existingEmail);
    expect(matchingUsers?.organization.id).toBe(organizationId);
  });

  it('rejects installation after the system is initialized', async () => {
    const firstRunId = createRunId();
    const firstEmail = `bootstrap.first.${firstRunId}@example.com`;
    await server.request({
      method: 'POST',
      url: '/v1/setup/install',
      body: {
        email: firstEmail,
        password: 'StrongPassword123!',
        displayName: 'First Owner',
        organizationName: `Bootstrap First ${firstRunId}`,
        organizationSlug: `bootstrap-first-${firstRunId}`
      }
    });

    const secondRunId = createRunId();
    const secondResponse = await server.request({
      method: 'POST',
      url: '/v1/setup/install',
      body: {
        email: `bootstrap.second.${secondRunId}@example.com`,
        password: 'StrongPassword123!',
        displayName: 'Second Owner',
        organizationName: `Bootstrap Second ${secondRunId}`,
        organizationSlug: `bootstrap-second-${secondRunId}`
      }
    });

    expect(secondResponse.status).toBe(409);
  });

  it('allows only one concurrent installation attempt to succeed', async () => {
    const authServiceInternals = authService as unknown as AuthServiceInternals;
    jest
      .spyOn(authServiceInternals, 'provisionGcpUserSync')
      .mockImplementationOnce(async (email: string) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return `bootstrap-user-${email.toLowerCase()}`;
      });

    const runIdA = createRunId();
    const runIdB = createRunId();
    const requestA = server.request({
      method: 'POST',
      url: '/v1/setup/install',
      body: {
        email: `bootstrap.concurrent.a.${runIdA}@example.com`,
        password: 'StrongPassword123!',
        displayName: 'Concurrent A',
        organizationName: `Concurrent A ${runIdA}`,
        organizationSlug: `bootstrap-concurrent-a-${runIdA}`
      }
    });
    const requestB = server.request({
      method: 'POST',
      url: '/v1/setup/install',
      body: {
        email: `bootstrap.concurrent.b.${runIdB}@example.com`,
        password: 'StrongPassword123!',
        displayName: 'Concurrent B',
        organizationName: `Concurrent B ${runIdB}`,
        organizationSlug: `bootstrap-concurrent-b-${runIdB}`
      }
    });

    const results = await Promise.all([requestA, requestB]);
    const statuses = results.map((result) => result.status).sort((a, b) => a - b);

    expect(statuses).toEqual([201, 409]);
  });
});
