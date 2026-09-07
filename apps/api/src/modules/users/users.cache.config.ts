import { registerAs } from '@nestjs/config';

import { USER_CACHE_TTL } from './users.cache-keys';

/**
 * Cache configuration for Users module
 *
 * Environment variables:
 * - CACHE_ENABLED: Enable/disable caching (default: true)
 * - CACHE_DEFAULT_TTL: Default TTL in seconds (default: 300)
 * - CACHE_USER_TTL: User entity TTL in seconds (default: 300)
 * - CACHE_USER_LIST_TTL: User list TTL in seconds (default: 60)
 */
export const usersCacheConfig = registerAs('usersCache', () => ({
  /**
   * Whether caching is enabled for users
   */
  enabled: process.env['CACHE_ENABLED'] !== 'false',

  /**
   * Default TTL for user entities (5 minutes)
   */
  defaultTTL: parseInt(process.env['CACHE_USER_TTL'] ?? String(USER_CACHE_TTL.ENTITY), 10),

  /**
   * TTL for user list pages (1 minute)
   */
  listTTL: parseInt(process.env['CACHE_USER_LIST_TTL'] ?? String(USER_CACHE_TTL.LIST), 10),

  /**
   * TTL for user permissions cache (5 minutes)
   */
  permissionsTTL: parseInt(
    process.env['CACHE_USER_PERMISSIONS_TTL'] ?? String(USER_CACHE_TTL.PERMISSIONS),
    10
  ),

  /**
   * TTL for user profile cache (5 minutes)
   */
  profileTTL: parseInt(process.env['CACHE_USER_PROFILE_TTL'] ?? String(USER_CACHE_TTL.PROFILE), 10),

  /**
   * TTL for user status cache (1 minute)
   */
  statusTTL: parseInt(process.env['CACHE_USER_STATUS_TTL'] ?? String(USER_CACHE_TTL.STATUS), 10)
}));

/**
 * Cache configuration type
 */
export type UsersCacheConfig = ReturnType<typeof usersCacheConfig>;
