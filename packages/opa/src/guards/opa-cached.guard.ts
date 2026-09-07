/**
 * OPA Cached Guard
 *
 * High-performance NestJS guard that extends OpaGuard with in-memory caching
 * to reduce OPA server load on frequently accessed endpoints.
 *
 * ## Caching Strategy
 *
 * - **Cache Key**: `{tenantId}:{userId}:{resourceType}:{resourceId}:{action}`
 * - **TTL (Time-To-Live)**: 5 minutes (300,000ms)
 * - **Max Entries**: 1,000 entries
 * - **Eviction Policy**: FIFO (First-In-First-Out) when cache is full
 * - **Cached Decisions**: Only positive (allow) decisions are cached; denies always query OPA
 *
 * ## When to Use
 *
 * - High-traffic read endpoints where authorization rarely changes
 * - Endpoints where slight staleness (up to 5 min) is acceptable
 * - Performance-critical paths with predictable access patterns
 *
 * ## When NOT to Use
 *
 * - Endpoints where real-time authorization changes are critical
 * - Write operations that might invalidate permissions
 * - Low-traffic endpoints (caching overhead not worth it)
 *
 * ## Cache Invalidation
 *
 * The cache does NOT automatically invalidate when:
 * - User roles change
 * - Resource ownership changes
 * - Policies are updated in OPA
 *
 * For immediate invalidation, call `clearCache()` or restart the service.
 *
 * @module @package/opa
 * @see {@link OpaGuard} for non-cached authorization
 */

import { Injectable, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OpaService } from '../opa.service';
import { RESOURCE_KEY, ACTION_KEY } from '../decorators';
import type { CanActivate } from '@nestjs/common';

/**
 * Cache entry storing an authorization decision with timestamp.
 *
 * @property decision - The cached authorization result (true = allow, false = deny)
 * @property timestamp - Unix timestamp (ms) when the entry was created
 */
interface IAuthzCacheEntry {
  decision: boolean;
  timestamp: number;
}

/**
 * OPA Authorization Guard with In-Memory Caching
 *
 * Extends the authorization pattern with a high-performance caching layer that stores
 * authorization decisions to reduce OPA server queries. Ideal for read-heavy
 * endpoints where the same user repeatedly accesses the same resources.
 *
 * ## Cache Configuration
 *
 * | Setting | Value | Description |
 * |---------|-------|-------------|
 * | TTL | 5 minutes | How long entries remain valid |
 * | Max Size | 1,000 entries | Maximum cache capacity |
 * | Eviction | FIFO | Oldest entry removed when full |
 *
 * ## Performance Characteristics
 *
 * - **Cache Hit**: ~0ms (no network call)
 * - **Cache Miss**: Same as OpaGuard (~5-50ms depending on OPA latency)
 * - **Memory Usage**: ~200 bytes per entry (estimate)
 *
 * @example Basic usage on a read endpoint
 * ```typescript
 * import { Controller, Get, UseGuards, Param } from '@nestjs/common';
 * import { OpaCachedGuard, Resource, Action } from '@package/opa';
 *
 * @Controller('organizations')
 * @UseGuards(JwtAuthGuard, OpaCachedGuard)
 * @Resource('organization')
 * export class OrganizationsController {
 *
 *   @Get(':id')
 *   @Action('read')
 *   findOne(@Param('id') id: string) {
 *     // Cache key: "tenant-001:user-123:organization:org-456:read"
 *     // Subsequent calls within 5 min skip OPA query
 *     return this.organizationService.findOne(id);
 *   }
 *
 *   @Get()
 *   @Action('list')
 *   findAll() {
 *     // Cache key: "tenant-001:user-123:organization:none:list"
 *     return this.organizationService.findAll();
 *   }
 * }
 * ```
 *
 * @example Monitoring cache usage
 * ```typescript
 * @Controller('admin/cache')
 * export class CacheController {
 *   constructor(
 *     @Inject(OpaCachedGuard) private opaCachedGuard: OpaCachedGuard
 *   ) {}
 *
 *   @Get('opa/stats')
 *   getStats() {
 *     return { size: this.opaCachedGuard.getCacheSize() };
 *   }
 *
 *   @Post('opa/clear')
 *   clearCache() {
 *     this.opaCachedGuard.clearCache();
 *     return { cleared: true };
 *   }
 * }
 * ```
 *
 * @see {@link OpaGuard} for non-cached authorization
 */
@Injectable()
export class OpaCachedGuard implements CanActivate {
  private readonly logger = new Logger(OpaCachedGuard.name);

  /** In-memory cache storing authorization decisions keyed by user:resource:action */
  private readonly cache = new Map<string, IAuthzCacheEntry>();

  /** Time-to-live for cache entries in milliseconds (5 minutes) */
  private readonly cacheTtl = 5 * 60 * 1000; // 5 minutes

  /** Maximum number of entries before FIFO eviction begins */
  private readonly maxCacheSize = 1000;

  constructor(
    private readonly reflector: Reflector,
    private readonly opaService: OpaService
  ) {}

  /**
   * Checks if user is authorized, using cache when available.
   *
   * ## Authorization Flow with Caching
   *
   * 1. Extract user, resource, and action from context
   * 2. Generate cache key: `{tenantId}:{userId}:{resourceType}:{resourceId}:{action}`
   * 3. Check cache:
   *    - **Cache Hit (valid)**: Return cached decision immediately
   *    - **Cache Hit (expired)**: Delete entry, proceed to OPA query
   *    - **Cache Miss**: Proceed to OPA query
   * 4. Query OPA
   * 5. Store result in cache
   * 6. Return decision or throw ForbiddenException
   *
   * @param context - NestJS execution context
   * @returns Promise resolving to `true` if authorized
   * @throws {ForbiddenException} When user is not authenticated
   * @throws {ForbiddenException} When authorization is denied (from cache or OPA)
   *
   * @example Cache key examples
   * ```typescript
   * // GET /organizations/org-123 with user-456 in tenant-001
   * // Key: "tenant-001:user-456:organization:org-123:read"
   *
   * // GET /organizations (list) with user-456 in tenant-001
   * // Key: "tenant-001:user-456:organization:none:list"
   *
   * // PATCH /documents/doc-789 with user-456 in tenant-001
   * // Key: "tenant-001:user-456:document:doc-789:update"
   * ```
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Extract resource and action metadata from decorators
    const resourceMetadata = this.reflector.getAllAndOverride<{ type: string; scope?: string }>(
      RESOURCE_KEY,
      [context.getHandler(), context.getClass()]
    );

    const actionMetadata = this.reflector.getAllAndOverride<string>(ACTION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!resourceMetadata || !actionMetadata) {
      throw new ForbiddenException('Resource and action must be specified');
    }

    const resourceType = resourceMetadata.type;
    const action = actionMetadata;
    const resourceId = request.params?.id;

    if (!resourceType || !action) {
      throw new ForbiddenException('Resource and action must be specified');
    }

    // Extract tenant ID for cache key scoping (prevents cross-tenant cache collisions)
    // Multi-tenancy is mandatory - reject requests without tenant context
    const tenantId = user.organization_id ?? user.tenant_id ?? user.tenantId;

    if (!tenantId) {
      throw new ForbiddenException(
        'Tenant context required: user must have organization_id or tenant_id for authorization'
      );
    }

    // Generate cache key with tenant scoping
    const cacheKey = this.generateCacheKey(
      tenantId,
      user.id || user.userId || 'unknown',
      resourceType,
      resourceId,
      action
    );

    // Check cache
    const cachedDecision = this.getFromCache(cacheKey);

    if (cachedDecision !== null) {
      // Cache hit - return cached decision
      if (cachedDecision === false) {
        throw new ForbiddenException(
          `Access denied: insufficient privileges for ${action} on ${resourceType}`
        );
      }
      return cachedDecision;
    }

    // Cache miss - query OPA
    try {
      const authzRequest = {
        user: {
          id: user.userId || user.id,
          system_roles: user.systemRoles || user.system_roles || [],
          tenant_roles: user.tenantRoles || user.tenant_roles || [],
          organization_id: user.tenantId || user.organization_id || null,
          permissions: user.permissions || undefined,
          ...(user.attributes && { attributes: user.attributes })
        },
        resource: {
          type: resourceType,
          scope: resourceMetadata.scope || 'tenant',
          id: resourceId,
          owner_id: request.params?.userId,
          organization_id: tenantId
        },
        action
      };

      const isAuthorized = await this.opaService.isAuthorized(authzRequest);

      if (!isAuthorized) {
        throw new ForbiddenException(
          `Access denied: insufficient privileges for ${action} on ${resourceType}`
        );
      }

      // Store in cache
      this.setToCache(cacheKey, true);

      return true;
    } catch (error) {
      // Fail closed: deny access on error
      if (error instanceof ForbiddenException) {
        throw error; // Re-throw ForbiddenException
      }

      // Log the actual error server-side for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Authorization check failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );

      // Return generic message to client (no internal details per P0: Class-C data protection)
      throw new ForbiddenException('Authorization check failed');
    }
  }

  /**
   * Generates a cache key for the given authorization parameters.
   *
   * Format: `{tenantId}:{userId}:{resourceType}:{resourceId}:{action}`
   *
   * @param tenantId - Tenant ID for scoping
   * @param userId - User ID
   * @param resourceType - Type of resource being accessed
   * @param resourceId - Optional specific resource ID
   * @param action - Action being performed
   * @returns Formatted cache key
   */
  private generateCacheKey(
    tenantId: string | number,
    userId: string,
    resourceType: string,
    resourceId: string | undefined,
    action: string
  ): string {
    return `${tenantId}:${userId}:${resourceType}:${resourceId || 'none'}:${action}`;
  }

  /**
   * Retrieves a cached authorization decision if valid.
   *
   * Returns the cached decision if it exists and hasn't expired.
   * Returns null if the entry is expired or doesn't exist.
   *
   * @param cacheKey - Cache key to look up
   * @returns Cached decision or null
   */
  private getFromCache(cacheKey: string): boolean | null {
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null; // Cache miss
    }

    // Check if entry has expired
    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > this.cacheTtl) {
      // Entry expired - remove it
      this.cache.delete(cacheKey);
      return null;
    }

    // Return cached decision
    return entry.decision;
  }

  /**
   * Stores an authorization decision in the cache.
   *
   * Implements FIFO eviction when cache is full.
   *
   * @param cacheKey - Cache key to store
   * @param decision - Authorization decision to cache
   */
  private setToCache(cacheKey: string, decision: boolean): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxCacheSize && !this.cache.has(cacheKey)) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) this.cache.delete(firstKey);
    }

    // Store new entry
    this.cache.set(cacheKey, {
      decision,
      timestamp: Date.now()
    });
  }

  /**
   * Returns the current size of the cache.
   *
   * Useful for monitoring and diagnostics.
   *
   * @returns Number of entries in the cache
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Clears all cached authorization decisions.
   *
   * Useful for testing or when policies are updated.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
