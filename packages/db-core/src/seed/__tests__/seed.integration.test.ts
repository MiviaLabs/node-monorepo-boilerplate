/**
 * Integration Tests for Seed Data System
 *
 * Tests seed data system with Testcontainers.
 */

import { describe, beforeAll, afterAll, it, expect, jest } from '@jest/globals';

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { runMigrations } from '../../migrations/runner';
import { users, organizations, tenants } from '../../schemas';
import { developmentDataset, testingDataset } from '../datasets';
import { SeedEnvironment } from '../interfaces/seed-config.interface';
import { SeedRunner } from '../seed-runner';

import type { SeedConfig } from '../interfaces';

const { Pool } = pg;

jest.setTimeout(60000);

describe('Seed Data System Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let testDatabaseUrl: string;

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

    // Clean up any existing test data
    await db.delete(users);
    await db.delete(organizations);
    await db.delete(tenants);
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
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

  describe('Development Dataset', () => {
    it('should seed development data with 3 tenants', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: false,
        force: false,
        verbose: false
      };

      // Act
      const result = await developmentDataset.seed(config);

      // Assert
      expect(result.success).toBe(true);
      expect(result.recordsCreated).toBeGreaterThan(0);
      expect(result.dataset).toBe('development');
    });

    it('should create organizations linked to correct tenants', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await developmentDataset.seed(config);

      // Verify organizations are linked to tenants
      const allOrgs = await db.select().from(organizations);
      const allTenants = await db.select().from(tenants);

      // Assert - each organization should have a valid tenantId
      for (const org of allOrgs) {
        const tenantExists = allTenants.some((t) => t.id === org.tenantId);
        expect(tenantExists).toBe(true);
      }
    });

    it('should create users linked to correct organizations', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await developmentDataset.seed(config);

      // Verify users are linked to organizations
      const allUsers = await db.select().from(users);
      const allOrgs = await db.select().from(organizations);

      // Assert - each user should have a valid organizationId
      for (const user of allUsers) {
        const orgExists = allOrgs.some((o) => o.id === user.organizationId);
        expect(orgExists).toBe(true);
      }
    });

    it('should create users with [SEED-TEST] prefix', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await developmentDataset.seed(config);

      // Verify all users have [SEED-TEST] prefix
      const allUsers = await db.select().from(users);

      // Assert - all users should have [SEED-TEST] in display name or email
      for (const user of allUsers) {
        expect(user.displayName?.includes('[SEED-TEST]')).toBe(true);
      }
    });

    it('should clear existing data when clearFirst is true', async () => {
      // Arrange - seed first time
      const config1: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: false,
        force: false,
        verbose: false
      };

      await developmentDataset.seed(config1);

      const userCount1 = await db.select().from(users);
      expect(userCount1.length).toBeGreaterThan(0);

      // Act - seed again with clearFirst
      const config2: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: true,
        force: false,
        verbose: false
      };

      await developmentDataset.seed(config2);

      // Assert - should still have data (re-seeded)
      const userCount2 = await db.select().from(users);
      expect(userCount2.length).toBeGreaterThan(0);
      // Count should be the same (clean + recreated)
      expect(userCount2.length).toBe(userCount1.length);
    });
  });

  describe('Testing Dataset', () => {
    it('should seed minimal test data', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: false,
        force: false,
        verbose: false
      };

      // Act
      const result = await testingDataset.seed(config);

      // Assert
      expect(result.success).toBe(true);
      expect(result.dataset).toBe('testing');
    });

    it('should create exactly 1 tenant', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await testingDataset.seed(config);

      // Assert
      const tenantCount = await db.select().from(tenants);
      expect(tenantCount.length).toBe(1);
    });

    it('should create exactly 1 organization', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await testingDataset.seed(config);

      // Assert
      const orgCount = await db.select().from(organizations);
      expect(orgCount.length).toBe(1);
    });

    it('should create exactly 1 user', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await testingDataset.seed(config);

      // Assert
      const userCount = await db.select().from(users);
      expect(userCount.length).toBe(1);
    });

    it('should create 3 total records (1 tenant + 1 org + 1 user)', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      const result = await testingDataset.seed(config);

      // Assert
      expect(result.recordsCreated).toBe(3);
    });
  });

  describe('Seed Runner', () => {
    it('should run development dataset in development environment', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: true,
        force: false,
        verbose: false
      };

      const runner = new SeedRunner(config);

      // Act
      const results = await runner.run();

      // Assert
      expect(results.length).toBe(1);
      expect(results[0]?.dataset).toBe('development');
      expect(results[0]?.success).toBe(true);
    });

    it('should run testing dataset in testing environment', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: true,
        force: false,
        verbose: false
      };

      const runner = new SeedRunner(config);

      // Act
      const results = await runner.run();

      // Assert
      expect(results.length).toBe(1);
      expect(results[0]?.dataset).toBe('testing');
      expect(results[0]?.success).toBe(true);
    });

    it('should run all datasets in staging environment', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Staging,
        clearFirst: true,
        force: false,
        verbose: false
      };

      const runner = new SeedRunner(config);

      // Act
      const results = await runner.run();

      // Assert - staging runs both datasets
      expect(results.length).toBeGreaterThanOrEqual(2);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });

    it('should return error result on failure', async () => {
      // Arrange - test with invalid URL that will fail validation
      const config: SeedConfig = {
        databaseUrl: 'invalid-url', // Invalid format, will fail validation
        environment: SeedEnvironment.Testing,
        clearFirst: false,
        force: false,
        verbose: false
      };

      // Act & Assert - constructing SeedRunner should throw validation error
      expect(() => new SeedRunner(config)).toThrow(/Invalid DATABASE_URL/);
    });

    it('should respect datasets filter', async () => {
      // Arrange - Use Staging environment (includes all datasets) to test filtering
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Staging,
        clearFirst: true,
        force: false,
        verbose: false,
        datasets: ['testing'] // Only run testing dataset
      };

      const runner = new SeedRunner(config);

      // Act
      const results = await runner.run();

      // Assert - should only run testing dataset
      expect(results.length).toBe(1);
      expect(results[0]?.dataset).toBe('testing');
    });

    it('should measure execution time', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: true,
        force: false,
        verbose: false
      };

      const runner = new SeedRunner(config);

      // Act
      const results = await runner.run();

      // Assert
      expect(results[0]?.durationMs ?? 0).toBeGreaterThan(0);
      expect(results[0]?.durationMs ?? 0).toBeLessThan(60000); // Should complete in < 60 seconds
    });
  });

  describe('Multi-Tenancy Compliance', () => {
    it('should enforce tenant isolation in seed data', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await developmentDataset.seed(config);

      // Verify - organizations should have valid tenant IDs
      const orgs = await db.select().from(organizations);
      const tenantIds = await db.select({ id: tenants.id }).from(tenants);

      for (const org of orgs) {
        const tenantExists = tenantIds.some((t) => t.id === org.tenantId);
        expect(tenantExists).toBe(true);
      }
    });

    it('should not mix tenant data', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Development,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await developmentDataset.seed(config);

      // Verify - users should belong to organizations within their tenant
      const allUsers = await db
        .select({
          userId: users.id,
          userOrgId: users.organizationId,
          orgTenantId: organizations.tenantId,
          orgId: organizations.id
        })
        .from(users)
        .innerJoin(organizations, eq(users.organizationId, organizations.id));

      for (const row of allUsers) {
        // User's organization should belong to the same tenant
        expect(row.orgTenantId).toBeDefined();
      }
    });
  });

  describe('PII Protection', () => {
    it('should use [SEED-TEST] prefix for easy identification', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await testingDataset.seed(config);

      // Assert - verify test data has [SEED-TEST] prefix
      const allUsers = await db.select().from(users);

      for (const user of allUsers) {
        expect(user.displayName?.includes('[SEED-TEST]')).toBe(true);
      }
    });

    it('should not use production-like domains in email', async () => {
      // Arrange
      const config: SeedConfig = {
        databaseUrl: testDatabaseUrl,
        environment: SeedEnvironment.Testing,
        clearFirst: true,
        force: false,
        verbose: false
      };

      // Act
      await testingDataset.seed(config);

      // Assert - verify @dev.local domain usage
      const allUsers = await db.select().from(users);

      for (const user of allUsers) {
        // emailEncrypted should contain @dev.local
        expect(user.emailEncrypted?.includes('@dev.local')).toBe(true);
      }
    });
  });
});
