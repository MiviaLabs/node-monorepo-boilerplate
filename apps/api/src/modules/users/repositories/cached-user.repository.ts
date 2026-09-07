import { createHash } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CachedPermissionService } from '@package/auth';
import { SYSTEM_PERMISSIONS, TENANT_PERMISSIONS } from '@package/constants';
import { users, eq, and, sql, type NodePgDatabase, NewUser, User } from '@package/db-core';
import { Logger, MetricsService } from '@package/observability';
import { CacheService } from '@package/redis';

import { MAIN_DB } from '@/common/database/database.constants';
import { CachedBaseRepository } from '@/common/infrastructure/repositories/cached-base.repository';
import { UserCacheKeyBuilder, USER_CACHE_TTL } from '@/modules/users/users.cache-keys';

/**
 * No-op permission service for unit tests
 * Always returns true (grants all permissions)
 */
class NoOpPermissionService {
  hasPermission(): boolean {
    return true;
  }
}

/**
 * User context interface for authorization checks
 *
 * Provided by controllers/handlers to repositories for authorization.
 */
export interface RepositoryUserContext {
  /** User ID from JWT */
  userId: number;
  /** Tenant ID (organization ID) from x-tenant-id header */
  tenantId: number;
  /** User roles from JWT */
  roles?: string[];
}

export interface CreateUserData {
  organizationId: number;
}

export interface UpdateUserData {
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Cached user repository
 *
 * Handles data access for users table with:
 * - Tenant scoping and authorization
 * - Email hashing for O(1) lookups
 * - Redis caching with automatic invalidation
 * - Tag-based and pattern-based invalidation
 * - OpenTelemetry metrics
 *
 * Authorization rules:
 * - Self-access: Users can always access their own data
 * - System permissions: system:users:* allows cross-tenant access
 * - Tenant permissions: tenant:users:* allows same-tenant access
 * - Throws ForbiddenException for unauthorized access
 *
 * @extends CachedBaseRepository
 */
@Injectable()
export class CachedUserRepository extends CachedBaseRepository<
  User,
  NewUser,
  UpdateUserData,
  number
> {
  constructor(
    @Inject(MAIN_DB) protected override readonly db: NodePgDatabase,
    cache: CacheService,
    config: ConfigService,
    logger: Logger,
    metrics: MetricsService,
    @Optional()
    private readonly permissionService:
      | CachedPermissionService
      | NoOpPermissionService = new NoOpPermissionService()
  ) {
    super(db, cache, config, logger, metrics, 'users');
  }

  /**
   * Get the users table
   */
  protected getTable(): typeof users {
    return users;
  }

  /**
   * Get the ID column for queries
   */
  protected getIdColumn(): typeof users.id {
    return users.id;
  }

  /**
   * Get the tenant column for scoping
   */
  protected getTenantColumn(): typeof users.organizationId {
    return users.organizationId;
  }

  /**
   * Get the entity name for error messages
   */
  protected getEntityName(): string {
    return 'User';
  }

  /**
   * Authorization helper: Check if user can access target user
   *
   * Rules:
   * - Users can always access their own data (self-access)
   * - System permissions (system:users:read) allow cross-tenant access
   * - Tenant permissions (tenant:users:read) allow same-tenant access
   *
   * @param userContext - Requesting user context
   * @param targetUserId - Target user ID to access
   * @param targetTenantId - Target user's tenant ID
   * @param requiredPermission - Permission to check (defaults to read)
   * @throws ForbiddenException if unauthorized
   */
  private async authorizeAccess(
    userContext: RepositoryUserContext | undefined,
    targetUserId: number,
    targetTenantId: number,
    requiredPermission: string = TENANT_PERMISSIONS.USERS_READ
  ): Promise<void> {
    // If no user context, allow public access (for registration, etc.)
    if (!userContext) {
      return;
    }

    const { userId, tenantId } = userContext;

    // Rule 1: Self-access - users can always access their own data
    if (userId === targetUserId) {
      return;
    }

    // Rule 2: System permissions - allow cross-tenant access
    const systemReadPermission = SYSTEM_PERMISSIONS.USERS_READ;
    const hasSystemPermission = await this.permissionService.hasPermission(
      userId,
      undefined,
      systemReadPermission
    );

    if (hasSystemPermission) {
      return;
    }

    // Rule 3: Tenant permissions - allow same-tenant access
    // Only if target user is in the same tenant as requesting user
    if (tenantId === targetTenantId) {
      const hasTenantPermission = await this.permissionService.hasPermission(
        userId,
        tenantId,
        requiredPermission
      );

      if (hasTenantPermission) {
        return;
      }
    }

    // Access denied - throw ForbiddenException
    throw new ForbiddenException(
      `You do not have permission to access user ${targetUserId}. ` +
        `Required permission: ${requiredPermission} or ${systemReadPermission}`
    );
  }

  /**
   * Authorization helper: Check if user can perform write operation
   *
   * @param userContext - Requesting user context
   * @param targetUserId - Target user ID
   * @param targetTenantId - Target user's tenant ID
   * @param operation - Operation type (create, update, delete)
   * @throws ForbiddenException if unauthorized
   */
  private async authorizeWrite(
    userContext: RepositoryUserContext | undefined,
    targetUserId: number,
    targetTenantId: number,
    // eslint-disable-next-line local-rules/prefer-const-enum
    operation: 'create' | 'update' | 'delete'
  ): Promise<void> {
    const tenantPermissionMap = {
      create: TENANT_PERMISSIONS.USERS_CREATE,
      update: TENANT_PERMISSIONS.USERS_UPDATE,
      delete: TENANT_PERMISSIONS.USERS_DELETE
    };

    await this.authorizeAccess(
      userContext,
      targetUserId,
      targetTenantId,
      tenantPermissionMap[operation]
    );
  }

  /**
   * Hash email for storage and lookup
   * Uses SHA-256 for consistent, irreversible hashing
   *
   * @param email - Email address to hash
   * @returns Hex-encoded SHA-256 hash
   */
  private hashEmail(email: string): string {
    return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  /**
   * Count total users for a tenant
   *
   * @param tenantId - Tenant ID
   * @param userContext - User context for authorization (optional for public endpoints)
   */
  async count(tenantId: number, userContext?: RepositoryUserContext): Promise<number> {
    // Authorization check: user must have permission to list users in this tenant
    if (userContext) {
      const hasPermission = await this.permissionService.hasPermission(
        userContext.userId,
        tenantId,
        TENANT_PERMISSIONS.USERS_READ
      );

      const hasSystemPermission = await this.permissionService.hasPermission(
        userContext.userId,
        undefined,
        SYSTEM_PERMISSIONS.USERS_READ
      );

      if (!hasPermission && !hasSystemPermission) {
        throw new ForbiddenException(
          `You do not have permission to list users in tenant ${tenantId}. ` +
            `Required permission: ${TENANT_PERMISSIONS.USERS_READ} or ${SYSTEM_PERMISSIONS.USERS_READ}`
        );
      }
    }

    if (!this.isCacheEnabled()) {
      return this.countFromDb(tenantId);
    }

    return this.measureCacheOperation('count', async () => {
      const cacheVersion = await this.getTenantCacheVersion(tenantId);
      const cacheKey = UserCacheKeyBuilder.userStatus(tenantId, 0, cacheVersion);
      const cached = await this.cache.get<number>(cacheKey);
      if (cached !== null) {
        this.recordCacheHit('count');
        return cached;
      }

      this.recordCacheMiss('count');
      const count = await this.countFromDb(tenantId);
      await this.cache.set(cacheKey, count, { ttl: USER_CACHE_TTL.STATUS });
      return count;
    });
  }

  private async countFromDb(tenantId: number): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.organizationId, tenantId));
    return result[0]?.count ?? 0;
  }

  /**
   * Find users with pagination
   *
   * @param tenantId - Tenant ID
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of items per page
   * @param userContext - User context for authorization (optional for public endpoints)
   */
  async findWithPagination(
    tenantId: number,
    page: number,
    pageSize: number,
    userContext?: RepositoryUserContext
  ): Promise<User[]> {
    // Authorization check: user must have permission to list users in this tenant
    if (userContext) {
      const hasPermission = await this.permissionService.hasPermission(
        userContext.userId,
        tenantId,
        TENANT_PERMISSIONS.USERS_READ
      );

      const hasSystemPermission = await this.permissionService.hasPermission(
        userContext.userId,
        undefined,
        SYSTEM_PERMISSIONS.USERS_READ
      );

      if (!hasPermission && !hasSystemPermission) {
        throw new ForbiddenException(
          `You do not have permission to list users in tenant ${tenantId}. ` +
            `Required permission: ${TENANT_PERMISSIONS.USERS_READ} or ${SYSTEM_PERMISSIONS.USERS_READ}`
        );
      }
    }

    if (!this.isCacheEnabled()) {
      return this.findWithPaginationFromDb(tenantId, page, pageSize);
    }

    return this.measureCacheOperation('findWithPagination', async () => {
      const cacheVersion = await this.getTenantCacheVersion(tenantId);
      const cacheKey = UserCacheKeyBuilder.userList(tenantId, page, pageSize, cacheVersion);
      const cached = await this.cache.get<User[]>(cacheKey);
      if (cached !== null) {
        this.recordCacheHit('findWithPagination');
        return cached;
      }

      this.recordCacheMiss('findWithPagination');
      const result = await this.findWithPaginationFromDb(tenantId, page, pageSize);
      await this.cache.set(cacheKey, result, { ttl: USER_CACHE_TTL.LIST });
      return result;
    });
  }

  private async findWithPaginationFromDb(
    tenantId: number,
    page: number,
    pageSize: number
  ): Promise<User[]> {
    const offset = (page - 1) * pageSize;

    return this.db
      .select()
      .from(users)
      .where(eq(users.organizationId, tenantId))
      .orderBy(users.createdAt)
      .limit(pageSize)
      .offset(offset) as Promise<User[]>;
  }

  /**
   * Find user by email hash with caching
   * Provides O(1) lookup performance via indexed emailHash column
   *
   * @param tenantId - Tenant ID
   * @param email - Email address to search for
   * @returns User or null if not found
   */
  async findByEmail(tenantId: number, email: string): Promise<User | null> {
    const emailHash = this.hashEmail(email);

    if (!this.isCacheEnabled()) {
      return this.findByEmailHashFromDb(tenantId, emailHash);
    }

    return this.measureCacheOperation('findByEmail', async () => {
      const cacheVersion = await this.getTenantCacheVersion(tenantId);
      const cacheKey = UserCacheKeyBuilder.userByEmailHash(tenantId, emailHash, cacheVersion);
      const cached = await this.cache.get<User>(cacheKey);
      if (cached !== null) {
        this.recordCacheHit('findByEmail');
        return cached;
      }

      this.recordCacheMiss('findByEmail');
      const user = await this.findByEmailHashFromDb(tenantId, emailHash);

      if (user !== null) {
        await this.cache.set(cacheKey, user, { ttl: USER_CACHE_TTL.ENTITY });
      }

      return user;
    });
  }

  private async findByEmailHashFromDb(tenantId: number, emailHash: string): Promise<User | null> {
    const [result] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, tenantId), eq(users.emailHash, emailHash)))
      .limit(1);

    return result ?? null;
  }

  /**
   * Create a new user with data containing organizationId
   * This is a convenience method that extracts organizationId from the data
   * and calls the base class create method.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async createWithOrg(data: CreateUserData & { emailHash?: string }): Promise<User> {
    const emailHash = data.emailHash ?? this.hashEmail(''); // Empty email if not provided
    return super.create(data.organizationId, { emailHash } as NewUser);
  }

  /**
   * Create a new user
   * This method maintains backward compatibility with the existing API.
   * For new code, prefer using createWithOrg() or the base class create().
   */
  async createSimple(data: CreateUserData & { emailHash?: string }): Promise<User> {
    const emailHash = data.emailHash ?? this.hashEmail('');

    // Directly insert to maintain backward compatibility with existing code
    const [user] = await this.db
      .insert(users)
      .values({
        organizationId: data.organizationId,
        emailHash
      } as NewUser)
      .returning();
    return user as User;
  }

  /**
   * Update a user
   * Overrides BaseRepository.update to add verification step,
   * authorization checks, and cache invalidation
   *
   * @param tenantId - Tenant ID
   * @param id - User ID to update
   * @param data - Update data
   * @param userContext - User context for authorization (optional for public endpoints)
   */
  override async update(
    tenantId: number,
    id: number,
    data: UpdateUserData,
    userContext?: RepositoryUserContext
  ): Promise<User> {
    // Authorization check before update
    await this.authorizeWrite(userContext, id, tenantId, 'update');

    // First verify user exists and belongs to tenant
    await this.findByIdOrThrow(tenantId, id);
    // Call parent update (includes cache invalidation)
    return super.update(tenantId, id, data);
  }

  /**
   * Delete a user
   * Overrides BaseRepository.delete to add verification step,
   * authorization checks, and cache invalidation
   *
   * @param tenantId - Tenant ID
   * @param id - User ID to delete
   * @param userContext - User context for authorization (optional for public endpoints)
   */
  override async delete(
    tenantId: number,
    id: number,
    userContext?: RepositoryUserContext
  ): Promise<void> {
    // Authorization check before delete
    await this.authorizeWrite(userContext, id, tenantId, 'delete');

    // First verify user exists and belongs to tenant
    await this.findByIdOrThrow(tenantId, id);
    // Call parent delete (includes cache invalidation)
    return super.delete(tenantId, id);
  }

  /**
   * Invalidate user-specific caches by tags
   * Call this when user permissions, profile, or status changes
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @param tags - Tags to invalidate (e.g., 'permissions', 'profile', 'status')
   */
  async invalidateUserTags(tenantId: number, userId: number, tags: string[]): Promise<void> {
    if (!this.isCacheEnabled()) {
      return;
    }

    if (tags.length > 0) {
      await this.invalidateListCache(tenantId);
    }

    // Also invalidate the specific entity cache
    await this.invalidateEntity(tenantId, userId);
  }

  /**
   * Clear all user-related caches for a tenant
   * Useful for bulk operations or tenant-wide changes
   *
   * @param tenantId - Tenant ID
   */
  async clearAllUserCaches(tenantId: number): Promise<void> {
    await this.clearTenantCache(tenantId);
  }
}
