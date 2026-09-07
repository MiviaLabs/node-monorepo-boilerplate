/**
 * Cached Permission Service
 *
 * Redis-backed caching layer for permission resolution.
 * Enhances Firebase provider RBAC by reducing database queries.
 */

import { Injectable, Logger } from '@nestjs/common';

import type { PermissionService } from './permission.service';
import type { CacheService } from '@package/redis';

/**
 * Cache configuration for permission caching
 */
export interface CachedPermissionConfig {
  /** Time to live for cached permissions in seconds (default: 300 = 5 minutes) */
  ttl?: number;
  /** Permission version for cache invalidation (increment to invalidate all) */
  permissionVersion?: number;
}

/**
 * Default cache TTL: 5 minutes
 */
const DEFAULT_TTL = 300;

/**
 * Redis key prefix for permission cache
 */
const CACHE_KEY_PREFIX = 'permissions';

/**
 * Cached Permission Service
 *
 * Provides Redis-backed caching for user permissions.
 * Falls back to PermissionService on cache miss.
 *
 * Cache key format: `permissions:{userId}:{tenantId}:{perm_version}`
 * - If tenantId is undefined, uses 'global' for system permissions only
 * - perm_version allows for bulk cache invalidation
 *
 * @example Injecting CachedPermissionService in a NestJS service
 * ```typescript
 * import { Injectable } from '@nestjs/common';
 * import { CachedPermissionService } from '@package/auth';
 *
 * @Injectable()
 * export class AuthorizationService {
 *   constructor(
 *     private readonly cachedPermissionService: CachedPermissionService
 *   ) {}
 *
 *   async authorize(userId: number, tenantId: number, permission: string) {
 *     const hasPermission = await this.cachedPermissionService.hasPermission(
 *       userId, tenantId, permission
 *     );
 *     if (!hasPermission) {
 *       throw new ForbiddenException(`Missing permission: ${permission}`);
 *     }
 *   }
 * }
 * ```
 *
 * @example Cache invalidation after role changes
 * ```typescript
 * async updateUserRole(userId: number, tenantId: number, newRole: string) {
 *   // Update role in database
 *   await this.roleService.updateRole(userId, tenantId, newRole);
 *
 *   // Invalidate cached permissions to force refresh
 *   await this.cachedPermissionService.invalidatePermissions(userId, tenantId);
 * }
 * ```
 */
@Injectable()
export class CachedPermissionService {
  private readonly logger = new Logger(CachedPermissionService.name);
  private readonly permissionVersion: number;
  private readonly ttl: number;

  constructor(
    private readonly permissionService: PermissionService,
    private readonly cache: CacheService,
    config: CachedPermissionConfig = {}
  ) {
    this.permissionVersion = config.permissionVersion ?? 1;
    this.ttl = config.ttl ?? DEFAULT_TTL;
  }

  /**
   * Get all permissions for a user (cached)
   *
   * Checks Redis cache first, falls back to PermissionService on miss.
   *
   * @param userId - User ID
   * @param tenantId - Optional tenant ID for tenant-scoped permissions
   * @returns Array of unique permission strings
   *
   * @example Getting cached permissions
   * ```typescript
   * const permissions = await cachedPermissionService.getUserPermissions(
   *   userId, tenantId
   * );
   * // First call: cache miss, queries database, stores in Redis
   * // Subsequent calls: cache hit, returns from Redis
   * ```
   */
  async getUserPermissions(userId: number, tenantId?: number): Promise<string[]> {
    const cacheKey = this.buildCacheKey(userId, tenantId);

    try {
      // Try cache first
      const cached = await this.cache.get<string[]>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for user ${userId} permissions`);
        return cached;
      }

      // Cache miss - get from database
      this.logger.debug(`Cache miss for user ${userId} permissions`);
      const permissions = await this.permissionService.getUserPermissions(userId, tenantId);

      // Store in cache
      await this.cache.set(cacheKey, permissions, { ttl: this.ttl });

      return permissions;
    } catch (error) {
      this.logger.error(
        `Failed to get cached permissions for user ${userId}, falling back to direct query`,
        error
      );

      // Fallback to direct query on cache failure
      return this.permissionService.getUserPermissions(userId, tenantId);
    }
  }

  /**
   * Check if user has a specific permission (cached)
   *
   * @param userId - User ID
   * @param tenantId - Optional tenant ID for tenant-scoped permissions
   * @param requiredPermission - Permission to check for
   * @returns True if user has the permission, false otherwise
   *
   * @example Permission check with caching
   * ```typescript
   * const canEdit = await cachedPermissionService.hasPermission(
   *   userId,
   *   tenantId,
   *   'documents:edit'
   * );
   *
   * if (!canEdit) {
   *   throw new ForbiddenException('Cannot edit documents');
   * }
   * ```
   */
  async hasPermission(
    userId: number,
    tenantId: number | undefined,
    requiredPermission: string
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, tenantId);
    return permissions.includes(requiredPermission);
  }

  /**
   * Invalidate cached permissions for a user
   *
   * Call this after role changes to ensure fresh permissions on next request.
   *
   * @param userId - User ID to invalidate permissions for
   * @param tenantId - Optional tenant ID (if provided, only invalidates tenant-specific cache)
   *
   * @example Invalidating cache after role update
   * ```typescript
   * // User's role changed in tenant 123
   * await roleService.assignRole(userId, tenantId, 'editor');
   *
   * // Invalidate cached permissions for this tenant
   * await cachedPermissionService.invalidatePermissions(userId, tenantId);
   *
   * // Next permission check will fetch fresh data from database
   * ```
   */
  async invalidatePermissions(userId: number, tenantId?: number): Promise<void> {
    try {
      const cacheKey = this.buildCacheKey(userId, tenantId);
      await this.cache.delete(cacheKey);
      this.logger.debug(
        `Invalidated permissions cache for user ${userId}${tenantId ? ` in tenant ${tenantId}` : ''}`
      );
    } catch (error) {
      this.logger.error(`Failed to invalidate permissions cache for user ${userId}`, error);
    }
  }

  /**
   * Invalidate all permission caches for a user
   *
   * Invalidates both system and all tenant-scoped permission caches.
   * Uses pattern matching to delete all permission keys for the user.
   *
   * @param userId - User ID to invalidate all permissions for
   */
  async invalidateAllPermissions(userId: number): Promise<void> {
    try {
      const pattern = `${CACHE_KEY_PREFIX}:${userId}:*`;
      await this.cache.invalidatePattern(pattern);
      this.logger.debug(`Invalidated all permission caches for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to invalidate all permission caches for user ${userId}`, error);
    }
  }

  /**
   * Invalidate all permission caches globally
   *
   * USE WITH CAUTION: This clears all cached permissions for all users.
   * Useful when permission mappings change (e.g., ROLE_PERMISSIONS updated).
   *
   * Increments the permission version to invalidate existing keys.
   */
  async invalidateGlobalPermissions(): Promise<void> {
    try {
      const pattern = `${CACHE_KEY_PREFIX}:*`;
      await this.cache.invalidatePattern(pattern);
      this.logger.warn('Invalidated all permission caches globally');
    } catch (error) {
      this.logger.error('Failed to invalidate global permission caches', error);
    }
  }

  /**
   * Warm up the cache for a user
   *
   * Pre-loads permissions into cache. Useful for proactive caching
   * before critical operations or after role changes.
   *
   * @param userId - User ID to warm cache for
   * @param tenantId - Optional tenant ID
   *
   * @example Warming cache after login
   * ```typescript
   * async onUserLogin(userId: number, tenantIds: number[]) {
   *   // Warm cache for all user's tenants
   *   await Promise.all(
   *     tenantIds.map(tenantId =>
   *       cachedPermissionService.warmCache(userId, tenantId)
   *     )
   *   );
   * }
   * ```
   *
   * @example Warming cache after role assignment
   * ```typescript
   * async assignRole(userId: number, tenantId: number, role: string) {
   *   await roleService.assign(userId, tenantId, role);
   *
   *   // Invalidate old cache and warm with new permissions
   *   await cachedPermissionService.invalidatePermissions(userId, tenantId);
   *   await cachedPermissionService.warmCache(userId, tenantId);
   * }
   * ```
   */
  async warmCache(userId: number, tenantId?: number): Promise<void> {
    try {
      const permissions = await this.permissionService.getUserPermissions(userId, tenantId);
      const cacheKey = this.buildCacheKey(userId, tenantId);
      await this.cache.set(cacheKey, permissions, { ttl: this.ttl });
      this.logger.debug(
        `Warmed permission cache for user ${userId}${tenantId ? ` in tenant ${tenantId}` : ''}`
      );
    } catch (error) {
      this.logger.error(`Failed to warm permission cache for user ${userId}`, error);
    }
  }

  /**
   * Build cache key for user permissions
   *
   * Format: `permissions:{userId}:{tenantId}:{perm_version}`
   * - Uses 'global' for system permissions when tenantId is undefined
   *
   * @param userId - User ID
   * @param tenantId - Optional tenant ID
   * @returns Redis cache key
   * @private
   */
  private buildCacheKey(userId: number, tenantId?: number): string {
    const tenantPart = tenantId ?? 'global';
    return `${CACHE_KEY_PREFIX}:${userId}:${tenantPart}:v${this.permissionVersion}`;
  }
}
