import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  tenants,
  type NodePgDatabase,
  type NewTenant,
  type Tenant,
  type TenantStatus
} from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

/**
 * Tenant repository
 *
 * Handles tenant-related data access with proper tenant scoping.
 * Extends BaseRepository for consistent patterns.
 *
 * Note: Tenants table has no organization_id column.
 * Multi-tenancy is enforced at handler level by tenantId.
 */
@Injectable()
export class TenantRepository extends BaseRepository<
  Tenant,
  NewTenant,
  Partial<NewTenant>,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  /**
   * Get the tenants table
   */
  protected getTable(): typeof tenants {
    return tenants;
  }

  /**
   * Get the ID column for queries
   */
  protected getIdColumn(): typeof tenants.id {
    return tenants.id;
  }

  /**
   * Get the tenant column for scoping
   * Note: tenants table has no organization_id, so we use id as scoping column
   */
  protected getTenantColumn(): typeof tenants.id {
    return tenants.id;
  }

  /**
   * Get the entity name for error messages
   */
  protected getEntityName(): string {
    return 'Tenant';
  }

  protected override usesOrganizationIdForTenant(): boolean {
    return false;
  }

  /**
   * Find tenant by public ID (UUID)
   */
  async findByPublicId(publicId: string): Promise<Tenant | null> {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.publicId, publicId))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return tenant ?? null;
  }

  /**
   * Find tenant by public ID or throw
   */
  async findByPublicIdOrThrow(publicId: string): Promise<Tenant> {
    const tenant = await this.findByPublicId(publicId);
    if (!tenant) {
      throw Errors.databaserecordNotFound004({ entity: 'Tenant' });
    }
    return tenant;
  }

  /**
   * Update tenant status
   */
  async updateStatus(tenantId: number, status: TenantStatus): Promise<Tenant> {
    const [updated] = await this.db
      .update(tenants)
      .set({ status, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    if (!updated) {
      throw Errors.databaserecordNotFound004({ entity: 'Tenant' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return updated;
  }

  /**
   * Update tenant settings
   */
  async updateSettings(tenantId: number, settings: Record<string, unknown>): Promise<Tenant> {
    const [updated] = await this.db
      .update(tenants)
      .set({ settings, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    if (!updated) {
      throw Errors.databaserecordNotFound004({ entity: 'Tenant' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return updated;
  }

  /**
   * Soft delete tenant by setting deletedAt timestamp
   */
  async softDelete(tenantId: number): Promise<Tenant> {
    const [deleted] = await this.db
      .update(tenants)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    if (!deleted) {
      throw Errors.databaserecordNotFound004({ entity: 'Tenant' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return deleted;
  }

  /**
   * Count active members for a tenant
   */
  async countMembers(tenantId: number): Promise<number> {
    // Import userTenants dynamically to avoid circular dependency
    const { userTenants } = await import('@package/db-core');

    const [result] = await this.db
      .select({ count: userTenants.userId })
      .from(userTenants)
      .where(and(eq(userTenants.tenantId, tenantId), eq(userTenants.isActive, true)));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result?.count ?? 0;
  }
}
