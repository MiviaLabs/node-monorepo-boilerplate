import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  userTenants,
  type NewUserTenant,
  type NodePgDatabase,
  type UserTenant
} from '@package/db-core';
import { Errors } from '@package/errors';
import { sql } from 'drizzle-orm';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

/**
 * User Tenant repository
 *
 * Handles user-tenant membership (user_tenants junction table).
 * Manages user memberships in tenants with role-based access.
 *
 * Multi-tenancy: All queries are scoped by both userId and tenantId.
 */
@Injectable()
export class UserTenantRepository extends BaseRepository<
  UserTenant,
  NewUserTenant,
  Partial<NewUserTenant>,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  /**
   * Get the user_tenants table
   */
  protected getTable(): typeof userTenants {
    return userTenants;
  }

  /**
   * Get the ID column for queries
   */
  protected getIdColumn(): typeof userTenants.id {
    return userTenants.id;
  }

  /**
   * Get the tenant column for scoping
   * Note: Uses composite key (userId, tenantId) for scoping
   */
  protected getTenantColumn(): typeof userTenants.tenantId {
    return userTenants.tenantId;
  }

  /**
   * Get the entity name for error messages
   */
  protected getEntityName(): string {
    return 'UserTenant';
  }

  protected override usesOrganizationIdForTenant(): boolean {
    return false;
  }

  /**
   * Find membership by user and tenant
   */
  async findByUserAndTenant(tenantId: number, userId: number): Promise<UserTenant | null> {
    const [membership] = await this.db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return membership ?? null;
  }

  /**
   * Find membership by user and tenant or throw
   */
  async findByUserAndTenantOrThrow(tenantId: number, userId: number): Promise<UserTenant> {
    const membership = await this.findByUserAndTenant(tenantId, userId);
    if (!membership) {
      throw Errors.databaserecordNotFound004({ entity: 'UserTenant' });
    }
    return membership;
  }

  /**
   * Get all memberships for a user
   */
  async findByUserId(userId: number): Promise<UserTenant[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.db.select().from(userTenants).where(eq(userTenants.userId, userId));
  }

  /**
   * Get all memberships for a tenant
   */
  async findByTenantId(tenantId: number): Promise<UserTenant[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.db.select().from(userTenants).where(eq(userTenants.tenantId, tenantId));
  }

  /**
   * Get active memberships for a tenant
   */
  async findActiveByTenantId(tenantId: number): Promise<UserTenant[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.tenantId, tenantId), eq(userTenants.isActive, true)));
  }

  /**
   * Create membership (user joins tenant)
   */
  async createMembership(data: NewUserTenant): Promise<UserTenant> {
    const [membership] = await this.db.insert(userTenants).values(data).returning();

    if (!membership) {
      throw new Error('Failed to create user tenant membership');
    }
    return membership;
  }

  /**
   * Create membership within transaction
   */
  async createMembershipWithTransaction(
    tx: NodePgDatabase,
    data: NewUserTenant
  ): Promise<UserTenant> {
    const [membership] = await tx.insert(userTenants).values(data).returning();

    if (!membership) {
      throw new Error('Failed to create user tenant membership');
    }
    return membership;
  }

  /**
   * Update membership role
   */
  async updateRole(
    tenantId: number,
    userId: number,
    // eslint-disable-next-line local-rules/prefer-const-enum
    role: 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer'
  ): Promise<UserTenant> {
    const [updated] = await this.db
      .update(userTenants)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
      .returning();

    if (!updated) {
      throw Errors.databaserecordNotFound004({ entity: 'UserTenant' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return updated;
  }

  /**
   * Deactivate membership (soft delete)
   */
  async deactivateMembership(tenantId: number, userId: number): Promise<UserTenant> {
    const [deactivated] = await this.db
      .update(userTenants)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
      .returning();

    if (!deactivated) {
      throw Errors.databaserecordNotFound004({ entity: 'UserTenant' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return deactivated;
  }

  /**
   * Delete membership within transaction
   */
  async deleteMembershipWithTransaction(
    tenantId: number,
    tx: NodePgDatabase,
    userId: number
  ): Promise<void> {
    await tx
      .delete(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));
  }

  /**
   * Count total memberships for a user within transaction.
   */
  async countByUserIdWithTransaction(tx: NodePgDatabase, userId: number): Promise<number> {
    const [result] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(userTenants)
      .where(eq(userTenants.userId, userId));

    return result?.count ?? 0;
  }

  /**
   * Set user's default tenant
   */
  async setDefaultTenant(tenantId: number, userId: number): Promise<UserTenant> {
    // First, unset existing default
    await this.db
      .update(userTenants)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(userTenants.userId, userId));

    // Then set new default
    const [updated] = await this.db
      .update(userTenants)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
      .returning();

    if (!updated) {
      throw Errors.databaserecordNotFound004({ entity: 'UserTenant' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return updated;
  }

  /**
   * Count active members in a tenant
   */
  async countActiveMembers(tenantId: number): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(userTenants)
      .where(and(eq(userTenants.tenantId, tenantId), eq(userTenants.isActive, true)));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result?.count ?? 0;
  }
}
