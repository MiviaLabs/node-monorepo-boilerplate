import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';

import { apiKeys } from '../schemas/api-key.schema';

import type { ApiKey, NewApiKey } from '../schemas/api-key.schema';
import type { NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '@/common/database/database.constants';
import { BaseRepository } from '@/common/infrastructure/repositories/base.repository';

/**
 * User context interface for authorization checks
 *
 * Provided by controllers/handlers to repositories for authorization.
 */
export interface RepositoryUserContext {
  /** User ID from JWT */
  userId: string;
  /** Tenant ID (organization ID) from x-tenant-id header */
  tenantId: string;
  /** User roles from JWT */
  roles?: string[];
}

/**
 * Repository for API key management.
 * Extends BaseRepository for automatic tenant scoping and transactions.
 *
 * All methods are scoped to tenant (organization_id) for security.
 */
@Injectable()
export class ApiKeyRepository extends BaseRepository<ApiKey, NewApiKey, never, string> {
  protected readonly logger = new Logger(ApiKeyRepository.name);

  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  protected getTable(): typeof apiKeys {
    return apiKeys;
  }

  protected getTenantColumn(): typeof apiKeys.organizationId {
    return apiKeys.organizationId;
  }

  protected getIdColumn(): typeof apiKeys.id {
    return apiKeys.id;
  }

  protected getEntityName(): string {
    return 'ApiKey';
  }

  /**
   * Find API key by hash (for authentication).
   * Returns active, non-deleted keys only.
   *
   * @param tenantId - Tenant ID for scoping
   * @param keyHash - SHA-256 hash of the API key
   * @returns API key or null if not found
   */
  async findByKeyHash(tenantId: string, keyHash: string): Promise<ApiKey | null> {
    const [apiKey] = await this.db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.organizationId, tenantId),
          eq(apiKeys.keyHash, keyHash),
          eq(apiKeys.isActive, true),
          isNull(apiKeys.deletedAt)
        )
      )
      .limit(1);

    return apiKey ?? null;
  }

  /**
   * Find API key by ID.
   *
   * @param tenantId - Tenant ID for scoping
   * @param id - API key ID
   * @returns API key or null if not found
   */
  override async findById(tenantId: string, id: string): Promise<ApiKey | null> {
    // Use base implementation to avoid circular call
    return super.findById(tenantId, id);
  }

  /**
   * List all API keys for a tenant.
   *
   * @param tenantId - Tenant ID for scoping
   * @param includeInactive - Whether to include inactive keys
   * @returns List of API keys
   */
  async findByTenant(tenantId: string, includeInactive = false): Promise<ApiKey[]> {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    // Note: Using || is intentional here to allow explicit false value
    const conditions = [eq(apiKeys.organizationId, tenantId)];

    if (!includeInactive) {
      conditions.push(eq(apiKeys.isActive, true));
      conditions.push(isNull(apiKeys.deletedAt));
    }

    return this.db
      .select()
      .from(apiKeys)
      .where(and(...conditions))
      .orderBy(apiKeys.createdAt);
  }

  /**
   * Find API keys by user.
   *
   * @param tenantId - Tenant ID for scoping
   * @param userId - User ID
   * @returns List of API keys
   */
  async findByUser(tenantId: string, userId: string): Promise<ApiKey[]> {
    return this.db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.organizationId, tenantId),
          eq(apiKeys.userId, userId),
          isNull(apiKeys.deletedAt)
        )
      )
      .orderBy(apiKeys.createdAt);
  }

  /**
   * Create a new API key.
   *
   * @param tenantId - Tenant ID for scoping
   * @param data - API key data (must include organizationId)
   * @returns Created API key
   */
  override async create(tenantId: string, data: NewApiKey): Promise<ApiKey> {
    this.logger.debug(`Creating API key for tenant ${tenantId}`);

    // Ensure tenant scoping
    if (data.organizationId !== tenantId) {
      throw new Error('Organization ID mismatch');
    }

    const [apiKey] = await this.db
      .insert(apiKeys)
      .values({ ...data, organizationId: tenantId })
      .returning();

    if (!apiKey) {
      throw new Error('Failed to create API key');
    }

    this.logger.log(`API key ${apiKey.id} created for tenant ${tenantId}`);
    return apiKey;
  }

  /**
   * Update API key last used information.
   * Called when API key is used for authentication.
   *
   * @param tenantId - Tenant ID for scoping
   * @param id - API key ID
   * @param ip - IP address of the request
   * @returns Updated API key
   */
  async updateLastUsed(tenantId: string, id: string, ip?: string): Promise<ApiKey> {
    const [apiKey] = await this.db
      .update(apiKeys)
      .set({
        lastUsedAt: new Date(),
        lastUsedIp: ip ?? null,
        updatedAt: new Date()
      })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, tenantId)))
      .returning();

    if (!apiKey) {
      throw new NotFoundException(`API key ${id} not found`);
    }

    return apiKey;
  }

  /**
   * Soft delete an API key.
   *
   * @param tenantId - Tenant ID for scoping
   * @param id - API key ID
   * @param userContext - User context for authorization
   */
  async softDelete(
    tenantId: string,
    id: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userContext?: RepositoryUserContext
  ): Promise<void> {
    await this.db
      .update(apiKeys)
      .set({ deletedAt: new Date() })
      .where(and(eq(apiKeys.organizationId, tenantId), eq(apiKeys.id, id)));
  }

  /**
   * Check if API key is expired.
   *
   * @param apiKey - API key to check
   * @returns true if expired
   */
  isExpired(apiKey: ApiKey): boolean {
    if (!apiKey.expiresAt) {
      return false;
    }
    return apiKey.expiresAt < new Date();
  }

  /**
   * Check if API key has required scopes.
   *
   * @param apiKey - API key to check
   * @param requiredScopes - Scopes required
   * @returns true if all required scopes are present
   */
  hasScopes(apiKey: ApiKey, requiredScopes: string[]): boolean {
    if (requiredScopes.length === 0) {
      return true;
    }

    const keyScopes = apiKey.scopes ?? [];
    return requiredScopes.every((scope) => keyScopes.includes(scope));
  }
}
