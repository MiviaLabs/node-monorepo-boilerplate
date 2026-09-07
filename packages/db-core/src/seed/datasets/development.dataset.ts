/**
 * Development dataset
 *
 * Creates realistic test data for development environment.
 * Based on the existing seed.ts implementation.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { organizations, tenants, users } from '../../schemas';
import { createTestUser, createTestOrganization, createTestTenant } from '../factories';

import type { SeedConfig, SeedResult } from '../interfaces';

const { Pool } = pg;

export const developmentDataset = {
  name: 'development',
  description: 'Creates 3 organizations with test users for development',
  priority: 100,

  // eslint-disable-next-line complexity -- Dataset generation requires multiple operations
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

      // Insert tenants first (organizations table requires tenantId)
      if (config.verbose) {
        // eslint-disable-next-line no-console
        console.log('  Creating tenants...');
      }

      // Note: config.tenantCount is available but not used in this dataset
      const newTenants = await db
        .insert(tenants)
        .values([
          createTestTenant({ type: 'organization', status: 'active' }),
          createTestTenant({ type: 'organization', status: 'active' }),
          createTestTenant({ type: 'organization', status: 'suspended' })
        ])
        .returning();

      // Validate that tenants were created
      if (newTenants.length !== 3) {
        throw new Error(`Expected 3 tenants, got ${newTenants.length}`);
      }

      // Type guard to ensure we have the expected number of tenants
      const [tenant1, tenant2, tenant3] = newTenants;
      if (!tenant1 || !tenant2 || !tenant3) {
        throw new Error('Failed to create all required tenants');
      }

      recordsCreated += newTenants.length;

      // Insert organizations (linked to tenants)
      if (config.verbose) {
        // eslint-disable-next-line no-console
        console.log('  Creating organizations...');
      }

      const insertedOrgs = await db
        .insert(organizations)
        .values([
          createTestOrganization({
            tenantId: tenant1.id,
            name: 'Acme Corporation',
            slug: 'acme-corp',
            isActive: true
          }),
          createTestOrganization({
            tenantId: tenant2.id,
            name: 'Globex Industries',
            slug: 'globex-industries',
            isActive: true
          }),
          createTestOrganization({
            tenantId: tenant3.id,
            name: 'Initech Corp',
            slug: 'initech-corp',
            isActive: false
          })
        ])
        .returning();

      recordsCreated += insertedOrgs.length;

      if (config.verbose) {
        // eslint-disable-next-line no-console
        console.log(`  Created ${insertedOrgs.length} organizations`);
      }

      // Insert users for each organization
      if (config.verbose) {
        // eslint-disable-next-line no-console
        console.log('  Creating users...');
      }

      const usersPerTenant = config.usersPerTenant || 3;

      for (const org of insertedOrgs) {
        const usersData = Array.from({ length: usersPerTenant }, () =>
          createTestUser({
            organizationId: org.id,
            isActive: org.isActive,
            isVerified: Math.random() > 0.5
          })
        );

        await db.insert(users).values(usersData);
        recordsCreated += usersData.length;

        if (config.verbose) {
          // eslint-disable-next-line no-console
          console.log(`    Created ${usersData.length} users for ${org.name}`);
        }
      }

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
