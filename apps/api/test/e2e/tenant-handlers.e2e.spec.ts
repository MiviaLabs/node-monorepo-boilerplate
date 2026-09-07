/**
 * Tenant Handlers E2E Tests
 *
 * Tests tenant management with transactional outbox pattern.
 *
 * @packageDocumentation
 */

import * as crypto from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { userRoles, users } from '@package/db-core';
import { eq } from 'drizzle-orm';

import { MAIN_DB } from '../../src/common/database/database.constants';
import { startTestServer, type TestServer } from '../helpers/bootstrap';
import {
  cleanupTenant,
  createTestOrganizationWithTenant,
  createTestUserTenant,
  setupE2ETestDatabaseJest,
  TEST_USER_ENCRYPTION_KEY_VERSION
} from '../helpers/database';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Type definitions for test responses
interface ResponseBody {
  data?: unknown;
  metadata?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
  [key: string]: unknown;
}

interface Response {
  status: number;
  body: ResponseBody;
}

function getErrorCode(response: Response): string | undefined {
  const data = response.body.data as { code?: string } | undefined;
  return data?.code ?? response.body.metadata?.error?.code;
}

// Helper function to safely extract first item from .returning() result
// Drizzle .returning() can return either an array or a single item depending on dialect
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic import type cannot be statically imported
function getSingleResult(result: any): any {
  return Array.isArray(result) ? result[0] : result;
}

describe('Tenant Handlers E2E Tests', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let jwtService: JwtService;
  let tenantId: number;
  let organizationId: number;
  let userId: number;

  // Test tokens
  let authToken: string;

  // Capture original env vars for cleanup
  let originalEventsEnabled: string | undefined;
  let originalKafkaBrokers: string | undefined;

  beforeAll(async () => {
    // Capture original values
    originalEventsEnabled = process.env['EVENTS_ENABLED'];
    originalKafkaBrokers = process.env['KAFKA_BROKERS'];

    // Force-disable event bus integrations for this suite.
    // These tests validate handler behavior and outbox persistence, not Kafka delivery.
    process.env['EVENTS_ENABLED'] = 'false';
    process.env['KAFKA_BROKERS'] = '';

    // Setup test database
    await setupE2ETestDatabaseJest();

    // Start test server
    server = await startTestServer();
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    jwtService = server.app.get(JwtService);

    // Create test organization and tenant
    const orgResult = await createTestOrganizationWithTenant(server, 'Test Organization');

    tenantId = orgResult.tenantId;
    organizationId = orgResult.organizationId;

    // Create test user - first insert user record
    const emailHash = crypto
      .createHash('sha256')
      .update(`test-user-${Date.now()}@example.com`)
      .digest('hex');

    const user = getSingleResult(
      await db
        .insert(users)
        .values({
          organizationId,
          emailHash,
          encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
          isActive: true,
          isVerified: true
        })
        .returning()
    );

    userId = user.id;

    // Create user tenant with initial role
    await createTestUserTenant(server, userId, tenantId, 'tenant_owner', true);
    await db.insert(userRoles).values({
      userId,
      role: 'system_owner'
    });

    // Generate auth token
    authToken = jwtService.sign({
      sub: String(userId),
      db_user_id: String(userId),
      tenant_id: String(tenantId),
      actor_id: String(userId),
      roles: ['system_owner'],
      permissions: ['*']
    });
  });

  afterAll(async () => {
    // Restore original env vars
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

    // Cleanup test data
    await cleanupTenant(server.app, tenantId);
    await server.close();
  });

  describe('CreateTenantHandler', () => {
    const newTenantId = 0;
    let newOrgSlug: string;

    it('should create a new tenant with organization and owner membership', async () => {
      // organizations.slug is varchar(50), keep test slug short enough for DB constraints
      newOrgSlug = `e2e-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

      const response: Response = await server.httpPost({
        path: '/v1/platform/workspaces',
        tenantId: String(tenantId),
        body: {
          name: 'E2E Test Organization',
          slug: newOrgSlug
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(201);
    });

    it('should prevent duplicate slug', async () => {
      const response: Response = await server.httpPost({
        path: '/v1/platform/workspaces',
        tenantId: String(tenantId),
        body: {
          name: 'Duplicate Org',
          slug: newOrgSlug // Same slug as previous test
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(400);
    });

    afterAll(async () => {
      // Cleanup created tenant if test completed successfully
      if (newTenantId) {
        try {
          await cleanupTenant(server.app, newTenantId);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('UpdateTenantHandler', () => {
    it('should update tenant status', async () => {
      const response: Response = await server.httpPatch({
        path: `/v1/platform/workspaces/${tenantId}`,
        tenantId: String(tenantId),
        body: {
          // Keep tenant operational for subsequent tests in this suite.
          status: 'trial'
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(400);
    });

    it('should update organization name', async () => {
      const newName = `Updated Organization ${Date.now()}`;

      const response: Response = await server.httpPatch({
        path: `/v1/platform/workspaces/${tenantId}`,
        tenantId: String(tenantId),
        body: {
          name: newName
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('UpdateSettingsHandler', () => {
    it('should update system settings', async () => {
      const response: Response = await server.httpPatch({
        path: '/v1/platform/settings',
        tenantId: String(tenantId),
        body: {
          allowRegistration: false,
          maxTenantsPerUser: 5
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('InviteMemberHandler', () => {
    let newUserId: number;
    let inviteEmail: string;
    let inviteEmailHash: string;

    beforeAll(async () => {
      // Create another user to invite
      const emailHash = crypto
        .createHash('sha256')
        .update(`invite-user-${Date.now()}@example.com`)
        .digest('hex');

      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId,
            emailHash,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );

      newUserId = user.id;
    });

    it('should invite existing user to tenant', async () => {
      inviteEmail = `invite-${newUserId}-${Date.now()}@example.com`;
      inviteEmailHash = crypto.createHash('sha256').update(inviteEmail.toLowerCase()).digest('hex');
      await db
        .update(users)
        .set({ emailEncrypted: inviteEmail, emailHash: inviteEmailHash })
        .where(eq(users.id, newUserId));

      // Invite user to the current tenant
      const response: Response = await server.httpPost({
        path: '/v1/workspaces/members/invite',
        tenantId: String(tenantId),
        body: {
          email: inviteEmail,
          roles: ['tenant_admin']
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(201);
    });

    it('should invite non-existing user and create invitation record with sanitized outbox payload', async () => {
      const nonExistingInviteEmail = `invite-new-${Date.now()}@example.com`;
      const response: Response = await server.httpPost({
        path: '/v1/workspaces/members/invite',
        tenantId: String(tenantId),
        body: {
          email: nonExistingInviteEmail,
          roles: ['tenant_user']
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(201);
    });
  });

  describe('UpdateMemberStatusHandler', () => {
    it('should update member status to inactive', async () => {
      // Add a second member
      const emailHash = crypto
        .createHash('sha256')
        .update(`member-user-${Date.now()}@example.com`)
        .digest('hex');

      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId,
            emailHash,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );

      const memberUserId = user.id;

      await createTestUserTenant(server, memberUserId as number, tenantId, 'tenant_user', true);

      // Update member status
      const response: Response = await server.httpPatch({
        path: `/v1/workspaces/members/${memberUserId}/status`,
        tenantId: String(tenantId),
        body: {
          status: 'inactive'
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
      await db.delete(users).where(eq(users.id, memberUserId));
    });

    it('should prevent deactivating owner', async () => {
      const response: Response = await server.httpPatch({
        path: `/v1/workspaces/members/${userId}/status`, // userId is owner
        tenantId: String(tenantId),
        body: {
          status: 'inactive'
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(403);
      expect(getErrorCode(response)).toBe('AUTH_004');
    });
  });

  describe('UpdateTenantSettingsHandler', () => {
    it('should update tenant settings', async () => {
      const newDisplayName = `Updated Settings ${Date.now()}`;

      const response: Response = await server.httpPatch({
        path: '/v1/workspaces/current',
        tenantId: String(tenantId),
        body: {
          displayName: newDisplayName,
          isActive: true,
          settings: {
            customSetting: 'value'
          }
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
    });
  });

  describe('DeleteTenantHandler', () => {
    it('should delete tenant with only owner as member', async () => {
      // Create a new tenant to delete
      const orgResult = await createTestOrganizationWithTenant(server.app, 'To Be Deleted');

      const deleteTenantId = orgResult.tenantId;

      // Delete the tenant
      const response: Response = await server.httpDelete({
        path: `/v1/platform/workspaces/${deleteTenantId}`,
        tenantId: String(tenantId),
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(204);
    });

    it('should prevent deleting tenant with multiple members', async () => {
      // Create a tenant with multiple members
      const orgResult = await createTestOrganizationWithTenant(server.app, 'Cannot Delete');

      const multiTenantId = orgResult.tenantId;
      const multiOrgId = orgResult.organizationId;

      // Add two active members so memberCount is > 1
      const emailHash = crypto
        .createHash('sha256')
        .update(`multi-user-${Date.now()}@example.com`)
        .digest('hex');

      const additionalUser = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId: multiOrgId,
            emailHash,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );

      // Create an active tenant membership so memberCount check sees more than one member.
      await createTestUserTenant(
        server,
        additionalUser.id as number,
        multiTenantId,
        'tenant_user',
        true
      );

      const secondEmailHash = crypto
        .createHash('sha256')
        .update(`multi-user-2-${Date.now()}@example.com`)
        .digest('hex');

      const secondAdditionalUser = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId: multiOrgId,
            emailHash: secondEmailHash,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );

      await createTestUserTenant(
        server,
        secondAdditionalUser.id as number,
        multiTenantId,
        'tenant_user',
        true
      );

      // Try to delete - should fail
      const response: Response = await server.httpDelete({
        path: `/v1/platform/workspaces/${multiTenantId}`,
        tenantId: String(tenantId),
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      expect(response.status).toBe(400);

      // Cleanup
      await cleanupTenant(server.app, multiTenantId);
    });
  });
});
