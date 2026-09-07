/**
 * @package/db-outbox
 *
 * Event store database schema definitions using Drizzle ORM for PostgreSQL.
 * Provides event sourcing tables, outbox pattern support, and migration tools.
 *
 * Related packages:
 * - `@package/events` - Event bus and publishing
 * - `@package/db-core` - Main application database schema
 * - `@package/types` - Event type definitions
 * - `@package/observability` - Event store tracing
 *
 * @packageDocumentation
 */

export * from './schema';
export * from './db';
export * from './migrations/runner';
export * from './migrations/constants';
export * from './outbox-db.module';
export * from './outbox-db.constants';
