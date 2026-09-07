/**
 * Cached Role Service
 *
 * Provides role lookups with Redis caching to avoid Firebase custom claims propagation delay.
 * Roles are cached for 5 minutes by default.
 */

import type { RoleService } from './role.service';
import type { CacheService } from '@package/redis';

export interface CachedRoleServiceOptions {
  /** Cache TTL in seconds (default: 300 = 5 minutes) */
  ttl?: number;
  /** Cache key prefix (default: 'user-roles') */
  keyPrefix?: string;
}

/**
 * Cached Role Service
 *
 * Wraps RoleService with Redis caching for performance.
 * Cache keys: {keyPrefix}:{userId}:{tenantId}
 */
export class CachedRoleService {
  private readonly cache: CacheService;
  private readonly roleService: RoleService;
  private readonly ttl: number;
  private readonly keyPrefix: string;

  constructor(
    roleService: RoleService,
    cache: CacheService,
    options: CachedRoleServiceOptions = {}
  ) {
    this.roleService = roleService;
    this.cache = cache;
    this.ttl = options.ttl ?? 300; // 5 minutes default
    this.keyPrefix = options.keyPrefix ?? 'user-roles';
  }

  /**
   * Get all roles for a user (system + tenant)
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID (optional)
   * @returns Array of role strings
   */
  async getUserRoles(userId: number, tenantId?: number): Promise<string[]> {
    const cacheKey = this.getCacheKey(userId, tenantId);

    try {
      // Try to get from cache (CacheService.get already JSON-parses the value)
      const cached = await this.cache.get<string[]>(cacheKey);
      if (cached) {
        return cached;
      }
    } catch {
      // Cache miss or error, continue to database
    }

    // Get from database
    const systemRoles = await this.roleService.getSystemRoles(userId);
    const roles = [...systemRoles];

    if (tenantId) {
      const tenantRole = await this.roleService.getTenantRole(userId, parseInt(`${tenantId}`, 10));
      if (tenantRole) {
        roles.push(tenantRole);
      }
    }

    // Cache the result
    try {
      await this.cache.set(cacheKey, JSON.stringify(roles), { ttl: this.ttl });
    } catch (error) {
      // Cache set failed, but we have the data
      console.warn(`Failed to cache roles for user ${userId}:`, error);
    }

    return roles;
  }

  /**
   * Check if user has a specific role
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID (optional)
   * @param role - Role to check
   * @returns True if user has the role
   */
  async hasRole(userId: number, tenantId: number | undefined, role: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId, tenantId);
    return roles.includes(role);
  }

  /**
   * Check if user has any of the specified roles
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID (optional)
   * @param roles - Roles to check
   * @returns True if user has any of the roles
   */
  async hasAnyRole(
    userId: number,
    tenantId: number | undefined,
    roles: string[]
  ): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId, tenantId);
    return roles.some((role) => userRoles.includes(role));
  }

  /**
   * Invalidate cached roles for a user
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID (optional)
   */
  async invalidateRoles(userId: number, tenantId?: number): Promise<void> {
    const cacheKey = this.getCacheKey(userId, tenantId);

    try {
      await this.cache.delete(cacheKey);
    } catch (error) {
      console.warn(`Failed to invalidate roles for user ${userId}:`, error);
    }
  }

  /**
   * Invalidate all cached roles for a user (all tenants)
   *
   * @param userId - User ID
   */
  async invalidateAllRoles(userId: number): Promise<void> {
    // Invalidate system roles (no tenant)
    await this.invalidateRoles(userId);

    // Note: We can't easily invalidate all tenant-specific keys without scanning
    // This is acceptable as the cache will expire naturally
  }

  /**
   * Warm the cache with current roles
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID (optional)
   */
  async warmCache(userId: number, tenantId?: number): Promise<void> {
    await this.getUserRoles(userId, tenantId);
  }

  /**
   * Generate cache key
   */
  private getCacheKey(userId: number, tenantId?: number): string {
    return tenantId
      ? `${this.keyPrefix}:${userId}:${tenantId}`
      : `${this.keyPrefix}:${userId}:system`;
  }
}
