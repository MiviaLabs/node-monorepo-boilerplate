import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger, MetricsService } from '@package/observability';
import { CacheService } from '@package/redis';

import { BaseRepository, type CreateInput } from './base.repository';

import type { CacheConfig as AppConfigCacheConfig } from '@/config/cache.config';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Entity ID type
 */
type EntityId = string | number;

/**
 * Counter type from OpenTelemetry
 */
interface Counter {
  add(value: number, attributes?: Record<string, unknown>): void;
}

/**
 * Histogram type from OpenTelemetry
 */
interface Histogram {
  record(value: number, attributes?: Record<string, unknown>): void;
}

/**
 * Tenant ID type - supports both string (UUID) and number (serial/bigint)
 */
type TenantId = string | number;

/**
 * Cache configuration interface
 */
export interface CacheConfig {
  /**
   * Whether caching is enabled
   */
  enabled: boolean;

  /**
   * Default TTL in seconds for single entity cache
   */
  defaultTTL: number;

  /**
   * Default TTL in seconds for list cache
   */
  listTTL: number;
}

/**
 * Cache key builder interface
 */
export interface CacheKeyBuilder<TTenantId extends TenantId> {
  /**
   * Build cache key for single entity
   */
  buildEntityKey(tenantId: TTenantId, id: EntityId, version: string): string;

  /**
   * Build the tenant-domain version key
   */
  buildTenantVersionKey(tenantId: TTenantId): string;

  /**
   * Build cache key for specific list page
   */
  buildListKey(tenantId: TTenantId, params: Record<string, unknown>, version: string): string;

  /**
   * Build a tag marker key for metrics/debugging
   */
  buildTagKey(tenantId: TTenantId, tag: string, version: string): string;
}

/**
 * Default cache key builder with tenant-prefixed keys
 */
export class DefaultCacheKeyBuilder<
  TTenantId extends TenantId = string
> implements CacheKeyBuilder<TTenantId> {
  constructor(private readonly namespace: string) {}

  buildEntityKey(tenantId: TTenantId, id: EntityId, version: string): string {
    return `tenant:${tenantId}:${this.namespace}:v${version}:entity:${id}`;
  }

  buildTenantVersionKey(tenantId: TTenantId): string {
    return `tenant:${tenantId}:${this.namespace}:version`;
  }

  buildListKey(tenantId: TTenantId, params: Record<string, unknown>, version: string): string {
    const paramsHash = createHash('sha256')
      .update(stableSerializeCacheValue(params))
      .digest('hex')
      .slice(0, 24);
    return `tenant:${tenantId}:${this.namespace}:v${version}:list:${paramsHash}`;
  }

  buildTagKey(tenantId: TTenantId, tag: string, version: string): string {
    return `tenant:${tenantId}:${this.namespace}:v${version}:tag:${tag}`;
  }
}

function stableSerializeCacheValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return `string:${value}`;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${typeof value}:${String(value)}`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeCacheValue(entry)).join(',')}]`;
  }

  if (value instanceof Date) {
    return `date:${value.toISOString()}`;
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${key}:${stableSerializeCacheValue(objectValue[key])}`)
      .join(',')}}`;
  }

  return typeof value;
}

/**
 * Cached base repository with Redis caching
 * Extends BaseRepository with caching support for CRUD operations
 *
 * Features:
 * - Cache-aside pattern for reads
 * - Automatic cache invalidation on writes
 * - Tag-based and pattern-based invalidation
 * - OpenTelemetry metrics for cache operations
 * - Configurable TTL per operation type
 * - Tenant-prefixed cache keys
 *
 * @template TEntity - The entity type returned from queries
 * @template TInsert - The type for insert operations
 * @template TUpdate - The type for update operations
 * @template TTenantId - The tenant ID type (string | number), defaults to string
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class CachedUserRepository extends CachedBaseRepository<User, NewUser, UpdateUserData, number> {
 *   constructor(
 *     @Inject(MAIN_DB) db: NodePgDatabase,
 *     cache: CacheService,
 *     config: ConfigService,
 *     logger: Logger,
 *     metrics: MetricsService,
 *   ) {
 *     super(db, cache, config, logger, metrics, 'users');
 *   }
 *
 *   protected getTable() { return users; }
 *   protected getIdColumn() { return users.id; }
 *   protected getTenantColumn() { return users.organizationId; }
 *   protected getEntityName() { return 'User'; }
 * }
 * ```
 */
@Injectable()
export abstract class CachedBaseRepository<
  TEntity extends object,
  TInsert extends object,
  TUpdate extends object,
  TTenantId extends TenantId = string
> extends BaseRepository<TEntity, TInsert, TUpdate, TTenantId> {
  protected readonly cacheConfig: CacheConfig;
  protected readonly cacheKeyBuilder: CacheKeyBuilder<TTenantId>;

  // Metrics counters and histograms
  private cacheHitCounter: Counter;
  private cacheMissCounter: Counter;
  private cacheInvalidationCounter: Counter;
  private cacheOperationHistogram: Histogram;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected override readonly db: NodePgDatabase,
    protected readonly cache: CacheService,
    protected readonly config: ConfigService,
    protected readonly logger: Logger,
    protected readonly metrics: MetricsService,
    protected readonly namespace: string,
    cacheKeyBuilder?: CacheKeyBuilder<TTenantId>
  ) {
    super(db);
    this.cacheConfig = this.loadCacheConfig();
    this.cacheKeyBuilder = cacheKeyBuilder ?? new DefaultCacheKeyBuilder(namespace);

    // Initialize metrics
    this.cacheHitCounter = this.metrics.createCounter('cache.hit', 'Cache hit count');
    this.cacheMissCounter = this.metrics.createCounter('cache.miss', 'Cache miss count');
    this.cacheInvalidationCounter = this.metrics.createCounter(
      'cache.invalidation',
      'Cache invalidation count'
    );
    this.cacheOperationHistogram = this.metrics.createHistogram(
      'cache.operation.duration.ms',
      'Cache operation duration in milliseconds'
    );
  }

  /**
   * Load cache configuration from environment variables
   */
  protected loadCacheConfig(): CacheConfig {
    const cacheConfig = this.config.get<AppConfigCacheConfig>('cache');
    return {
      enabled: cacheConfig?.enabled ?? true,
      defaultTTL: cacheConfig?.ttl?.entity ?? 300,
      listTTL: cacheConfig?.ttl?.list ?? 60
    };
  }

  /**
   * Check if caching is enabled
   */
  protected isCacheEnabled(): boolean {
    return this.cacheConfig.enabled;
  }

  protected async getTenantCacheVersion(tenantId: TTenantId): Promise<string> {
    return this.cache.getVersion(this.cacheKeyBuilder.buildTenantVersionKey(tenantId));
  }

  protected async bumpTenantCacheVersion(tenantId: TTenantId): Promise<string> {
    const version = await this.cache.bumpVersion(
      this.cacheKeyBuilder.buildTenantVersionKey(tenantId)
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.logger as any).debug(`Bumped tenant cache version`, {
      tenantId,
      namespace: this.namespace,
      version
    });
    return version;
  }

  /**
   * Record cache hit metric
   */
  protected recordCacheHit(operation: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.cacheHitCounter as any).increment(1, { operation });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.logger as any).debug(`Cache hit: ${operation}`, { namespace: this.namespace });
  }

  /**
   * Record cache miss metric
   */
  protected recordCacheMiss(operation: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.cacheMissCounter as any).increment(1, { operation });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.logger as any).debug(`Cache miss: ${operation}`, { namespace: this.namespace });
  }

  /**
   * Record cache invalidation metric
   */
  protected recordCacheInvalidation(type: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.cacheInvalidationCounter as any).increment(1, { type });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.logger as any).debug(`Cache invalidated: ${type}`, { namespace: this.namespace });
  }

  /**
   * Record cache operation duration
   */
  protected async measureCacheOperation<T>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.cacheOperationHistogram.record(duration, { operation });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.cacheOperationHistogram.record(duration, { operation, status: 'error' });
      throw error;
    }
  }

  /**
   * Find entity by ID with caching
   */
  override async findById(tenantId: TTenantId, id: EntityId): Promise<TEntity | null> {
    if (!this.isCacheEnabled()) {
      return super.findById(tenantId, id);
    }

    return this.measureCacheOperation('findById', async () => {
      const cacheVersion = await this.getTenantCacheVersion(tenantId);
      const cacheKey = this.cacheKeyBuilder.buildEntityKey(tenantId, id, cacheVersion);

      // Try cache first
      const cached = await this.cache.get<TEntity>(cacheKey);
      if (cached !== null) {
        this.recordCacheHit('findById');
        return cached;
      }

      // Cache miss - fetch from DB
      this.recordCacheMiss('findById');
      const entity = await super.findById(tenantId, id);

      // Cache the result if found
      if (entity !== null) {
        await this.cache.set(cacheKey, entity, { ttl: this.cacheConfig.defaultTTL });
      }

      return entity;
    });
  }

  /**
   * Find many entities with caching
   */
  override findMany(
    tenantId: TTenantId,
    options?: {
      limit?: number;
      offset?: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where?: any;
    }
  ): Promise<TEntity[]> {
    if (!this.isCacheEnabled()) {
      return super.findMany(tenantId, options);
    }

    return this.measureCacheOperation('findMany', async () => {
      const cacheVersion = await this.getTenantCacheVersion(tenantId);
      const cacheKey = this.cacheKeyBuilder.buildListKey(
        tenantId,
        {
          limit: options?.limit ?? 50,
          offset: options?.offset ?? 0,
          where: options?.where ?? null
        },
        cacheVersion
      );

      // Try cache first
      const cached = await this.cache.get<TEntity[]>(cacheKey);
      if (cached !== null) {
        this.recordCacheHit('findMany');
        return cached;
      }

      // Cache miss - fetch from DB
      this.recordCacheMiss('findMany');
      const entities = await super.findMany(tenantId, options);

      // Cache the result
      await this.cache.set(cacheKey, entities, { ttl: this.cacheConfig.listTTL });

      return entities;
    });
  }

  /**
   * Create entity with cache invalidation
   */
  override async create(
    tenantId: TTenantId,
    data: CreateInput<TInsert, TTenantId>
  ): Promise<TEntity> {
    const entity = await super.create(tenantId, data);

    if (this.isCacheEnabled()) {
      await this.bumpTenantCacheVersion(tenantId);
      this.recordCacheInvalidation('create');
    }

    return entity;
  }

  /**
   * Update entity with cache invalidation
   */
  override async update(tenantId: TTenantId, id: EntityId, data: TUpdate): Promise<TEntity> {
    const entity = await super.update(tenantId, id, data);

    if (this.isCacheEnabled()) {
      await this.bumpTenantCacheVersion(tenantId);
      this.recordCacheInvalidation('update');
    }

    return entity;
  }

  /**
   * Delete entity with cache invalidation
   */
  override async delete(tenantId: TTenantId, id: EntityId): Promise<void> {
    await super.delete(tenantId, id);

    if (this.isCacheEnabled()) {
      await this.bumpTenantCacheVersion(tenantId);
      this.recordCacheInvalidation('delete');
    }
  }

  /**
   * Invalidate tenant-scoped read models by rotating the versioned key domain.
   */
  protected async invalidateListCache(tenantId: TTenantId): Promise<void> {
    await this.bumpTenantCacheVersion(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.logger as any).debug(`Invalidated list cache`, {
      tenantId,
      namespace: this.namespace
    });
  }

  /**
   * Invalidate cache by tag.
   *
   * Tag invalidation rotates the tenant read-model domain because tag-scoped reads should not
   * leave list or derived caches behind.
   */
  protected async invalidateByTag(tenantId: TTenantId, tag: string): Promise<void> {
    if (!this.isCacheEnabled()) {
      return;
    }

    await this.bumpTenantCacheVersion(tenantId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.logger as any).debug(`Invalidated cache by tag`, { tag, namespace: this.namespace });
    this.recordCacheInvalidation(`tag:${tag}`);
  }

  /**
   * Invalidate specific entity cache
   */
  protected async invalidateEntity(tenantId: TTenantId, id: EntityId): Promise<void> {
    if (!this.isCacheEnabled()) {
      return;
    }

    const cacheVersion = await this.getTenantCacheVersion(tenantId);
    const cacheKey = this.cacheKeyBuilder.buildEntityKey(tenantId, id, cacheVersion);
    await this.cache.delete(cacheKey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.logger as any).debug(`Invalidated entity cache`, { id, namespace: this.namespace });
    this.recordCacheInvalidation('entity');
  }

  /**
   * Clear all cache for a tenant
   */
  protected async clearTenantCache(tenantId: TTenantId): Promise<void> {
    if (!this.isCacheEnabled()) {
      return;
    }

    await this.bumpTenantCacheVersion(tenantId);
    await this.cache.invalidatePattern(`tenant:${tenantId}:${this.namespace}:v*`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (this.logger as any).debug(`Cleared all cache for tenant`, {
      tenantId,
      namespace: this.namespace
    });
    this.recordCacheInvalidation('tenant');
  }

  /**
   * Get cache with tags (for advanced caching scenarios)
   */
  protected async getWithTags(
    tenantId: TTenantId,
    id: EntityId,
    _tags: string[]
  ): Promise<TEntity | null> {
    if (!this.isCacheEnabled()) {
      return super.findById(tenantId, id);
    }

    return this.findById(tenantId, id);
  }
}
