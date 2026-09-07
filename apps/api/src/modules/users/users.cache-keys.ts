/**
 * Cache key constants and builders for Users module
 *
 * Provides centralized cache key management with:
 * - Tenant-prefixed keys
 * - Tag-based invalidation support
 * - Pattern-based invalidation support
 * - Type-safe key builders
 */

/**
 * Cache key namespaces
 */
export const USER_CACHE_NAMESPACE = 'users';

/**
 * Cache tags for invalidation
 */
export const USER_CACHE_TAGS = {
  /** Invalidate when user permissions change */
  PERMISSIONS: 'permissions',
  /** Invalidate when user profile changes */
  PROFILE: 'profile',
  /** Invalidate when user status changes */
  STATUS: 'status',
  /** Invalidate all user-related caches */
  ALL: 'all'
} as const;

/**
 * Cache TTL configuration (in seconds)
 */
export const USER_CACHE_TTL = {
  /** Single user entity - 5 minutes */
  ENTITY: 300,
  /** User list pages - 1 minute */
  LIST: 60,
  /** User permissions - 5 minutes */
  PERMISSIONS: 300,
  /** User profile - 5 minutes */
  PROFILE: 300,
  /** User status - 1 minute */
  STATUS: 60
} as const;

/**
 * User cache key builder with support for tags and patterns
 */
export class UserCacheKeyBuilder {
  static tenantVersion(tenantId: number): string {
    return `tenant:${tenantId}:${USER_CACHE_NAMESPACE}:version`;
  }

  /**
   * Build cache key for single user entity
   */
  static userEntity(tenantId: number, userId: number, version: string): string {
    return `tenant:${tenantId}:${USER_CACHE_NAMESPACE}:v${version}:entity:${userId}`;
  }

  /**
   * Build cache key for user list page
   */
  static userList(tenantId: number, page: number, pageSize: number, version: string): string {
    const offset = (page - 1) * pageSize;
    return `tenant:${tenantId}:${USER_CACHE_NAMESPACE}:v${version}:list:page=${page}:size=${pageSize}:offset=${offset}`;
  }

  /**
   * Build cache key for user permissions
   */
  static userPermissions(tenantId: number, userId: number, version: string): string {
    return `tenant:${tenantId}:${USER_CACHE_NAMESPACE}:v${version}:permissions:${userId}`;
  }

  /**
   * Build cache key for user profile
   */
  static userProfile(tenantId: number, userId: number, version: string): string {
    return `tenant:${tenantId}:${USER_CACHE_NAMESPACE}:v${version}:profile:${userId}`;
  }

  /**
   * Build cache key for user status
   */
  static userStatus(tenantId: number, userId: number, version: string): string {
    return `tenant:${tenantId}:${USER_CACHE_NAMESPACE}:v${version}:status:${userId}`;
  }

  /**
   * Build cache key for user by email hash
   */
  static userByEmailHash(tenantId: number, emailHash: string, version: string): string {
    return `tenant:${tenantId}:${USER_CACHE_NAMESPACE}:v${version}:email:${emailHash}`;
  }
}
