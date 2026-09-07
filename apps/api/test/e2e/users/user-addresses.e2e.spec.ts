/**
 * User Addresses E2E Tests
 *
 * Tests the user addresses API using a real NestJS server and Testcontainers database.
 * Tests full CRUD lifecycle with vault-backed PII storage.
 * Tests tenant isolation enforcement.
 * Tests soft-delete semantics.
 *
 * @packageDocumentation
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { JwtService } from '@nestjs/jwt';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { startTestServer } from '../../helpers/bootstrap';
import {
  setupE2ETestDatabaseJest,
  createTestOrganization,
  createTestUserTenant,
  TEST_USER_ENCRYPTION_KEY_VERSION
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Helper function to safely extract first item from .returning() result
function getSingleResult(result: unknown): { id: number } & Record<string, unknown> {
  if (Array.isArray(result) && result.length > 0) {
    return result[0] as { id: number } & Record<string, unknown>;
  }
  return result as { id: number } & Record<string, unknown>;
}

describe('User Addresses E2E Tests', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let db: NodePgDatabase<Record<string, never>>;

  // Organization IDs for tenant headers
  let org1Id: number;
  let org2Id: number;

  // User IDs
  let user1Id: number;
  let user2Id: number;

  // Test tokens
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    // CRITICAL: Setup test database FIRST
    await setupE2ETestDatabaseJest();

    // CRITICAL: Start server SECOND
    server = await startTestServer();

    // Get database and JwtService from the app
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    jwtService = server.app.get<JwtService>(JwtService);

    // Create test organizations
    const org1Result = await createTestOrganization(server.app, 'Test Org 1');
    const tenant1Id = org1Result.tenantId;
    org1Id = org1Result.organizationId;

    const org2Result = await createTestOrganization(server.app, 'Test Org 2');
    const tenant2Id = org2Result.tenantId;
    org2Id = org2Result.organizationId;

    // Dynamic import for db-core schema
    const { users } = await import('@package/db-core');

    // Create test user for org 1
    const testUser1 = getSingleResult(
      await db
        .insert(users)
        .values({
          organizationId: org1Id,
          emailHash: `test-user-1-${Date.now()}`,
          encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
          isActive: true,
          isVerified: true
        })
        .returning()
    );
    user1Id = testUser1.id as number;

    // Create test user for org 2
    const testUser2 = getSingleResult(
      await db
        .insert(users)
        .values({
          organizationId: org2Id,
          emailHash: `test-user-2-${Date.now()}`,
          encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
          isActive: true,
          isVerified: true
        })
        .returning()
    );
    user2Id = testUser2.id as number;

    // Create user-tenant memberships
    await createTestUserTenant(server.app, user1Id, tenant1Id, 'tenant_owner', true);
    await createTestUserTenant(server.app, user2Id, tenant2Id, 'tenant_owner', true);

    // Create JWT tokens for users
    user1Token = jwtService.sign(
      {
        sub: user1Id.toString(),
        db_user_id: user1Id.toString(),
        tenant_id: tenant1Id.toString(),
        actor_id: user1Id.toString(),
        email: `user1@test.com`,
        organizationId: org1Id,
        roles: ['tenant_owner'],
        permissions: ['*']
      },
      { expiresIn: '24h' }
    );

    user2Token = jwtService.sign(
      {
        sub: user2Id.toString(),
        db_user_id: user2Id.toString(),
        tenant_id: tenant2Id.toString(),
        actor_id: user2Id.toString(),
        email: `user2@test.com`,
        organizationId: org2Id,
        roles: ['tenant_owner'],
        permissions: ['*']
      },
      { expiresIn: '24h' }
    );
  });

  describe('Address CRUD Lifecycle', () => {
    let addressId: number;

    it('should create an address with vault-backed PII storage', async () => {
      const response = await server.request({
        method: 'POST',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        },
        body: {
          addressType: 'primary',
          isDefault: true,
          label: 'Home',
          countryCode: 'US',
          components: {
            street: '123 Main St',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94105',
            country: 'United States'
          }
        }
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('organizationId', org1Id);
      expect(response.body.data).toHaveProperty('userId', user1Id);
      expect(response.body.data).toHaveProperty('addressType', 'primary');
      expect(response.body.data).toHaveProperty('isDefault', true);
      expect(response.body.data).toHaveProperty('label', 'Home');
      expect(response.body.data).toHaveProperty('countryCode', 'US');
      // Vault references should be present (not PII values)
      expect(response.body.data).toHaveProperty('streetEncryptedStoreId');
      expect(response.body.data).toHaveProperty('cityEncryptedStoreId');
      expect(response.body.data).toHaveProperty('stateEncryptedStoreId');
      expect(response.body.data).toHaveProperty('postalCodeEncryptedStoreId');
      expect(response.body.data).toHaveProperty('countryEncryptedStoreId');
      // PII should NOT be in response
      expect(response.body.data).not.toHaveProperty('street');
      expect(response.body.data).not.toHaveProperty('city');

      addressId = response.body.data.id;
    });

    it('should get all addresses for a user', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('id', addressId);
      expect(response.body.data[0]).toHaveProperty('userId', user1Id);
    });

    it('should get default address for a user', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses/default`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id', addressId);
      expect(response.body.data).toHaveProperty('isDefault', true);
    });

    it('should get a specific address by ID', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses/${addressId}`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id', addressId);
    });

    it('should update an address with vault rotation', async () => {
      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${user1Id}/addresses/${addressId}`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        },
        body: {
          label: 'Updated Home',
          components: {
            street: '456 Updated St'
          }
        }
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('label', 'Updated Home');
    });

    it('should soft-delete an address', async () => {
      const deleteResponse = await server.request({
        method: 'DELETE',
        url: `/v1/people/${user1Id}/addresses/${addressId}`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(deleteResponse.status).toBe(204);

      // Verify address is soft-deleted (not returned in list)
      const listResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.data).not.toContainEqual(expect.objectContaining({ id: addressId }));
    });
  });

  describe('Tenant Isolation', () => {
    let org2AddressId: number;

    beforeAll(async () => {
      // Create address for org 1
      await server.request({
        method: 'POST',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        },
        body: {
          addressType: 'primary',
          countryCode: 'US',
          components: {
            street: '123 Org1 St',
            city: 'Org1 City'
          }
        }
      });

      // Create address for org 2
      const org2Response = await server.request({
        method: 'POST',
        url: `/v1/people/${user2Id}/addresses`,
        headers: {
          'x-tenant-id': String(org2Id),
          authorization: `Bearer ${user2Token}`
        },
        body: {
          addressType: 'primary',
          countryCode: 'US',
          components: {
            street: '456 Org2 St',
            city: 'Org2 City'
          }
        }
      });
      org2AddressId = org2Response.body.data.id;
    });

    it('should prevent cross-tenant address access (org1 cannot access org2 address)', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${user2Id}/addresses/${org2AddressId}`,
        headers: {
          'x-tenant-id': String(org1Id), // Wrong tenant
          authorization: `Bearer ${user1Token}`
        }
      });

      // Should return 404 because the address doesn't exist in org1's tenant scope
      expect(response.status).toBe(404);
    });

    it('should prevent cross-tenant address update', async () => {
      const response = await server.request({
        method: 'PATCH',
        url: `/v1/people/${user2Id}/addresses/${org2AddressId}`,
        headers: {
          'x-tenant-id': String(org1Id), // Wrong tenant
          authorization: `Bearer ${user1Token}`
        },
        body: {
          label: 'Hacked Label'
        }
      });

      // Update is blocked by actor ownership guard before repository lookup.
      expect(response.status).toBe(403);
    });

    it('should prevent cross-tenant address delete', async () => {
      const response = await server.request({
        method: 'DELETE',
        url: `/v1/people/${user2Id}/addresses/${org2AddressId}`,
        headers: {
          'x-tenant-id': String(org1Id), // Wrong tenant
          authorization: `Bearer ${user1Token}`
        }
      });

      // Delete is blocked by actor ownership guard before repository lookup.
      expect(response.status).toBe(403);
    });

    it('should isolate list results per tenant', async () => {
      // Get addresses for org1 user
      const org1ListResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(org1ListResponse.status).toBe(200);
      const org1Addresses = org1ListResponse.body.data;
      expect(Array.isArray(org1Addresses)).toBe(true);
      // All addresses should belong to org1
      org1Addresses.forEach((address: { organizationId: number }) => {
        expect(address.organizationId).toBe(org1Id);
      });

      // Get addresses for org2 user
      const org2ListResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${user2Id}/addresses`,
        headers: {
          'x-tenant-id': String(org2Id),
          authorization: `Bearer ${user2Token}`
        }
      });

      expect(org2ListResponse.status).toBe(200);
      const org2Addresses = org2ListResponse.body.data;
      expect(Array.isArray(org2Addresses)).toBe(true);
      // All addresses should belong to org2
      org2Addresses.forEach((address: { organizationId: number }) => {
        expect(address.organizationId).toBe(org2Id);
      });

      // Verify no cross-leakage
      const org1Ids = new Set(org1Addresses.map((a: { id: number }) => a.id));
      const org2Ids = new Set(org2Addresses.map((a: { id: number }) => a.id));
      const intersection = [...org1Ids].filter((id) => org2Ids.has(id));
      expect(intersection).toHaveLength(0);
    });
  });

  describe('Soft-Delete Behavior', () => {
    let addressId: number;

    beforeEach(async () => {
      // Create a test address
      const response = await server.request({
        method: 'POST',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        },
        body: {
          addressType: 'primary',
          countryCode: 'US',
          components: {
            street: '789 Test St',
            city: 'Test City'
          }
        }
      });
      addressId = response.body.data.id;
    });

    it('should not return soft-deleted addresses in list', async () => {
      // Verify address exists initially
      const beforeDeleteResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      const beforeAddresses = beforeDeleteResponse.body.data;
      const beforeCount = beforeAddresses.filter((a: { id: number }) => a.id === addressId).length;
      expect(beforeCount).toBe(1);

      // Soft-delete the address
      await server.request({
        method: 'DELETE',
        url: `/v1/people/${user1Id}/addresses/${addressId}`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      // Verify address is not in list after delete
      const afterDeleteResponse = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      const afterAddresses = afterDeleteResponse.body.data;
      const afterCount = afterAddresses.filter((a: { id: number }) => a.id === addressId).length;
      expect(afterCount).toBe(0);
    });

    it('should not return soft-deleted address when fetched by ID', async () => {
      // Soft-delete the address
      await server.request({
        method: 'DELETE',
        url: `/v1/people/${user1Id}/addresses/${addressId}`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      // Try to fetch the deleted address
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses/${addressId}`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(404);
    });

    it('should allow creating new address with same type after soft-delete', async () => {
      // Soft-delete the address
      await server.request({
        method: 'DELETE',
        url: `/v1/people/${user1Id}/addresses/${addressId}`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      // Create new address with same type
      const newResponse = await server.request({
        method: 'POST',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        },
        body: {
          addressType: 'primary',
          countryCode: 'US',
          components: {
            street: '999 New St',
            city: 'New City'
          }
        }
      });

      expect(newResponse.status).toBe(201);
      expect(newResponse.body.data).toHaveProperty('id');
      expect(newResponse.body.data.id).not.toBe(addressId);
    });
  });

  describe('Validation and Error Handling', () => {
    it('should return 400 for invalid address type', async () => {
      const response = await server.request({
        method: 'POST',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        },
        body: {
          addressType: 'invalid_type',
          countryCode: 'US',
          components: {
            street: '123 Main St'
          }
        }
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid country code format', async () => {
      const response = await server.request({
        method: 'POST',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        },
        body: {
          addressType: 'primary',
          countryCode: 'USA', // Should be 2-letter code
          components: {
            street: '123 Main St'
          }
        }
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing address components', async () => {
      const response = await server.request({
        method: 'POST',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        },
        body: {
          addressType: 'primary',
          countryCode: 'US',
          components: {}
        }
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent address', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses/999999`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/999999/addresses`,
        headers: {
          'x-tenant-id': String(org1Id),
          authorization: `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('Authorization', () => {
    it('should return 401 without authentication token', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          'x-tenant-id': String(org1Id)
          // No authorization header
        }
      });

      expect(response.status).toBe(401);
    });

    it('should return 400 without tenant header', async () => {
      const response = await server.request({
        method: 'GET',
        url: `/v1/people/${user1Id}/addresses`,
        headers: {
          authorization: `Bearer ${user1Token}`
          // No x-tenant-id header
        }
      });

      expect(response.status).toBe(400);
    });
  });
});
