/**
 * Database injection tokens
 *
 * Used for dependency injection of database connections.
 * Multiple databases can be supported (e.g., MAIN, AUTH).
 */

/**
 * Main database connection token
 * Use with @Inject('MAIN_DB') in constructors
 */
export const MAIN_DB = 'MAIN_DB';

/**
 * Database provider token for the database module
 * Internal use only
 */
export const DATABASE_PROVIDER = 'DATABASE_PROVIDER';

/**
 * Main events database connection token
 * Use with @Inject('EVENT_STORE_DB') in constructors
 */
export { EVENT_STORE_DB } from '@package/db-outbox';
