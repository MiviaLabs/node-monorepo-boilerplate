/**
 * Testing dataset
 *
 * Creates minimal test data for automated testing.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { organizations, tenants, users } from '../../schemas';
import { createTestUser, createTestOrganization, createTestTenant } from '../factories';

import type { SeedConfig, SeedResult } from '../interfaces';

const { Pool } = pg;

export const testingDataset = {
  name: 'testing',
  description: 'Creates minimal test data (1 organization with 1 user)',
  priority: 50,

  async seed(config: SeedConfig): Promise<SeedResult> {
    const startTime = Date.now();
    let recordsCreated = 0;

    const pool = new Pool({
      connectionString: config.databaseUrl,
      // Add connection timeout to prevent hanging
      connectionTimeoutMillis: 10000
    });

    const db = drizzle(pool);

    try {
      // Clear existing data if requested
      if (config.clearFirst) {
        if (config.verbose) {
          // eslint-disable-next-line no-console
          console.log('  Clearing existing data...');
        }
        await db.delete(users);
        await db.delete(organizations);
        await db.delete(tenants);
      }

      // Insert tenant
      if (config.verbose) {
        // eslint-disable-next-line no-console
        console.log('  Creating tenant...');
      }

      const [newTenant] = await db
        .insert(tenants)
        .values(createTestTenant({ type: 'organization', status: 'active' }))
        .returning();

      if (!newTenant) {
        throw new Error('Failed to create tenant');
      }

      recordsCreated += 1;

      // Insert organization
      if (config.verbose) {
        // eslint-disable-next-line no-console
        console.log('  Creating organization...');
      }

      const [newOrg] = await db
        .insert(organizations)
        .values(
          createTestOrganization({
            tenantId: newTenant.id,
            name: 'Test Organization',
            slug: 'test-org',
            isActive: true
          })
        )
        .returning();

      if (!newOrg) {
        throw new Error('Failed to create organization');
      }

      recordsCreated += 1;

      // Insert user
      if (config.verbose) {
        // eslint-disable-next-line no-console
        console.log('  Creating user...');
      }

      await db.insert(users).values(
        createTestUser({
          organizationId: newOrg.id,
          isActive: true,
          isVerified: true
        })
      );

      recordsCreated += 1;

      return {
        dataset: this.name,
        recordsCreated,
        durationMs: Date.now() - startTime,
        success: true
      };
    } catch (error) {
      return {
        dataset: this.name,
        recordsCreated,
        durationMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // Ensure pool is always closed, even on error
      try {
        await pool.end();
      } catch {
        // Ignore pool close errors - we're already in an error state
      }
    }
  }
} as const;
