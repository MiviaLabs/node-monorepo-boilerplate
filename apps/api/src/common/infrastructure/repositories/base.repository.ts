import { Injectable } from '@nestjs/common';
import { and, eq } from '@package/db-core';
import { Errors } from '@package/errors';

import type { SQL, NodePgDatabase } from '@package/db-core';

/**
 * Entity ID type
 */
type EntityId = string | number;

/**
 * Tenant ID type - supports both string (UUID) and number (serial/bigint)
 */
type TenantId = string | number;
type CreateInput<TInsert, TTenantId extends TenantId> = TInsert extends {
  organizationId: TTenantId;
}
  ? Omit<TInsert, 'organizationId'>
  : TInsert;

/**
 * Base repository with common CRUD operations
 * All repositories should extend this for consistent data access
 *
 * @template TEntity - The entity type returned from queries
 * @template TInsert - The type for insert operations
 * @template TUpdate - The type for update operations
 * @template TTenantId - The tenant ID type (string | number), defaults to string
 */
@Injectable()
export abstract class BaseRepository<
  TEntity extends object,
  TInsert extends object,
  TUpdate extends object,
  TTenantId extends TenantId = string
> {
  // Note: NodePgDatabase<any> is used because BaseRepository is a generic class
  // that works with different table schemas. Concrete repositories are responsible
  // for providing their specific schema types via the abstract methods.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(protected readonly db: NodePgDatabase<any>) {}

  /**
   * Find entity by ID within tenant scope
   */
  async findById(tenantId: TTenantId, id: EntityId): Promise<TEntity | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [result] = await this.db
      .select()
      .from(this.getTable())
      .where(and(eq(this.getTenantColumn(), tenantId), eq(this.getIdColumn(), id)))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result ?? null;
  }

  /**
   * Find entity by ID or throw database record not found error
   */
  async findByIdOrThrow(tenantId: TTenantId, id: EntityId): Promise<TEntity> {
    const entity = await this.findById(tenantId, id);
    if (!entity) {
      throw Errors.databaserecordNotFound004({ entity: this.getEntityName() });
    }
    return entity;
  }

  /**
   * Find many entities with optional filtering
   */
  findMany(
    tenantId: TTenantId,
    options?: {
      limit?: number;
      offset?: number;
      where?: SQL;
    }
  ): Promise<TEntity[]> {
    const conditions = options?.where
      ? and(eq(this.getTenantColumn(), tenantId), options.where)
      : eq(this.getTenantColumn(), tenantId);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.db
      .select()
      .from(this.getTable())
      .where(conditions)
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  }

  /**
   * Create new entity within tenant
   */
  async create(tenantId: TTenantId, data: CreateInput<TInsert, TTenantId>): Promise<TEntity> {
    const insertData = this.buildCreateData(tenantId, data);

    const result = await this.db
      .insert(this.getTable())
      .values(insertData as Record<string, unknown>)
      .returning();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
    const firstResult = (result as unknown[])[0];
    if (firstResult === undefined) {
      throw new Error('Insert operation failed to return inserted record');
    }
    return firstResult as TEntity;
  }

  /**
   * Update entity within tenant
   */
  async update(tenantId: TTenantId, id: EntityId, data: TUpdate): Promise<TEntity> {
    const result = await this.db
      .update(this.getTable())
      .set(data as Record<string, unknown>)
      .where(and(eq(this.getTenantColumn(), tenantId), eq(this.getIdColumn(), id)))
      .returning();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const firstResult = result[0];

    if (firstResult === undefined) {
      throw Errors.databaserecordNotFound004({ entity: this.getEntityName() });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return firstResult as TEntity;
  }

  /**
   * Delete entity within tenant
   */
  async delete(tenantId: TTenantId, id: EntityId): Promise<void> {
    await this.db
      .delete(this.getTable())
      .where(and(eq(this.getTenantColumn(), tenantId), eq(this.getIdColumn(), id)));
  }

  /**
   * Check if entity exists
   */
  async exists(tenantId: TTenantId, id: EntityId): Promise<boolean> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const [result] = await this.db
      .select({ count: this.getIdColumn() })
      .from(this.getTable())
      .where(and(eq(this.getTenantColumn(), tenantId), eq(this.getIdColumn(), id)))
      .limit(1);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

    return !!result;
  }

  /**
   * Execute operation within transaction
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async transaction<T>(callback: (tx: NodePgDatabase<any>) => Promise<T>): Promise<T> {
    return this.db.transaction(callback);
  }

  // Abstract methods to be implemented by concrete repositories
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract getTable(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract getIdColumn(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract getTenantColumn(): any;
  protected abstract getEntityName(): string;

  /**
   * Build insert payload for create operation.
   *
   * Default behavior supports repositories where tenant scope is organizationId.
   * Repositories with different tenant columns can override this method.
   */
  protected buildCreateData(tenantId: TTenantId, data: CreateInput<TInsert, TTenantId>): TInsert {
    if (!this.usesOrganizationIdForTenant()) {
      return data as TInsert;
    }

    const dataRecord = data as Record<string, unknown>;
    if ('organizationId' in dataRecord) {
      return data as TInsert;
    }

    return {
      ...dataRecord,
      organizationId: tenantId
    } as TInsert;
  }

  /**
   * Whether create() should auto-inject organizationId from tenant scope.
   * Repositories scoped by different tenant columns (e.g. userId, tenantId, id)
   * should override and return false.
   */
  protected usesOrganizationIdForTenant(): boolean {
    return true;
  }
}

export type { CreateInput };
