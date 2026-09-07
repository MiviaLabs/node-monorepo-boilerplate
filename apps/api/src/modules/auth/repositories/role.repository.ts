import { Inject, Injectable } from '@nestjs/common';
import {
  organizations,
  userRoles,
  userTenants,
  type UserRole,
  type NewUserRole,
  type SystemRoleDb
} from '@package/db-core';
import { eq, and, or, gt, isNull } from 'drizzle-orm';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Update data type for user_roles
export interface UpdateUserRoleData {
  role?: SystemRoleDb;
  expiresAt?: Date | null;
}

/**
 * Role Repository
 *
 * Handles role-related database operations with proper dependency injection.
 * Uses injected database connection instead of static imports for testcontainers compatibility.
 *
 * This repository provides:
 * - System role lookup from user_roles table
 * - Tenant role lookup from user_tenants table
 *
 * Note: This repository extends BaseRepository treating userId as the tenant scope.
 * The user_roles and user_tenants tables are junction tables that link users to roles/tenants,
 * and don't have organization_id columns. The userId serves as our scope boundary.
 */
@Injectable()
export class RoleRepository extends BaseRepository<
  UserRole,
  NewUserRole,
  UpdateUserRoleData,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  /**
   * Get the user_roles table for BaseRepository operations
   */
  protected getTable(): typeof userRoles {
    return userRoles;
  }

  /**
   * Get the id column for queries
   */
  protected getIdColumn(): typeof userRoles.id {
    return userRoles.id;
  }

  /**
   * Get the userId column as our tenant scope
   * For junction tables, userId serves as the scope boundary
   */
  protected getTenantColumn(): typeof userRoles.userId {
    return userRoles.userId;
  }

  /**
   * Get entity name for error messages
   */
  protected getEntityName(): string {
    return 'UserRole';
  }

  protected override usesOrganizationIdForTenant(): boolean {
    return false;
  }

  /**
   * Get system roles for a user from user_roles table
   *
   * System roles provide global permissions across all tenants.
   * Filters out expired roles.
   *
   * @param userId - User ID (number)
   * @returns Array of role names
   */
  async getSystemRolesForUser(userId: number): Promise<string[]> {
    // Direct query since BaseRepository.findMany works on user_roles table,
    // but we need to filter by system roles (not using the tenant scope here)
    const systemRoleRecords = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          // Filter for system roles (roles without expiresAt or not expired)
          or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date()))
        )
      );

    return systemRoleRecords.map((r) => r.role);
  }

  /**
   * Get tenant role for a user from user_tenants table
   *
   * Tenant roles provide permissions scoped to a specific tenant/organization.
   * Returns null if user is not a member of tenant or membership is inactive.
   *
   * @param userId - User ID (number)
   * @param tenantId - Tenant/Organization ID (number)
   * @returns Role name or null if no active membership
   */
  async getTenantRoleForUser(tenantId: number, userId: number): Promise<string | null> {
    // Direct query on user_tenants table (different table than BaseRepository's user_roles)
    const [membership] = await this.db
      .select({
        role: userTenants.role,
        isActive: userTenants.isActive
      })
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
      .limit(1);

    if (!membership) {
      // Fallback: tenantId may be organizations.id in API request context.
      const [organization] = await this.db
        .select({ tenantId: organizations.tenantId })
        .from(organizations)
        .where(eq(organizations.id, tenantId))
        .limit(1);

      if (!organization || organization.tenantId === tenantId) {
        return null;
      }

      const [mappedMembership] = await this.db
        .select({
          role: userTenants.role,
          isActive: userTenants.isActive
        })
        .from(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, organization.tenantId)))
        .limit(1);

      if (!mappedMembership?.isActive) {
        return null;
      }

      return mappedMembership.role ?? null;
    }

    if (!membership.isActive) {
      return null;
    }

    return membership.role ?? null;
  }
}
