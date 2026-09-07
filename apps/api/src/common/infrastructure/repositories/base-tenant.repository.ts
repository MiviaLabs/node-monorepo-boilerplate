import { BaseRepository } from './base.repository';

import type { SQL } from 'drizzle-orm';

/**
 * Entity ID type
 */
type EntityId = string | number;

/**
 * Tenant ID type - supports both string (UUID) and number (serial/bigint)
 */
type TenantId = string | number;

/**
 * Base Tenant Repository
 *
 * Extended repository with additional tenant-specific convenience methods.
 * All repositories handling tenant-scoped entities should extend this class
 * for consistent tenant isolation patterns.
 *
 * @template TEntity - The entity type returned from queries
 * @template TInsert - The type for insert operations
 * @template TUpdate - The type for update operations
 * @template TTenantId - The tenant ID type (string | number), defaults to string
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class ProductRepository extends BaseTenantRepository<Product, NewProduct, UpdateProduct, number> {
 *   protected getTable() {
 *     return products;
 *   }
 *
 *   protected getIdColumn() {
 *     return products.id;
 *   }
 *
 *   protected getTenantColumn() {
 *     return products.organizationId;
 *   }
 *
 *   protected getEntityName() {
 *     return 'Product';
 *   }
 * }
 * ```
 */
export abstract class BaseTenantRepository<
  TEntity extends object,
  TInsert extends object,
  TUpdate extends object,
  TTenantId extends TenantId = string
> extends BaseRepository<TEntity, TInsert, TUpdate, TTenantId> {
  /**
   * Find all entities for tenant with optional filters
   *
   * @param tenantId - The tenant ID to scope the query
   * @param filters - Optional SQL WHERE clause for additional filtering
   * @returns Array of entities belonging to the tenant
   *
   * @example
   * ```typescript
   * // Get all active users for tenant
   * const users = await userRepo.findByTenant(tenantId, eq(users.status, 'active'));
   * ```
   */
  async findByTenant(tenantId: TTenantId, filters?: SQL): Promise<TEntity[]> {
    return this.findMany(tenantId, { where: filters });
  }

  /**
   * Find entity by tenant and ID
   *
   * Convenience method that combines tenant ID and entity ID lookup.
   *
   * @param tenantId - The tenant ID to scope the query
   * @param id - The entity ID
   * @returns The entity or null if not found
   *
   * @example
   * ```typescript
   * const user = await userRepo.findByTenantAndId(tenantId, userId);
   * if (!user) {
   *   throw new NotFoundException('User not found');
   * }
   * ```
   */
  async findByTenantAndId(tenantId: TTenantId, id: EntityId): Promise<TEntity | null> {
    return this.findById(tenantId, id);
  }

  /**
   * Check if entity belongs to tenant
   *
   * Useful for authorization checks before allowing operations.
   *
   * @param tenantId - The tenant ID to check against
   * @param id - The entity ID
   * @returns True if entity exists and belongs to tenant, false otherwise
   *
   * @example
   * ```typescript
   * // Check if user can access this resource
   * const belongsToTenant = await resourceRepo.belongsToTenant(tenantId, resourceId);
   * if (!belongsToTenant) {
   *   throw new ForbiddenException('Resource does not belong to your organization');
   * }
   * ```
   */
  async belongsToTenant(tenantId: TTenantId, id: EntityId): Promise<boolean> {
    return this.exists(tenantId, id);
  }

  /**
   * Count entities for tenant
   *
   * Useful for metrics, billing, and pagination calculations.
   *
   * @param tenantId - The tenant ID to scope the query
   * @returns Count of entities belonging to the tenant
   *
   * @example
   * ```typescript
   * // Check if tenant has reached user limit
   * const userCount = await userRepo.countByTenant(tenantId);
   * if (userCount >= tenant.userLimit) {
   *   throw new ConflictException('User limit reached');
   * }
   * ```
   */
  async countByTenant(tenantId: TTenantId): Promise<number> {
    const results = await this.findMany(tenantId);
    return results.length;
  }

  /**
   * Delete entity by tenant and ID
   *
   * Convenience method for tenant-scoped deletion.
   *
   * @param tenantId - The tenant ID to scope the deletion
   * @param id - The entity ID to delete
   *
   * @example
   * ```typescript
   * await productRepo.deleteByTenant(tenantId, productId);
   * ```
   */
  async deleteByTenant(tenantId: TTenantId, id: EntityId): Promise<void> {
    return this.delete(tenantId, id);
  }

  /**
   * Execute operation within transaction with tenant context
   *
   * Alias for the base transaction method, providing clearer intent
   * for tenant-scoped operations.
   *
   * @param tenantId - The tenant ID for context
   * @param callback - Transaction callback function
   * @returns Result of the transaction callback
   *
   * @example
   * ```typescript
   * return this.transactional(tenantId, async (tx) => {
   *   const [user] = await tx.insert(users).values({...}).returning();
   *   await tx.insert(profiles).values({ userId: user.id, ... });
   *   return user;
   * });
   * ```
   */
  async transactional<T>(
    _tenantId: TTenantId,
    callback: (tx: Parameters<Parameters<typeof this.transaction>[0]>[0]) => Promise<T>
  ): Promise<T> {
    // tenantId parameter is for API clarity and future use in transaction logging
    return this.transaction(callback);
  }
}
