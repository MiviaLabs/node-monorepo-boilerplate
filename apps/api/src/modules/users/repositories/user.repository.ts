import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { CachedPermissionService } from '@package/auth';
import { SYSTEM_PERMISSIONS, TENANT_PERMISSIONS } from '@package/constants';
import {
  users,
  desc,
  eq,
  and,
  isNull,
  sql,
  type NodePgDatabase,
  NewUser,
  User
} from '@package/db-core';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';
import { EncryptedStoreKeyService } from '../../encrypted-store/encrypted-store-key.service';

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
  emailHash?: string;
  isActive?: boolean;
  isVerified?: boolean;
}

export interface UpdateUserData {
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * User repository
 *
 * Handles data access for users table with tenant scoping and authorization
 * Extends BaseRepository with number-based tenant IDs (serial/bigint)
 *
 * Authorization rules:
 * - Self-access: Users can always access their own data
 * - System permissions: system:users:* allows cross-tenant access
 * - Tenant permissions: tenant:users:* allows same-tenant access
 * - Throws ForbiddenException for unauthorized access
 */
@Injectable()
export class UserRepository extends BaseRepository<User, NewUser, UpdateUserData, number> {
  private static readonly DEFAULT_ENCRYPTION_KEY_VERSION =
    'primary-encryption-key/cryptoKeyVersions/1';

  constructor(
    @Inject(MAIN_DB) protected override readonly db: NodePgDatabase,
    @Optional()
    private readonly permissionService:
      | CachedPermissionService
      | NoOpPermissionService = new NoOpPermissionService(),
    @Optional() private readonly encryptedStoreKeyService?: EncryptedStoreKeyService
  ) {
    super(db);
  }

  private async resolveEncryptionKeyVersion(): Promise<string> {
    if (!this.encryptedStoreKeyService) {
      return UserRepository.DEFAULT_ENCRYPTION_KEY_VERSION;
    }

    const { keyVersion } = await this.encryptedStoreKeyService.getPrimaryKeyIdWithVersion();
    return keyVersion;
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
   * Find user by ID within tenant scope, excluding soft-deleted users
   * Overrides base findById to filter out soft-deleted records
   */
  override async findById(tenantId: number, id: number): Promise<User | null> {
    const [result] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, tenantId), eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    return result ?? null;
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

    const [result] = await this.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(users)
      .where(and(eq(users.organizationId, tenantId), isNull(users.deletedAt)));

    if (!result) {
      return 0;
    }

    return result.count;
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

    const offset = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, tenantId), isNull(users.deletedAt)))
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset);
  }

  /**
   * Create a new user with data containing organizationId
   * This is a convenience method that extracts organizationId from the data
   * and calls the base class create method.
   */
  async createWithOrg(data: CreateUserData): Promise<User> {
    const emailHash = data.emailHash ?? hashEmail(`test-${Date.now()}@example.com`);
    const encryptionKeyVersion = await this.resolveEncryptionKeyVersion();
    return super.create(data.organizationId, {
      emailHash,
      isActive: data.isActive ?? true,
      isVerified: data.isVerified ?? false,
      encryptionKeyVersion
    });
  }

  /**
   * Create a new user
   * This method maintains backward compatibility with the existing API.
   * For new code, prefer using createWithOrg() or the base class create().
   */
  // @ts-expect-error - Different signature than base class for backward compatibility
  async create(data: CreateUserData): Promise<User> {
    const encryptionKeyVersion = await this.resolveEncryptionKeyVersion();
    // Directly insert to maintain backward compatibility with existing code
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [user] = await this.db
      .insert(users)
      .values({
        organizationId: data.organizationId,
        emailHash: data.emailHash ?? hashEmail(`test-${Date.now()}@example.com`),
        isActive: data.isActive ?? true,
        isVerified: data.isVerified ?? false,
        encryptionKeyVersion
      } as NewUser)
      .returning();
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  /**
   * Create a new user within a transaction
   *
   * This method accepts a transaction object and performs the insert within that transaction.
   * Use this when you need to perform multiple operations atomically (e.g., user creation + outbox event).
   *
   * @param tx - Database transaction object
   * @param data - User creation data
   * @returns Created user
   *
   * @example
   * ```typescript
   * await this.db.transaction(async (tx) => {
   *   const user = await this.repository.createWithTransaction(tx, { organizationId: 1, emailHash: 'abc' });
   *   await this.outboxRepo.insert(tx, { ... });
   *   // Transaction commits both user and outbox record atomically
   * });
   * ```
   */
  async createWithTransaction(tx: NodePgDatabase, data: CreateUserData): Promise<User> {
    const encryptionKeyVersion = await this.resolveEncryptionKeyVersion();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [user] = await tx
      .insert(users)
      .values({
        organizationId: data.organizationId,
        emailHash: data.emailHash ?? hashEmail(`test-${Date.now()}@example.com`),
        isActive: data.isActive ?? true,
        isVerified: data.isVerified ?? false,
        encryptionKeyVersion
      } as NewUser)
      .returning();
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  /**
   * Update a user
   * Overrides BaseRepository.update to add verification step and authorization
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
    // Call parent update
    return super.update(tenantId, id, data);
  }

  /**
   * Update a user within a transaction
   *
   * This method accepts a transaction object and performs the update within that transaction.
   * Use this when you need to perform multiple operations atomically (e.g., user update + outbox event).
   *
   * @param tx - Database transaction object
   * @param tenantId - Tenant ID for scoping
   * @param id - User ID to update
   * @param data - Update data
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns Updated user
   *
   * @example
   * ```typescript
   * await this.db.transaction(async (tx) => {
   *   const user = await this.repository.updateWithTransaction(tenantId, tx, userId, { updatedAt: new Date() }, userContext);
   *   await this.outboxRepo.insert(tx, { ... });
   *   // Transaction commits both user update and outbox record atomically
   * });
   * ```
   */
  async updateWithTransaction(
    tenantId: number,
    tx: NodePgDatabase,
    id: number,
    data: UpdateUserData,
    userContext?: RepositoryUserContext
  ): Promise<User> {
    // Authorization check before update
    await this.authorizeWrite(userContext, id, tenantId, 'update');

    // First verify user exists and belongs to tenant
    await this.findByIdOrThrow(tenantId, id);

    // Perform update using transaction with tenant scoping
    const [user] = await tx
      .update(users)
      .set(data)
      .where(and(eq(users.id, id), eq(users.organizationId, tenantId)))
      .returning();

    if (!user) {
      throw new Error('Failed to update user');
    }
    return user;
  }

  /**
   * Delete a user
   * Overrides BaseRepository.delete to add verification step and authorization
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
    // Call parent delete
    return super.delete(tenantId, id);
  }

  /**
   * Delete a user within a transaction
   *
   * This method accepts a transaction object and performs the delete within that transaction.
   * Use this when you need to perform multiple operations atomically (e.g., user deletion + outbox event).
   *
   * @param tx - Database transaction object
   * @param tenantId - Tenant ID for scoping
   * @param id - User ID to delete
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns void
   *
   * @example
   * ```typescript
   * await this.db.transaction(async (tx) => {
   *   await this.repository.deleteWithTransaction(tenantId, tx, userId, userContext);
   *   await this.outboxRepo.insert(tx, { ... });
   *   // Transaction commits both deletion and outbox record atomically
   * });
   * ```
   */
  async deleteWithTransaction(
    tenantId: number,
    tx: NodePgDatabase,
    id: number,
    userContext?: RepositoryUserContext
  ): Promise<void> {
    // Authorization check before delete
    await this.authorizeWrite(userContext, id, tenantId, 'delete');

    // First verify user exists and belongs to tenant using transaction
    const user = await this.findByIdOrThrow(tenantId, id);

    // Perform delete within transaction with tenant scoping
    await tx.delete(users).where(and(eq(users.id, user.id), eq(users.organizationId, tenantId)));
  }
}
