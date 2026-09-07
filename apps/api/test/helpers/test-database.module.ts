/**
 * Test Database Module
 *
 * Overrides the production DatabaseModule for E2E tests.
 * Uses the Testcontainers database connection URL.
 *
 * @packageDocumentation
 */

import { Global, Module } from '@nestjs/common';
import * as schema from '@package/db-core';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { MAIN_DB, DATABASE_PROVIDER } from '../../src/common/database/database.constants';

/**
 * Database connection result type
 */
interface DatabaseConnection {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
}

/**
 * Test Database Module - Overrides production DatabaseModule for E2E tests
 * Uses the Testcontainers database connection URL
 *
 * CRITICAL: Provides the same tokens (MAIN_DB, DATABASE_PROVIDER) as the
 * production DatabaseModule so that all existing code continues to work.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_PROVIDER,
      useFactory: (): DatabaseConnection => {
        const connectionString = process.env['DATABASE_URL'];

        if (!connectionString) {
          throw new Error(
            'DATABASE_URL is not set. Ensure testcontainers have started before creating the test app.'
          );
        }

        // Create PostgreSQL connection pool
        const pool = new Pool({
          connectionString,
          // Enable prepared statements
          max: 20, // Maximum number of clients in the pool
          idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
          connectionTimeoutMillis: 2000 // Return an error after 2 seconds if connection could not be established
        });

        // Create Drizzle instance with schema
        const db = drizzle(pool, { schema });

        return { pool, db };
      }
    },
    {
      provide: MAIN_DB,
      useFactory: (databaseConnection: DatabaseConnection) => {
        return databaseConnection.db;
      },
      inject: [DATABASE_PROVIDER]
    }
  ],
  exports: [MAIN_DB, DATABASE_PROVIDER]
})
export class TestDatabaseModule {}
