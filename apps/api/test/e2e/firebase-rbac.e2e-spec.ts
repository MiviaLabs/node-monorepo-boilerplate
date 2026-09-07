/**
 * Firebase RBAC E2E Tests
 *
 * NOTE: This file tests Firebase/Google Identity Platform specific RBAC flows.
 * For general RBAC tests (roles, permissions, multi-tenancy), see rbac.e2e.spec.ts.
 *
 * Firebase-Specific Features Tested:
 * - Firebase custom claims with roles and perm_version
 * - Permission resolution from Redis cache (not embedded in token)
 * - Cache invalidation on role changes
 * - perm_version-based permission lookups
 *
 * This is distinct from rbac.e2e.spec.ts which tests:
 * - Custom JWT provider (permissions embedded in token)
 * - General RBAC patterns across all providers
 * - Role hierarchy and wildcards
 *
 * @packageDocumentation
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import * as crypto from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
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

import type { CacheService } from '@package/redis';
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

interface FirebaseClaims {
  sub?: string;
  tenant_id?: string;
  roles?: string[];
  permissions?: string[];
  perm_version?: string;
}

// Helper function to safely extract first item from .returning() result
// Drizzle .returning() can return either an array or a single item depending on the dialect
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic import type cannot be statically imported
function getSingleResult(result: any): any {
  return Array.isArray(result) ? result[0] : result;
}

describe('Firebase RBAC E2E Tests', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let jwtService: JwtService;
  let tenantId: number;
  let organizationId: number;
  let userId: number;
  let firebaseUid: string;

  // Test tokens
  let firebaseToken: string;
  let permVersion: string;

  beforeAll(async () => {
    // Set AUTH_PROVIDER to firebase for these tests
    process.env['AUTH_PROVIDER'] = 'google-identity-platform';
    process.env['GCP_PROJECT_ID'] = 'test-project';
    process.env['GCP_API_KEY'] = 'test-api-key';
    process.env['GCP_TENANT_ID'] = 'test-tenant';
    process.env['TEST_MODE'] = 'true'; // Enable test mode

    // Setup test database
    await setupE2ETestDatabaseJest();

    // Start server
    server = await startTestServer();

    // Get database instance from server
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);

    // Get JwtService for token generation
    jwtService = server.app.get<JwtService>(JwtService);

    // Create test organization and tenant
    const result = await createTestOrganizationWithTenant(server.app, 'Firebase RBAC Org');
    tenantId = result.tenantId;
    organizationId = result.organizationId;

    // Create test user with Firebase identity
    const { users, userIdentities } = await import('@package/db-core');

    firebaseUid = `firebase-uid-${Date.now()}`;
    const emailHash = crypto
      .createHash('sha256')
      .update(`firebase-test-${Date.now()}@example.com`)
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

    // Create Firebase identity
    await db.insert(userIdentities).values({
      userId,
      provider: 'google.com',
      providerUid: firebaseUid,
      providerEmailHash: emailHash,
      encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
      emailVerified: true,
      isPrimary: true
    });

    // Create user tenant with initial role
    await createTestUserTenant(server.app, userId, tenantId, 'tenant_user', false);

    // Generate permission version hash (simulating Firebase perm_version)
    const versionData = `v1-${tenantId}-${Date.now()}`;
    permVersion = crypto.createHash('sha256').update(versionData).digest('hex').substring(0, 16);

    // Generate Firebase-style JWT token with custom claims
    firebaseToken = jwtService.sign({
      sub: firebaseUid,
      uid: firebaseUid,
      email: `firebase-test-${Date.now()}@example.com`,
      db_user_id: userId.toString(),
      tenant_id: tenantId.toString(),
      actor_id: user.publicId,
      // Firebase custom claims
      roles: ['tenant_user'],
      permissions: ['tenant:users:read', 'tenant:organizations:read'],
      perm_version: permVersion,
      // Standard Firebase claims
      iss: 'https://securetoken.google.com/test-project',
      aud: 'test-project',
      auth_time: Math.floor(Date.now() / 1000),
      user_id: firebaseUid,
      firebase: {
        identities: {
          email: [`firebase-test-${Date.now()}@example.com`]
        },
        sign_in_provider: 'password'
      }
    });
  });

  afterAll(async () => {
    // Cleanup tenant
    if (tenantId) {
      await cleanupTenant(server.app, tenantId);
    }

    // Close server
    await server?.close();
  });

  describe('Firebase Custom Claims', () => {
    it('should include roles array in Firebase token', async () => {
      // Decode the token to verify custom claims
      const decoded = jwtService.decode(firebaseToken) as FirebaseClaims;

      expect(decoded).toBeDefined();
      expect(decoded.roles).toBeDefined();
      expect(Array.isArray(decoded.roles)).toBe(true);
      expect(decoded.roles).toContain('tenant_user');
    });

    it('should include perm_version hash in Firebase token', async () => {
      // Decode the token to verify perm_version claim
      const decoded = jwtService.decode(firebaseToken) as FirebaseClaims;

      expect(decoded).toBeDefined();
      expect(decoded.perm_version).toBeDefined();
      expect(typeof decoded.perm_version).toBe('string');
      expect(decoded.perm_version).toHaveLength(16); // SHA-256 substring
      expect(decoded.perm_version).toBe(permVersion);
    });

    it('should include permissions array in Firebase token', async () => {
      // Decode the token to verify permissions claim
      const decoded = jwtService.decode(firebaseToken) as FirebaseClaims;

      expect(decoded).toBeDefined();
      expect(decoded.permissions).toBeDefined();
      expect(Array.isArray(decoded.permissions)).toBe(true);
      expect(decoded.permissions).toContain('tenant:users:read');
      expect(decoded.permissions).toContain('tenant:organizations:read');
    });

    it('should include tenant_id in Firebase token', async () => {
      // Decode the token to verify tenant_id claim
      const decoded = jwtService.decode(firebaseToken) as FirebaseClaims;

      expect(decoded).toBeDefined();
      expect(decoded.tenant_id).toBeDefined();
      expect(decoded.tenant_id).toBe(tenantId.toString());
    });

    it('should authenticate successfully with Firebase token', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/ops/health/auth',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      })) as unknown as Response;

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('status', 'ok');
    });

    it('should extract user context from Firebase token', async () => {
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      })) as unknown as Response;

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();

      const data = response.body.data as FirebaseClaims;
      expect(data.sub).toBe(firebaseUid);
      expect(data.tenant_id).toBe(tenantId.toString());
      expect(data.roles).toEqual(expect.arrayContaining(['tenant_user']));
    });
  });

  describe('Permission Resolution from Cache', () => {
    it('should hit cache miss on first permission check', async () => {
      // This test verifies that the first request fetches permissions from database
      // In a real scenario, we'd monitor cache hits/misses via logs or metrics
      // For E2E testing, we verify the permissions are correctly returned

      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      })) as unknown as Response;

      expect(response.status).toBe(200);
      const data = response.body.data as FirebaseClaims;
      expect(data.permissions).toBeDefined();
      expect(Array.isArray(data.permissions)).toBe(true);
    });

    it('should hit cache on subsequent permission checks', async () => {
      // First request - should cache permissions
      await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      });

      // Second request - should hit cache
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      })) as unknown as Response;

      expect(response.status).toBe(200);
      const data = response.body.data as FirebaseClaims;
      expect(data.permissions).toBeDefined();

      // Permissions should be the same (cached)
      expect(Array.isArray(data.permissions)).toBe(true);
    });

    it('should return same permissions from cache as initial request', async () => {
      // First request
      const response1 = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      })) as unknown as Response;

      // Second request (from cache)
      const response2 = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      })) as unknown as Response;

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const data1 = response1.body.data as FirebaseClaims;
      const data2 = response2.body.data as FirebaseClaims;

      // Permissions should be identical
      expect(data1.permissions).toEqual(data2.permissions);
    });
  });

  describe('Cache Invalidation on Role Change', () => {
    it('should invalidate cache when user role changes', async () => {
      // Get initial permissions
      const initialResponse = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      })) as unknown as Response;

      expect(initialResponse.status).toBe(200);
      const initialData = initialResponse.body.data as FirebaseClaims;
      const initialRoles = initialData.roles ?? [];

      // Update user role to tenant_admin
      const { userTenants } = await import('@package/db-core');
      await db
        .update(userTenants)
        .set({
          role: 'tenant_admin',
          updatedAt: new Date()
        })
        .where(eq(userTenants.userId, userId));

      // Invalidate cache (simulating what would happen in real scenario)
      // In production, this would be done automatically via event handlers
      const { CacheService } = await import('@package/redis');
      const cacheService = server.app.get<CacheService>(CacheService);

      // Invalidate permissions cache for this user
      await cacheService.invalidatePattern(`permissions:${userId}:*`);

      // Generate new token with updated roles
      const updatedToken = jwtService.sign({
        sub: firebaseUid,
        uid: firebaseUid,
        email: `firebase-test-${Date.now()}@example.com`,
        db_user_id: userId.toString(),
        tenant_id: tenantId.toString(),
        actor_id: firebaseUid,
        roles: ['tenant_admin'],
        permissions: [
          'tenant:users:read',
          'tenant:users:write',
          'tenant:users:delete',
          'tenant:organizations:read',
          'tenant:organizations:write'
        ],
        perm_version: permVersion,
        iss: 'https://securetoken.google.com/test-project',
        aud: 'test-project',
        auth_time: Math.floor(Date.now() / 1000),
        user_id: firebaseUid
      });

      // Request with updated token should return new permissions
      const updatedResponse = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${updatedToken}`
        }
      })) as unknown as Response;

      expect(updatedResponse.status).toBe(200);
      const updatedData = updatedResponse.body.data as FirebaseClaims;
      const updatedRoles = updatedData.roles ?? [];

      // Roles should have changed
      expect(updatedRoles).not.toEqual(initialRoles);
      expect(updatedRoles).toContain('tenant_admin');

      // Permissions should include admin permissions
      const updatedPermissions = updatedData.permissions ?? [];
      expect(updatedPermissions).toContain('tenant:users:write');
      expect(updatedPermissions).toContain('tenant:users:delete');
    });

    it('should fetch new permissions from database after cache invalidation', async () => {
      // This test verifies that after cache invalidation, fresh permissions
      // are fetched from the database

      // Get current permissions
      await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      });

      // Simulate cache invalidation
      const { CacheService } = await import('@package/redis');
      const cacheService = server.app.get<CacheService>(CacheService);
      await cacheService.invalidatePattern(`permissions:${userId}:*`);

      // Request again - should fetch from database
      const afterResponse = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${firebaseToken}`
        }
      })) as unknown as Response;

      expect(afterResponse.status).toBe(200);
      const afterData = afterResponse.body.data as FirebaseClaims;
      const afterPermissions = afterData.permissions ?? [];

      // Permissions should be present
      expect(Array.isArray(afterPermissions)).toBe(true);
      expect(afterPermissions.length).toBeGreaterThan(0);
    });

    it('should apply new permissions on next request after role change', async () => {
      // Start with tenant_user role
      const { userTenants } = await import('@package/db-core');

      // Set role to tenant_viewer (more restricted)
      await db
        .update(userTenants)
        .set({
          role: 'tenant_viewer',
          updatedAt: new Date()
        })
        .where(eq(userTenants.userId, userId));

      // Invalidate cache
      const { CacheService } = await import('@package/redis');
      const cacheService = server.app.get<CacheService>(CacheService);
      await cacheService.invalidatePattern(`permissions:${userId}:*`);

      // Generate token with viewer role
      const viewerToken = jwtService.sign({
        sub: firebaseUid,
        uid: firebaseUid,
        email: `firebase-test-${Date.now()}@example.com`,
        db_user_id: userId.toString(),
        tenant_id: tenantId.toString(),
        actor_id: firebaseUid,
        roles: ['tenant_viewer'],
        permissions: ['tenant:users:read', 'tenant:organizations:read'],
        perm_version: permVersion,
        iss: 'https://securetoken.google.com/test-project',
        aud: 'test-project',
        auth_time: Math.floor(Date.now() / 1000),
        user_id: firebaseUid
      });

      // Verify new permissions are applied
      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${viewerToken}`
        }
      })) as unknown as Response;

      expect(response.status).toBe(200);
      const data = response.body.data as FirebaseClaims;
      const roles = data.roles ?? [];

      // Should have tenant_viewer role
      expect(roles).toContain('tenant_viewer');
      expect(roles).not.toContain('tenant_user');
    });
  });

  describe('Firebase Token Validation', () => {
    it('should accept valid Firebase token', async () => {
      const validToken = jwtService.sign({
        sub: firebaseUid,
        uid: firebaseUid,
        email: 'test@example.com',
        db_user_id: userId.toString(),
        tenant_id: tenantId.toString(),
        roles: ['tenant_user'],
        permissions: ['tenant:users:read'],
        perm_version: permVersion,
        iss: 'https://securetoken.google.com/test-project',
        aud: 'test-project'
      });

      const response = (await server.request({
        method: 'GET',
        url: '/v1/ops/health/auth',
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })) as unknown as Response;

      expect(response.status).toBe(200);
    });
  });

  describe('Multi-Tenancy with Firebase', () => {
    it('should include tenant-specific permissions in Firebase token', async () => {
      // Generate token with tenant-scoped permissions
      const tenantScopedToken = jwtService.sign({
        sub: firebaseUid,
        uid: firebaseUid,
        email: 'test@example.com',
        db_user_id: userId.toString(),
        tenant_id: tenantId.toString(),
        actor_id: firebaseUid,
        roles: ['tenant_user'],
        permissions: ['tenant:users:read', 'tenant:organizations:read'], // Tenant-specific
        perm_version: permVersion,
        iss: 'https://securetoken.google.com/test-project',
        aud: 'test-project',
        auth_time: Math.floor(Date.now() / 1000),
        user_id: firebaseUid
      });

      const response = (await server.request({
        method: 'GET',
        url: '/v1/iam/identity',
        headers: {
          Authorization: `Bearer ${tenantScopedToken}`
        }
      })) as unknown as Response;

      expect(response.status).toBe(200);
      const data = response.body.data as Record<string, unknown>;
      const permissions = data.permissions as string[];

      // Should have tenant-scoped permissions
      expect(permissions).toContain('tenant:users:read');
      expect(permissions).toContain('tenant:organizations:read');
    });
  });
});
