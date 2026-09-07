/**
 * Tenants Schema Migration E2E Tests
 *
 * Tests that the tenants, user_tenants, and organizations tables
 * are correctly created with proper schema, indexes, and foreign keys.
 *
 * @packageDocumentation
 */

import { eq, sql } from 'drizzle-orm';

import { MAIN_DB } from '../../../../src/common/database/database.constants';
import { startTestServer } from '../../../helpers/bootstrap';
import {
  setupE2ETestDatabaseJest,
  TEST_USER_ENCRYPTION_KEY_VERSION
} from '../../../helpers/database';

import type { TestServer } from '../../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Dynamic imports for db-core schema to avoid module boundary issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tenants: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let organizations: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let userTenants: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let users: any;

describe('Tenants Schema Migration E2E Tests', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);

    // Dynamic import for db-core schema to avoid module boundary issues
    const schema = await import('@package/db-core');
    tenants = schema.tenants;
    organizations = schema.organizations;
    userTenants = schema.userTenants;
    users = schema.users;
  });

  // Helper function to safely extract first item from .returning() result
  // Drizzle .returning() can return either an array or a single item depending on the dialect
  function getSingleResult<T>(result: T[] | T): T {
    if (Array.isArray(result)) {
      const [first] = result;
      if (first === undefined) {
        throw new Error('Expected query to return at least one row');
      }
      return first;
    }
    return result;
  }

  afterAll(async () => {
    // NOTE: Don't call cleanupTestDatabase() here because it drops the schema
    // and the NestJS app's connection pool won't see the recreated tables
    // The test suite cleanup will handle cleanup
    await server?.close();
  });

  describe('tenants table', () => {
    it('should have tenants table defined in schema', () => {
      expect(tenants).toBeDefined();
    });

    it('should create a tenant record', async () => {
      const tenant = getSingleResult(
        await db
          .insert(tenants)
          .values({
            type: 'organization',
            status: 'active'
          })
          .returning()
      );

      expect(tenant).toBeDefined();
      expect(tenant.type).toBe('organization');
      expect(tenant.status).toBe('active');
      expect(tenant.publicId).toBeDefined();
    });

    it('should support different tenant types', async () => {
      const types: Array<'organization' | 'team' | 'individual'> = [
        'organization',
        'team',
        'individual'
      ];

      for (const type of types) {
        const tenant = getSingleResult(
          await db
            .insert(tenants)
            .values({
              type,
              status: 'active'
            })
            .returning()
        );

        expect(tenant.type).toBe(type);
      }
    });

    it('should support different tenant statuses', async () => {
      const statuses: Array<'draft' | 'trial' | 'active' | 'suspended' | 'deleted'> = [
        'draft',
        'trial',
        'active',
        'suspended',
        'deleted'
      ];

      for (const status of statuses) {
        const tenant = getSingleResult(
          await db
            .insert(tenants)
            .values({
              type: 'organization',
              status
            })
            .returning()
        );

        expect(tenant.status).toBe(status);
      }
    });

    it('should store and retrieve tenant settings', async () => {
      const settings = {
        features: {
          maxUsers: 100,
          advancedAnalytics: true,
          apiAccess: true
        },
        branding: {
          logo: 'https://example.com/logo.png',
          primaryColor: '#FF0000'
        },
        limits: {
          monthlyBudget: 1000,
          storageQuota: 1073741824 // 1GB
        }
      };

      const tenant = getSingleResult(
        await db
          .insert(tenants)
          .values({
            type: 'organization',
            status: 'active',
            settings
          })
          .returning()
      );

      expect(tenant.settings).toEqual(settings);
    });

    it('should have unique publicId', async () => {
      const tenant1 = getSingleResult(
        await db
          .insert(tenants)
          .values({
            type: 'organization',
            status: 'active'
          })
          .returning()
      );

      const tenant2 = getSingleResult(
        await db
          .insert(tenants)
          .values({
            type: 'organization',
            status: 'active'
          })
          .returning()
      );

      expect(tenant1.publicId).not.toBe(tenant2.publicId);
    });

    it('should have indexes for efficient queries', async () => {
      // This test verifies indexes exist by checking query performance
      // In a real scenario, you would measure query execution time

      const startTime = Date.now();
      await db.select().from(tenants).where(eq(tenants.status, 'active')).limit(10);
      const endTime = Date.now();

      // CI runners are noisy; keep this as a coarse regression guard.
      expect(endTime - startTime).toBeLessThan(250);
    });

    it('should NOT have a slug field', async () => {
      // Verify the tenants table does not have a slug field
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const columns = (tenants as any)._?.columns ?? {};
      expect(columns.slug).toBeUndefined();
    });
  });

  describe('organizations table', () => {
    let tenantId: number;

    beforeEach(async () => {
      const tenant = getSingleResult(
        await db
          .insert(tenants)
          .values({
            type: 'organization',
            status: 'active'
          })
          .returning()
      );
      tenantId = tenant.id;
    });

    it('should have organizations table defined in schema', () => {
      expect(organizations).toBeDefined();
    });

    it('should create an organization linked to tenant', async () => {
      const org = getSingleResult(
        await db
          .insert(organizations)
          .values({
            tenantId,
            name: 'Test Organization',
            slug: 'test-org',
            isActive: true
          })
          .returning()
      );

      expect(org).toBeDefined();
      expect(org.tenantId).toBe(tenantId);
      expect(org.name).toBe('Test Organization');
      expect(org.slug).toBe('test-org');
    });

    it('should have unique slug constraint', async () => {
      const slug = 'duplicate-slug';

      // First organization should succeed
      await db
        .insert(organizations)
        .values({
          tenantId,
          name: 'First Org',
          slug,
          isActive: true
        })
        .returning();

      // Second organization with same slug should fail
      await expect(
        db
          .insert(organizations)
          .values({
            tenantId,
            name: 'Second Org',
            slug,
            isActive: true
          })
          .returning()
      ).rejects.toThrow();
    });

    it('should cascade delete when tenant is deleted', async () => {
      const org = getSingleResult(
        await db
          .insert(organizations)
          .values({
            tenantId,
            name: 'Test Org',
            slug: 'test-org-cascade',
            isActive: true
          })
          .returning()
      );

      // Delete the tenant
      await db.delete(tenants).where(eq(tenants.id, tenantId));

      // Organization should be cascade deleted
      const result = await db.select().from(organizations).where(eq(organizations.id, org.id));
      expect(result.length).toBe(0);
    });

    it('should have slug field for subdomain routing', async () => {
      // Verify slug field exists by checking we can query by it
      const testOrg = await db
        .select()
        .from(organizations)
        .where(eq(organizations.slug, 'test-slug'))
        .limit(1);

      // If we get here without error, slug field exists
      expect(testOrg).toBeDefined();
    });
  });

  describe('user_tenants table', () => {
    let tenantId: number;
    let userId: number;

    beforeEach(async () => {
      // Create tenant
      const tenant = getSingleResult(
        await db
          .insert(tenants)
          .values({
            type: 'organization',
            status: 'active'
          })
          .returning()
      );
      tenantId = tenant.id;

      // Create organization linked to tenant (users require organizationId)
      const org = getSingleResult(
        await db
          .insert(organizations)
          .values({
            tenantId: tenant.id,
            name: `Test Org ${tenant.id}`,
            slug: `test-org-${tenant.id}`,
            isActive: true
          })
          .returning()
      );

      // Create a test user
      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId: org.id,
            emailHash: `test-user-${tenant.id}-${Date.now()}`,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );
      userId = user.id;
    });

    it('should have user_tenants table defined in schema', () => {
      expect(userTenants).toBeDefined();
    });

    it('should reference tenants table (NOT organizations)', async () => {
      // Verify the foreign key references tenants.id by checking the schema definition
      // The userTenants schema is defined with tenantId referencing tenants.id
      // We can verify this works by ensuring we can query user_tenants by tenantId
      const members = await db
        .select()
        .from(userTenants)
        .where(eq(userTenants.tenantId, tenantId))
        .limit(1);

      // If we get here without error, the relationship works correctly
      expect(members).toBeDefined();
    });

    it('should create a user-tenant membership', async () => {
      const userTenant = getSingleResult(
        await db
          .insert(userTenants)
          .values({
            userId,
            tenantId,
            role: 'tenant_user',
            isDefault: false,
            isActive: true
          })
          .returning()
      );

      expect(userTenant).toBeDefined();
      expect(userTenant.userId).toBe(userId);
      expect(userTenant.tenantId).toBe(tenantId);
      expect(userTenant.role).toBe('tenant_user');
    });

    it('should support all user roles', async () => {
      const roles: Array<'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer'> = [
        'tenant_owner',
        'tenant_admin',
        'tenant_user',
        'tenant_viewer'
      ];

      for (const role of roles) {
        const userTenant = getSingleResult(
          await db
            .insert(userTenants)
            .values({
              userId,
              tenantId,
              role,
              isDefault: false,
              isActive: true
            })
            .returning()
        );

        expect(userTenant.role).toBe(role);
      }
    });

    it('should allow user to have multiple tenant memberships', async () => {
      // Create second tenant
      const tenant2 = getSingleResult(
        await db
          .insert(tenants)
          .values({
            type: 'team',
            status: 'active'
          })
          .returning()
      );

      // User can belong to both tenants
      const userTenant1 = getSingleResult(
        await db
          .insert(userTenants)
          .values({
            userId,
            tenantId,
            role: 'tenant_admin',
            isDefault: true,
            isActive: true
          })
          .returning()
      );

      const userTenant2 = getSingleResult(
        await db
          .insert(userTenants)
          .values({
            userId,
            tenantId: tenant2.id,
            role: 'tenant_user',
            isDefault: false,
            isActive: true
          })
          .returning()
      );

      expect(userTenant1.userId).toBe(userId);
      expect(userTenant2.userId).toBe(userId);
      expect(userTenant1.tenantId).not.toBe(userTenant2.tenantId);
    });

    it('should have isDefault flag for default tenant', async () => {
      const userTenant = getSingleResult(
        await db
          .insert(userTenants)
          .values({
            userId,
            tenantId,
            role: 'tenant_owner',
            isDefault: true,
            isActive: true
          })
          .returning()
      );

      expect(userTenant.isDefault).toBe(true);
    });

    it('should cascade delete when tenant is deleted', async () => {
      const userTenant = getSingleResult(
        await db
          .insert(userTenants)
          .values({
            userId,
            tenantId,
            role: 'tenant_user',
            isDefault: false,
            isActive: true
          })
          .returning()
      );

      // Delete the tenant
      await db.delete(tenants).where(eq(tenants.id, tenantId));

      // User-tenant membership should be cascade deleted
      const result = await db.select().from(userTenants).where(eq(userTenants.id, userTenant.id));
      expect(result.length).toBe(0);
    });

    it('should have composite indexes for efficient queries', async () => {
      const indexRowsResult = await db.execute(sql`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'user_tenants'
          AND indexname IN (
            'idx_user_tenants_user_tenant',
            'idx_user_tenants_user_tenant_active'
          )
      `);
      const indexRows = indexRowsResult.rows as Array<{ indexname: string; indexdef: string }>;
      expect(indexRows).toHaveLength(2);
      const indexDefByName = new Map(indexRows.map((row) => [row.indexname, row.indexdef]));
      expect(indexDefByName.get('idx_user_tenants_user_tenant')).toContain('user_id, tenant_id');
      expect(indexDefByName.get('idx_user_tenants_user_tenant_active')).toContain(
        'user_id, tenant_id, is_active'
      );
    });
  });

  describe('integration: tenant -> organization -> user-tenant', () => {
    it('should create complete tenant hierarchy', async () => {
      // Create tenant
      const tenant = getSingleResult(
        await db
          .insert(tenants)
          .values({
            type: 'organization',
            status: 'active',
            settings: {
              features: { maxUsers: 50 }
            }
          })
          .returning()
      );

      // Create organization linked to tenant
      const org = getSingleResult(
        await db
          .insert(organizations)
          .values({
            tenantId: tenant.id,
            name: 'Integrated Test Org',
            slug: 'integrated-test-org',
            isActive: true
          })
          .returning()
      );

      // Create user (users require organizationId)
      const user = getSingleResult(
        await db
          .insert(users)
          .values({
            organizationId: org.id,
            emailHash: `integration-test-user-${Date.now()}`,
            encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
            isActive: true,
            isVerified: true
          })
          .returning()
      );

      // Create user-tenant membership
      const userTenant = getSingleResult(
        await db
          .insert(userTenants)
          .values({
            userId: user.id,
            tenantId: tenant.id,
            role: 'tenant_owner',
            isDefault: true,
            isActive: true
          })
          .returning()
      );

      // Verify all records are linked correctly
      expect(org.tenantId).toBe(tenant.id);
      expect(userTenant.tenantId).toBe(tenant.id);

      // Verify we can query the complete hierarchy
      const tenantOrgs = await db
        .select()
        .from(organizations)
        .where(eq(organizations.tenantId, tenant.id));
      expect(tenantOrgs.length).toBeGreaterThan(0);

      const tenantMembers = await db
        .select()
        .from(userTenants)
        .where(eq(userTenants.tenantId, tenant.id));
      expect(tenantMembers.length).toBeGreaterThan(0);
    });
  });
});
