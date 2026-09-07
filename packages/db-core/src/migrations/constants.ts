/**
 * Database migration constants for db-core
 *
 * IMPORTANT: Each database package should use a unique migrations table name
 * to prevent conflicts when running migrations from multiple packages on the
 * same database. Without separate tables, Drizzle may skip migrations thinking
 * they were already applied (e.g., both packages have 0000_ migrations).
 */

/**
 * The name of the table used to track applied migrations for db-core.
 * This must be unique across all database packages in the monorepo.
 */
export const MIGRATIONS_TABLE = '__drizzle_migrations_main';

/**
 * The schema where the migrations table is created.
 * Using 'drizzle' schema keeps migration tracking separate from application data.
 */
export const MIGRATIONS_SCHEMA = 'drizzle';
