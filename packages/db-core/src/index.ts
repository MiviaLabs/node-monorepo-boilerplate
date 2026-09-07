/**
 * @package/db-core
 *
 * Main database schema definitions using Drizzle ORM for PostgreSQL.
 * Provides schema definitions, database connections, migrations, and seeding.
 *
 * Related packages:
 * - `@package/events` - Event sourcing integration
 * - `@package/db-outbox` - Event store database schema
 * - `@package/auth` - User authentication data models
 * - `@package/types` - Entity type definitions
 *
 * @packageDocumentation
 */

/**
 * Schema definitions
 *
 * @see {@link users} - Users table schema
 * @see {@link organizations} - Organizations table schema
 * @see {@link tenants} - Multi-tenant isolation schema
 * @see {@link User}, {@link NewUser} - User select and insert types
 * @see {@link Organization}, {@link NewOrganization} - Organization select and insert types
 * @see {@link Tenant}, {@link NewTenant} - Tenant select and insert types
 */
export * from './schema';

/**
 * Database connection
 *
 * @see {@link db} - Drizzle ORM database instance
 * @see {@link getPool} - PostgreSQL connection pool access
 *
 * See also: `@package/db-outbox` for event store database connections
 */
export * from './db';

/**
 * Migration runner
 *
 * @see {@link runMigrations} - Execute Drizzle migrations programmatically
 */
export * from './migrations/runner';

/**
 * Migration constants
 *
 * @see {@link MIGRATIONS_TABLE} - Name of migrations tracking table
 */
export * from './migrations/constants';

/**
 * Database seeding
 *
 * @see {@link SeedRunner} - Populate database with initial data
 */
export * from './seed';
