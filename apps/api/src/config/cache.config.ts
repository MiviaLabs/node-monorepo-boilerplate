/**
 * Cache Configuration
 *
 * Centralized cache configuration with environment variable support.
 * All TTL values are configurable via environment variables with sensible defaults.
 */

import { registerAs } from '@nestjs/config';

export interface CacheConfig {
  /**
   * Enable/disable caching globally
   */
  enabled: boolean;

  /**
   * Default TTL values for different cache types (in seconds)
   */
  ttl: {
    /**
     * Default TTL for single entity cache (5 minutes)
     */
    entity: number;

    /**
     * Default TTL for list/query cache (1 minute)
     */
    list: number;

    /**
     * Short TTL for frequently changing data (15 seconds)
     */
    short: number;

    /**
     * Long TTL for rarely changing data (1 hour)
     */
    long: number;

    /**
     * Extended TTL for static data (24 hours)
     */
    extended: number;
  };

  /**
   * Cache key prefixes for consistent key generation
   */
  prefixes: {
    /**
     * Organization-based tenant cache prefix
     */
    tenantOrg: string;

    /**
     * Slug-based tenant cache prefix
     */
    tenantSlug: string;
  };
}

export default registerAs('cache', (): CacheConfig => {
  const enabled = process.env['CACHE_ENABLED'] === 'true';

  return {
    enabled,
    ttl: {
      entity: parseInt(process.env['CACHE_ENTITY_TTL'] ?? '300', 10),
      list: parseInt(process.env['CACHE_LIST_TTL'] ?? '60', 10),
      short: parseInt(process.env['CACHE_SHORT_TTL'] ?? '15', 10),
      long: parseInt(process.env['CACHE_LONG_TTL'] ?? '3600', 10),
      extended: parseInt(process.env['CACHE_EXTENDED_TTL'] ?? '86400', 10)
    },
    prefixes: {
      tenantOrg: 'tenant:org:',
      tenantSlug: 'tenant:slug:'
    }
  };
});
