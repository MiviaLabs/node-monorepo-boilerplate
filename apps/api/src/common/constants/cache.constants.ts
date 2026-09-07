/**
 * Cache Constants
 *
 * Dependency injection tokens for cache-related functionality.
 * Runtime configuration is managed by cache.config.ts with environment variable support.
 *
 * @packageDocumentation
 */

/**
 * Dependency injection token for CacheConfig
 *
 * Inject this to access cache configuration (TTL values, prefixes, etc.)
 *
 * @example
 * ```ts
 * constructor(@Inject(CACHE_CONFIG) private cacheConfig: CacheConfig) {
 *   const ttl = this.cacheConfig.ttl.entity;
 * }
 * ```
 */
export const CACHE_CONFIG = 'CACHE_CONFIG';

/**
 * Dependency injection token for CacheService
 *
 * Inject this to access the cache service for caching operations
 */
export const CACHE_SERVICE = 'CACHE_SERVICE';

/**
 * Cache configuration environment variable names
 *
 * Reference documentation for available environment variables
 */
export const CacheEnvVars = {
  /** Enable/disable caching */
  ENABLED: 'CACHE_ENABLED',
  /** Default TTL for single entity cache */
  ENTITY_TTL: 'CACHE_ENTITY_TTL',
  /** Default TTL for list cache */
  LIST_TTL: 'CACHE_LIST_TTL',
  /** Short TTL for frequently changing data */
  SHORT_TTL: 'CACHE_SHORT_TTL',
  /** Long TTL for rarely changing data */
  LONG_TTL: 'CACHE_LONG_TTL',
  /** Extended TTL for static data */
  EXTENDED_TTL: 'CACHE_EXTENDED_TTL'
} as const;
