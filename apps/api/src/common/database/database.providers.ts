import * as schema from '@package/db-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { MAIN_DB, DATABASE_PROVIDER } from './database.constants';

import type { Provider } from '@nestjs/common';
import type { NodePgDatabase } from '@package/db-core';

/**
 * Database connection result type
 */
interface DatabaseConnection {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
}

/**
 * Database connection provider factory
 *
 * Creates a PostgreSQL connection pool and Drizzle ORM instance.
 * The connection is configured via DATABASE_URL environment variable.
 */
const databaseProvider: Provider = {
  provide: DATABASE_PROVIDER,
  useFactory: (): DatabaseConnection => {
    const connectionString = process.env['DATABASE_URL'];

    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Please configure it in your .env file.'
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
};

/**
 * Main database provider
 *
 * Provides the Drizzle database instance for injection using @Inject('MAIN_DB')
 */
const mainDbProvider: Provider = {
  provide: MAIN_DB,
  useFactory: (databaseConnection: DatabaseConnection) => {
    return databaseConnection.db;
  },
  inject: [DATABASE_PROVIDER]
};

/**
 * Export all providers for the database module
 */
export const databaseProviders = [databaseProvider, mainDbProvider];
