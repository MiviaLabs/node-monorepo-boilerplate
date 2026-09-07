/**
 * Integration Tests for User Addresses Schema
 *
 * Tests user_addresses table with Testcontainers to verify:
 * - Multi-tenancy isolation (P0 requirement)
 * - encrypted-store integration for encrypted address fields
 * - CASCADE DELETE behavior for organizations and users
 * - RESTRICT behavior for encrypted-store entries
 * - Index functionality
 * - Soft delete patterns
 * - Default values
 */

import { randomBytes } from 'node:crypto';
import { describe, beforeAll, afterAll, it, beforeEach, expect, jest } from '@jest/globals';

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, and, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { runMigrations } from '../../migrations/runner';
import { userAddresses, organizations, users, tenants, encryptedStoreEntries } from '../../schemas';

// Set longer timeout for Testcontainers operations
jest.setTimeout(60000);

const { Pool } = pg;

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Generate random test data
 */
function testSuffix(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Mock encryption result (matches @package/encryption format)
 */
interface MockEncryptedResult {
  data: string;
  iv: string;
  tag: string;
}

function mockEncrypt(plaintext: string): string {
  const result: MockEncryptedResult = {
    data: plaintext
      .split('')
      .map((c) => String.fromCharCode(c.charCodeAt(0) + 1))
      .join(''),
    iv: randomBytes(16).toString('hex'),
    tag: randomBytes(16).toString('hex')
  };
  return JSON.stringify(result);
}

const TEST_ENCRYPTION_KEY_VERSION = 'primary-encryption-key';

function buildUser(values: Record<string, unknown>) {
  return {
    encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
    ...values
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('userAddresses Schema Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let testDatabaseUrl: string;

  // Test organization and user IDs
  let org1Id: number;
  let org2Id: number;
  let user1Id: number;
  let user2Id: number;

  beforeAll(async () => {
    // Start PostgreSQL Testcontainer
    console.log('[Test] Starting PostgreSQL Testcontainer...');
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    testDatabaseUrl = container.getConnectionUri();
    console.log('[Test] Testcontainer started, running migrations...');

    // Run migrations to set up schema
    await runMigrations(testDatabaseUrl);
    console.log('[Test] Migrations completed');

    // Create connection pool
    pool = new Pool({
      connectionString: testDatabaseUrl
    });

    db = drizzle(pool);

    // Create test tenants first (required by organizations FK)
    const [tenant1] = await db
      .insert(tenants)
      .values({
        type: 'organization',
        status: 'active'
      })
      .returning();
    const tenant1Id = tenant1!.id;

    const [tenant2] = await db
      .insert(tenants)
      .values({
        type: 'organization',
        status: 'active'
      })
      .returning();
    const tenant2Id = tenant2!.id;

    // Create test organizations
    const [org1] = await db
      .insert(organizations)
      .values({
        name: 'Test Organization 1',
        slug: `test-org-1-${testSuffix()}`,
        tenantId: tenant1Id
      })
      .returning();
    org1Id = org1!.id;

    const [org2] = await db
      .insert(organizations)
      .values({
        name: 'Test Organization 2',
        slug: `test-org-2-${testSuffix()}`,
        tenantId: tenant2Id
      })
      .returning();
    org2Id = org2!.id;

    // Create test users
    const [user1] = await db
      .insert(users)
      .values(
        buildUser({
          organizationId: org1Id,
          displayName: 'Test User 1'
        })
      )
      .returning();
    user1Id = user1!.id;

    const [user2] = await db
      .insert(users)
      .values(
        buildUser({
          organizationId: org2Id,
          displayName: 'Test User 2'
        })
      )
      .returning();
    user2Id = user2!.id;

    console.log('[Test] Setup complete');
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      await db.delete(userAddresses);
      await db.delete(encryptedStoreEntries);
      await db.delete(users);
      await db.delete(organizations);
      await db.delete(tenants);
    }

    if (pool) {
      await pool.end();
    }

    // Stop the container
    if (container) {
      console.log('[Test] Stopping Testcontainer...');
      await container.stop();
      console.log('[Test] Testcontainer stopped');
    }
  });

  // ==========================================================================
  // TABLE CREATION TESTS
  // ==========================================================================

  describe('Table Structure', () => {
    it('should have user_addresses table created', async () => {
      // Act
      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'user_addresses'
        AND table_schema = 'public'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
    });

    it('should have all columns with correct types', async () => {
      // Act
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'user_addresses'
        ORDER BY ordinal_position
      `);

      // Assert
      const columns = result.rows;
      expect(columns.length).toBeGreaterThan(0);

      // Verify critical columns
      const idCol = columns.find((c) => c.column_name === 'id');
      expect(idCol).toBeDefined();
      expect(idCol?.data_type).toBe('integer');

      const orgIdCol = columns.find((c) => c.column_name === 'organization_id');
      expect(orgIdCol).toBeDefined();
      expect(orgIdCol?.is_nullable).toBe('NO');

      const userIdCol = columns.find((c) => c.column_name === 'user_id');
      expect(userIdCol).toBeDefined();
      expect(userIdCol?.is_nullable).toBe('NO');

      const addressTypeCol = columns.find((c) => c.column_name === 'address_type');
      expect(addressTypeCol).toBeDefined();
      expect(addressTypeCol?.column_default).toBe("'primary'::character varying");

      const isDefaultCol = columns.find((c) => c.column_name === 'is_default');
      expect(isDefaultCol).toBeDefined();
      expect(isDefaultCol?.column_default).toBe('false');

      const isVerifiedCol = columns.find((c) => c.column_name === 'is_verified');
      expect(isVerifiedCol).toBeDefined();
      expect(isVerifiedCol?.column_default).toBe('false');

      const deletedAtCol = columns.find((c) => c.column_name === 'deleted_at');
      expect(deletedAtCol).toBeDefined();
      expect(deletedAtCol?.is_nullable).toBe('YES');
    });

    it('should have all foreign keys created', async () => {
      // Act
      const result = await pool.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_name = 'user_addresses'
        AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY tc.constraint_name
      `);

      // Assert
      const fks = result.rows;
      expect(fks.length).toBe(8); // orgId, userId, 6 encrypted-store columns

      // Verify organization FK CASCADE
      const orgFk = fks.find((fk) => fk.column_name === 'organization_id');
      expect(orgFk).toBeDefined();
      expect(orgFk?.foreign_table_name).toBe('organizations');
      expect(orgFk?.delete_rule).toBe('CASCADE');

      // Verify user FK CASCADE
      const userFk = fks.find((fk) => fk.column_name === 'user_id');
      expect(userFk).toBeDefined();
      expect(userFk?.foreign_table_name).toBe('users');
      expect(userFk?.delete_rule).toBe('CASCADE');

      // Verify encrypted-store FKs have RESTRICT
      const encryptedStoreFks = fks.filter((fk) => fk.column_name.endsWith('_encrypted_store_id'));
      expect(encryptedStoreFks.length).toBe(6);
      encryptedStoreFks.forEach((fk) => {
        expect(fk.foreign_table_name).toBe('encrypted-store_entries');
        expect(fk.delete_rule).toBe('RESTRICT');
      });
    });

    it('should have all indexes created', async () => {
      // Act
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'user_addresses'
        ORDER BY indexname
      `);

      // Assert
      const indexes = result.rows.map((r) => r.indexname);
      // 10 custom indexes + 1 primary key index = 11 total
      expect(indexes.length).toBeGreaterThanOrEqual(10);

      // Verify critical indexes
      expect(indexes).toContain('user_addresses_tenant_user_type_idx');
      expect(indexes).toContain('user_addresses_default_idx');
      expect(indexes).toContain('user_addresses_country_idx');
      expect(indexes).toContain('user_addresses_user_idx');
      expect(indexes).toContain('user_addresses_street_encrypted_store_idx');
      expect(indexes).toContain('user_addresses_street2_encrypted_store_idx');
      expect(indexes).toContain('user_addresses_city_encrypted_store_idx');
      expect(indexes).toContain('user_addresses_state_encrypted_store_idx');
      expect(indexes).toContain('user_addresses_postal_code_encrypted_store_idx');
      expect(indexes).toContain('user_addresses_country_encrypted_store_idx');
    });
  });

  // ==========================================================================
  // INSERT TESTS
  // ==========================================================================

  describe('INSERT Operations', () => {
    beforeEach(async () => {
      await db.delete(userAddresses);
    });

    it('should insert address with minimal required fields', async () => {
      // Act
      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id
        })
        .returning();

      // Assert
      expect(address).toBeDefined();
      expect(address.organizationId).toBe(org1Id);
      expect(address.userId).toBe(user1Id);
      expect(address.addressType).toBe('primary'); // default
      expect(address.isDefault).toBe(false); // default
      expect(address.isVerified).toBe(false); // default
      expect(address.createdAt).toBeDefined();
      expect(address.updatedAt).toBeDefined();
      expect(address.deletedAt).toBeNull();
    });

    it('should insert address with all fields', async () => {
      // Arrange
      const [encryptedStoreEntry] = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId: org1Id,
          entityType: 'custom',
          entityId: user1Id,
          fieldPath: 'street',
          ciphertext: mockEncrypt('123 Main St'),
          encryptedDataKey: mockEncrypt('dek'),
          iv: randomBytes(16).toString('hex'),
          authTag: randomBytes(16).toString('hex'),
          keyId: 'test-key-id',
          classification: 'confidential',
          category: 'contact'
        })
        .returning();

      // Act
      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'billing',
          label: 'Home',
          streetEncryptedStoreId: encryptedStoreEntry!.id,
          cityEncryptedStoreId: encryptedStoreEntry!.id,
          stateEncryptedStoreId: encryptedStoreEntry!.id,
          postalCodeEncryptedStoreId: encryptedStoreEntry!.id,
          countryEncryptedStoreId: encryptedStoreEntry!.id,
          countryCode: 'US',
          isDefault: true,
          isVerified: true
        })
        .returning();

      // Assert
      expect(address).toBeDefined();
      expect(address.addressType).toBe('billing');
      expect(address.label).toBe('Home');
      expect(address.streetEncryptedStoreId).toBe(encryptedStoreEntry!.id);
      expect(address.cityEncryptedStoreId).toBe(encryptedStoreEntry!.id);
      expect(address.stateEncryptedStoreId).toBe(encryptedStoreEntry!.id);
      expect(address.postalCodeEncryptedStoreId).toBe(encryptedStoreEntry!.id);
      expect(address.countryEncryptedStoreId).toBe(encryptedStoreEntry!.id);
      expect(address.countryCode).toBe('US');
      expect(address.isDefault).toBe(true);
      expect(address.isVerified).toBe(true);
    });

    it('should support all address type enum values', async () => {
      const addressTypes: Array<'primary' | 'billing' | 'shipping' | 'office'> = [
        'primary',
        'billing',
        'shipping',
        'office'
      ];

      for (const type of addressTypes) {
        const [address] = await db
          .insert(userAddresses)
          .values({
            organizationId: org1Id,
            userId: user1Id,
            addressType: type
          })
          .returning();

        expect(address.addressType).toBe(type);
      }
    });
  });

  // ==========================================================================
  // SELECT TESTS
  // ==========================================================================

  describe('SELECT Operations', () => {
    beforeEach(async () => {
      await db.delete(userAddresses);
    });

    it('should query address by id', async () => {
      // Arrange
      const [inserted] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'billing'
        })
        .returning();

      // Act
      const [found] = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.id, inserted!.id))
        .limit(1);

      // Assert
      expect(found).toBeDefined();
      expect(found?.id).toBe(inserted!.id);
      expect(found?.addressType).toBe('billing');
    });

    it('should query addresses by organization and user', async () => {
      // Arrange
      await db.insert(userAddresses).values([
        {
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'primary'
        },
        {
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'billing'
        }
      ]);

      // Act
      const addresses = await db
        .select()
        .from(userAddresses)
        .where(and(eq(userAddresses.organizationId, org1Id), eq(userAddresses.userId, user1Id)));

      // Assert
      expect(addresses.length).toBe(2);
      expect(addresses.every((a) => a.organizationId === org1Id && a.userId === user1Id)).toBe(
        true
      );
    });

    it('should query default addresses', async () => {
      // Arrange
      await db.insert(userAddresses).values([
        {
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'primary',
          isDefault: true
        },
        {
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'billing',
          isDefault: false
        }
      ]);

      // Act
      const defaults = await db
        .select()
        .from(userAddresses)
        .where(
          and(
            eq(userAddresses.organizationId, org1Id),
            eq(userAddresses.userId, user1Id),
            eq(userAddresses.isDefault, true)
          )
        );

      // Assert
      expect(defaults.length).toBe(1);
      expect(defaults[0].isDefault).toBe(true);
    });
  });

  // ==========================================================================
  // CASCADE DELETE TESTS
  // ==========================================================================

  describe('CASCADE DELETE Behavior', () => {
    it('should cascade delete addresses when organization is deleted', async () => {
      // Arrange - Create tenant, org, user, and address
      const [newTenant] = await db
        .insert(tenants)
        .values({
          type: 'organization',
          status: 'active'
        })
        .returning();

      const [newOrg] = await db
        .insert(organizations)
        .values({
          name: 'Org To Delete',
          slug: `org-to-delete-${testSuffix()}`,
          tenantId: newTenant!.id
        })
        .returning();

      const [newUser] = await db
        .insert(users)
        .values(
          buildUser({
            organizationId: newOrg!.id,
            displayName: 'User To Delete'
          })
        )
        .returning();

      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: newOrg!.id,
          userId: newUser!.id,
          addressType: 'primary'
        })
        .returning();

      // Verify address exists
      const beforeDelete = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.id, address!.id));
      expect(beforeDelete.length).toBe(1);

      // Act - Delete organization (CASCADE should delete user and addresses)
      await db.delete(organizations).where(eq(organizations.id, newOrg!.id));

      // Assert - Address should be deleted
      const afterDelete = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.id, address!.id));
      expect(afterDelete.length).toBe(0);
    });

    it('should cascade delete addresses when user is deleted', async () => {
      // Arrange - Create user and address
      const [newUser] = await db
        .insert(users)
        .values(
          buildUser({
            organizationId: org1Id,
            displayName: 'User To Delete'
          })
        )
        .returning();

      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: newUser!.id,
          addressType: 'primary'
        })
        .returning();

      // Verify address exists
      const beforeDelete = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.id, address!.id));
      expect(beforeDelete.length).toBe(1);

      // Act - Delete user (CASCADE should delete addresses)
      await db.delete(users).where(eq(users.id, newUser!.id));

      // Assert - Address should be deleted
      const afterDelete = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.id, address!.id));
      expect(afterDelete.length).toBe(0);
    });
  });

  // ==========================================================================
  // encrypted-store INTEGRATION TESTS
  // ==========================================================================

  describe('encrypted-store Integration', () => {
    it('should create address referencing encrypted-store entries', async () => {
      // Arrange - Create encrypted-store entries for address fields
      const [streetEncryptedStore] = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId: org1Id,
          entityType: 'custom',
          entityId: user1Id,
          fieldPath: 'address.street',
          ciphertext: mockEncrypt('123 Main St'),
          encryptedDataKey: mockEncrypt('dek'),
          iv: randomBytes(16).toString('hex'),
          authTag: randomBytes(16).toString('hex'),
          keyId: 'test-key-id',
          classification: 'confidential',
          category: 'contact'
        })
        .returning();

      const [cityEncryptedStore] = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId: org1Id,
          entityType: 'custom',
          entityId: user1Id,
          fieldPath: 'address.city',
          ciphertext: mockEncrypt('San Francisco'),
          encryptedDataKey: mockEncrypt('dek'),
          iv: randomBytes(16).toString('hex'),
          authTag: randomBytes(16).toString('hex'),
          keyId: 'test-key-id',
          classification: 'confidential',
          category: 'contact'
        })
        .returning();

      // Act - Create address referencing encrypted-store entries
      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          streetEncryptedStoreId: streetEncryptedStore!.id,
          cityEncryptedStoreId: cityEncryptedStore!.id
        })
        .returning();

      // Assert
      expect(address.streetEncryptedStoreId).toBe(streetEncryptedStore!.id);
      expect(address.cityEncryptedStoreId).toBe(cityEncryptedStore!.id);
    });

    it('should prevent encrypted-store entry deletion when referenced by address (RESTRICT)', async () => {
      // Arrange - Create encrypted-store entry and address referencing it
      const [encryptedStoreEntry] = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId: org1Id,
          entityType: 'custom',
          entityId: user1Id,
          fieldPath: 'address.street',
          ciphertext: mockEncrypt('123 Main St'),
          encryptedDataKey: mockEncrypt('dek'),
          iv: randomBytes(16).toString('hex'),
          authTag: randomBytes(16).toString('hex'),
          keyId: 'test-key-id',
          classification: 'confidential',
          category: 'contact'
        })
        .returning();

      await db.insert(userAddresses).values({
        organizationId: org1Id,
        userId: user1Id,
        streetEncryptedStoreId: encryptedStoreEntry!.id
      });

      // Act & Assert - Deleting encrypted-store entry should fail due to RESTRICT
      // Note: Drizzle wraps Postgres errors, so we check for the underlying error
      await expect(
        db
          .delete(encryptedStoreEntries)
          .where(eq(encryptedStoreEntries.id, encryptedStoreEntry!.id))
      ).rejects.toThrow();
    });

    it('should allow encrypted-store entry deletion after address reference is removed', async () => {
      // Arrange - Create encrypted-store entry and address
      const [encryptedStoreEntry] = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId: org1Id,
          entityType: 'custom',
          entityId: user1Id,
          fieldPath: 'address.street',
          ciphertext: mockEncrypt('123 Main St'),
          encryptedDataKey: mockEncrypt('dek'),
          iv: randomBytes(16).toString('hex'),
          authTag: randomBytes(16).toString('hex'),
          keyId: 'test-key-id',
          classification: 'confidential',
          category: 'contact'
        })
        .returning();

      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          streetEncryptedStoreId: encryptedStoreEntry!.id
        })
        .returning();

      // Act - Remove reference by setting to null
      await db
        .update(userAddresses)
        .set({ streetEncryptedStoreId: null })
        .where(eq(userAddresses.id, address!.id));

      // Now delete should succeed
      await db
        .delete(encryptedStoreEntries)
        .where(eq(encryptedStoreEntries.id, encryptedStoreEntry!.id));

      // Assert - encrypted-store entry should be deleted
      const deleted = await db
        .select()
        .from(encryptedStoreEntries)
        .where(eq(encryptedStoreEntries.id, encryptedStoreEntry!.id));
      expect(deleted.length).toBe(0);
    });
  });

  // ==========================================================================
  // SOFT DELETE TESTS
  // ==========================================================================

  describe('Soft Delete', () => {
    beforeEach(async () => {
      await db.delete(userAddresses);
    });

    it('should soft delete address by setting deletedAt', async () => {
      // Arrange
      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'primary'
        })
        .returning();

      // Act - Soft delete
      await db
        .update(userAddresses)
        .set({ deletedAt: new Date() })
        .where(eq(userAddresses.id, address!.id));

      // Assert
      const [softDeleted] = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.id, address!.id))
        .limit(1);

      expect(softDeleted).toBeDefined();
      expect(softDeleted.deletedAt).toBeDefined();
      expect(softDeleted.deletedAt).not.toBeNull();
    });

    it('should exclude soft deleted addresses from queries', async () => {
      // Arrange
      const [activeAddress] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'primary'
        })
        .returning();

      const [deletedAddress] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'billing'
        })
        .returning();

      await db
        .update(userAddresses)
        .set({ deletedAt: new Date() })
        .where(eq(userAddresses.id, deletedAddress!.id));

      // Act - Query without soft deleted
      const activeAddresses = await db
        .select()
        .from(userAddresses)
        .where(isNull(userAddresses.deletedAt));

      // Assert
      expect(activeAddresses.length).toBe(1);
      expect(activeAddresses[0].id).toBe(activeAddress!.id);
    });

    it('should include soft deleted addresses when explicitly queried', async () => {
      // Arrange
      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'primary'
        })
        .returning();

      await db
        .update(userAddresses)
        .set({ deletedAt: new Date() })
        .where(eq(userAddresses.id, address!.id));

      // Act - Query all including soft deleted
      const allAddresses = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.organizationId, org1Id));

      // Assert
      expect(allAddresses.length).toBe(1);
      expect(allAddresses[0].deletedAt).not.toBeNull();
    });
  });

  // ==========================================================================
  // P0 MULTI-TENANCY TESTS
  // ==========================================================================

  describe('P0: Multi-Tenancy Isolation', () => {
    beforeEach(async () => {
      await db.delete(userAddresses);

      // Create addresses for org1
      await db.insert(userAddresses).values([
        {
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'primary',
          label: 'Home'
        },
        {
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'billing',
          label: 'Office'
        },
        {
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'shipping',
          label: 'Warehouse'
        }
      ]);

      // Create addresses for org2
      await db.insert(userAddresses).values([
        {
          organizationId: org2Id,
          userId: user2Id,
          addressType: 'primary',
          label: 'Home 2'
        },
        {
          organizationId: org2Id,
          userId: user2Id,
          addressType: 'office',
          label: 'Office 2'
        }
      ]);
    });

    it('should enforce tenant isolation (P0 requirement)', async () => {
      // Act - Query org1 addresses only (P0: MUST include organizationId)
      const org1Addresses = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.organizationId, org1Id));

      // Assert - All returned addresses belong to org1 only
      expect(org1Addresses.length).toBe(3);
      const allOrgIds = new Set(org1Addresses.map((a) => a.organizationId));
      expect(allOrgIds.has(org2Id)).toBe(false);
      expect(allOrgIds.size).toBe(1);
      expect(allOrgIds.has(org1Id)).toBe(true);
    });

    it('should prevent cross-tenant access (P0 violation)', async () => {
      // Act - Query org1 addresses
      const org1Addresses = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.organizationId, org1Id));

      // Assert - No org2 addresses should be present
      expect(org1Addresses.length).toBe(3);
      expect(org1Addresses.every((a) => a.organizationId === org1Id)).toBe(true);
      expect(org1Addresses.some((a) => a.organizationId === org2Id)).toBe(false);
    });

    it('should query addresses within tenant scope by user', async () => {
      // Act - Query addresses for user1 in org1 (P0: tenant + user scoped)
      const user1Addresses = await db
        .select()
        .from(userAddresses)
        .where(and(eq(userAddresses.organizationId, org1Id), eq(userAddresses.userId, user1Id)));

      // Assert
      expect(user1Addresses.length).toBe(3);
      expect(user1Addresses.every((a) => a.organizationId === org1Id)).toBe(true);
      expect(user1Addresses.every((a) => a.userId === user1Id)).toBe(true);
    });

    it('should query addresses by type within tenant', async () => {
      // Act - Query primary addresses for org1 (P0: tenant + type scoped)
      const primaryAddresses = await db
        .select()
        .from(userAddresses)
        .where(
          and(eq(userAddresses.organizationId, org1Id), eq(userAddresses.addressType, 'primary'))
        );

      // Assert
      expect(primaryAddresses.length).toBe(1);
      expect(primaryAddresses[0].organizationId).toBe(org1Id);
      expect(primaryAddresses[0].addressType).toBe('primary');
    });

    it('should query default addresses within tenant', async () => {
      // Arrange - Update one address to be default
      const [address] = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.organizationId, org1Id))
        .limit(1);

      await db
        .update(userAddresses)
        .set({ isDefault: true })
        .where(eq(userAddresses.id, address!.id));

      // Act - Query default addresses for org1
      const defaults = await db
        .select()
        .from(userAddresses)
        .where(
          and(
            eq(userAddresses.organizationId, org1Id),
            eq(userAddresses.userId, user1Id),
            eq(userAddresses.isDefault, true)
          )
        );

      // Assert
      expect(defaults.length).toBe(1);
      expect(defaults[0].organizationId).toBe(org1Id);
      expect(defaults[0].isDefault).toBe(true);
    });

    it('should query addresses by country code within tenant', async () => {
      // Arrange - Set country codes
      await db
        .update(userAddresses)
        .set({ countryCode: 'US' })
        .where(eq(userAddresses.organizationId, org1Id));

      await db
        .update(userAddresses)
        .set({ countryCode: 'UK' })
        .where(eq(userAddresses.organizationId, org2Id));

      // Act - Query US addresses for org1 (P0: tenant + country scoped)
      const usAddresses = await db
        .select()
        .from(userAddresses)
        .where(and(eq(userAddresses.organizationId, org1Id), eq(userAddresses.countryCode, 'US')));

      // Assert
      expect(usAddresses.length).toBe(3);
      expect(usAddresses.every((a) => a.organizationId === org1Id)).toBe(true);
      expect(usAddresses.every((a) => a.countryCode === 'US')).toBe(true);
    });
  });

  // ==========================================================================
  // UPDATE TESTS
  // ==========================================================================

  describe('UPDATE Operations', () => {
    beforeEach(async () => {
      await db.delete(userAddresses);
    });

    it('should update address fields', async () => {
      // Arrange
      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          addressType: 'primary',
          isDefault: false,
          isVerified: false
        })
        .returning();

      // Act
      await db
        .update(userAddresses)
        .set({
          addressType: 'billing',
          label: 'Updated',
          isDefault: true,
          isVerified: true
        })
        .where(eq(userAddresses.id, address!.id));

      // Assert
      const [updated] = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.id, address!.id))
        .limit(1);

      expect(updated.addressType).toBe('billing');
      expect(updated.label).toBe('Updated');
      expect(updated.isDefault).toBe(true);
      expect(updated.isVerified).toBe(true);
    });

    it('should update encrypted-store references', async () => {
      // Arrange
      const [encryptedStoreEntry1] = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId: org1Id,
          entityType: 'custom',
          entityId: user1Id,
          fieldPath: 'street1',
          ciphertext: mockEncrypt('Street 1'),
          encryptedDataKey: mockEncrypt('dek'),
          iv: randomBytes(16).toString('hex'),
          authTag: randomBytes(16).toString('hex'),
          keyId: 'key1',
          classification: 'confidential',
          category: 'contact'
        })
        .returning();

      const [encryptedStoreEntry2] = await db
        .insert(encryptedStoreEntries)
        .values({
          organizationId: org1Id,
          entityType: 'custom',
          entityId: user1Id,
          fieldPath: 'street2',
          ciphertext: mockEncrypt('Street 2'),
          encryptedDataKey: mockEncrypt('dek'),
          iv: randomBytes(16).toString('hex'),
          authTag: randomBytes(16).toString('hex'),
          keyId: 'key2',
          classification: 'confidential',
          category: 'contact'
        })
        .returning();

      const [address] = await db
        .insert(userAddresses)
        .values({
          organizationId: org1Id,
          userId: user1Id,
          streetEncryptedStoreId: encryptedStoreEntry1!.id
        })
        .returning();

      // Act - Update encrypted-store reference
      await db
        .update(userAddresses)
        .set({ streetEncryptedStoreId: encryptedStoreEntry2!.id })
        .where(eq(userAddresses.id, address!.id));

      // Assert
      const [updated] = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.id, address!.id))
        .limit(1);

      expect(updated.streetEncryptedStoreId).toBe(encryptedStoreEntry2!.id);
    });
  });

  // ==========================================================================
  // INDEX USAGE VERIFICATION
  // ==========================================================================

  describe('Index Usage Verification', () => {
    it('should use tenant_user_type_idx for tenant+user+type queries', async () => {
      // Arrange
      await db.insert(userAddresses).values({
        organizationId: org1Id,
        userId: user1Id,
        addressType: 'billing'
      });

      // Act - EXPLAIN ANALYZE to verify index usage
      const result = await pool.query(
        `
        EXPLAIN ANALYZE
        SELECT * FROM user_addresses
        WHERE organization_id = $1
        AND user_id = $2
        AND address_type = 'billing'
        AND deleted_at IS NULL
      `,
        [org1Id, user1Id]
      );

      // Assert - Should use index scan (not sequential scan)
      const plan = result.rows.map((r) => r['QUERY PLAN']).join(' ');
      expect(plan.toLowerCase()).toContain('index');
    });

    it('should use default_idx for default address queries', async () => {
      // Arrange
      await db.insert(userAddresses).values({
        organizationId: org1Id,
        userId: user1Id,
        isDefault: true
      });

      // Act
      const result = await pool.query(
        `
        EXPLAIN ANALYZE
        SELECT * FROM user_addresses
        WHERE organization_id = $1
        AND user_id = $2
        AND is_default = true
        AND deleted_at IS NULL
      `,
        [org1Id, user1Id]
      );

      // Assert
      const plan = result.rows.map((r) => r['QUERY PLAN']).join(' ');
      expect(plan.toLowerCase()).toContain('index');
    });
  });

  // ==========================================================================
  // P0 COMPLIANCE TESTS
  // ==========================================================================

  describe('P0 Compliance', () => {
    it('should have organizationId NOT NULL (multi-tenancy requirement)', async () => {
      // Act
      const result = await pool.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_addresses'
        AND column_name = 'organization_id'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].is_nullable).toBe('NO');
    });

    it('should have userId NOT NULL', async () => {
      // Act
      const result = await pool.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_addresses'
        AND column_name = 'user_id'
      `);

      // Assert
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].is_nullable).toBe('NO');
    });

    it('should have all tenant-scoped indexes include organizationId', async () => {
      // Act
      const result = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'user_addresses'
        ORDER BY indexname
      `);

      // Assert - All tenant-scoped indexes must include organization_id
      // encrypted-store reference indexes are excluded as they reference encrypted-store_entries
      const indexes = result.rows;
      const tenantScopedIndexes = [
        'user_addresses_tenant_user_type_idx',
        'user_addresses_default_idx',
        'user_addresses_country_idx',
        'user_addresses_user_idx'
      ];

      for (const indexName of tenantScopedIndexes) {
        const idx = indexes.find((i) => i.indexname === indexName);
        expect(idx).toBeDefined();
        expect(idx!.indexdef.toLowerCase()).toContain('organization_id');
      }
    });
  });
});
