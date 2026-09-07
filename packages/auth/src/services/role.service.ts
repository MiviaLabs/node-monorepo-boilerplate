/**
 * Role Service
 *
 * Service for managing user roles (system and tenant-level).
 * Provides role assignment, revocation, and query operations.
 */

import {
  Inject,
  Injectable,
  Logger,
  ConflictException,
  ForbiddenException,
  Optional
} from '@nestjs/common';
import { SYSTEM_ROLE, TENANT_ROLE, type SystemRole, type TenantRole } from '@package/constants';
import { db, organizations, userRoles, userTenants } from '@package/db-core';
import { eq, and, or, gt, isNull } from 'drizzle-orm';

import { CachedPermissionService } from './cached-permission.service';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Options for role assignment
 */
export interface AssignRoleOptions {
  /** Optional expiration date for the role */
  expiresAt?: Date;
}

/**
 * Result of a role assignment operation
 */
export interface RoleAssignmentResult {
  /** Whether the operation was successful */
  success: boolean;
  /** The role that was assigned */
  role: string;
  /** User ID the role was assigned to */
  userId: number;
  /** For tenant roles, the tenant ID */
  tenantId?: number;
}

/**
 * Role Service
 *
 * Manages system roles (user_roles table) and tenant roles (user_tenants table).
 *
 * System roles: Global permissions across all tenants
 * Tenant roles: Permissions scoped to a specific tenant
 */
@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(
    @Optional()
    @Inject(CachedPermissionService)
    private readonly cacheService?: CachedPermissionService
  ) {}

  // =========================================================================
  // System Role Operations
  // =========================================================================

  /**
   * Get all system roles for a user
   *
   * @param userId - User ID
   * @returns Array of system role strings
   */
  async getSystemRoles(userId: number): Promise<string[]> {
    try {
      const roles = await db
        .select({
          role: userRoles.role
        })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            // Filter out expired roles
            or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date()))
          )
        );

      return roles.map((r) => r.role);
    } catch (error) {
      this.logger.error(`Failed to get system roles for user ${userId}`, error);
      return [];
    }
  }

  /**
   * Check if user has a specific system role
   *
   * @param userId - User ID
   * @param role - Role to check for
   * @returns True if user has the role, false otherwise
   */
  async hasSystemRole(userId: number, role: string): Promise<boolean> {
    const roles = await this.getSystemRoles(userId);
    return roles.includes(role);
  }

  /**
   * Assign a system role to a user
   *
   * @param userId - User ID to assign the role to
   * @param role - System role to assign (system_owner, system_admin)
   * @param assignedBy - User ID of the admin performing the assignment
   * @param options - Optional assignment options (expiration)
   * @returns Role assignment result
   * @throws ConflictException if user already has this role
   */
  async assignSystemRole(
    userId: number,
    role: string,
    assignedBy: number | null = null,
    options?: AssignRoleOptions
  ): Promise<RoleAssignmentResult> {
    try {
      // Validate role
      if (!Object.values(SYSTEM_ROLE).includes(role as SystemRole)) {
        throw new ConflictException(`Invalid system role: ${role}`);
      }

      // Check if user already has this role
      const existing = await db
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role as SystemRole)))
        .limit(1);

      if (existing.length > 0) {
        throw new ConflictException(`User already has system role: ${role}`);
      }

      // Assign the role
      await db.insert(userRoles).values({
        userId,
        role: role as SystemRole,
        assignedBy,
        expiresAt: options?.expiresAt || null
      });

      this.logger.log(`System role '${role}' assigned to user ${userId} by ${assignedBy}`);

      // Invalidate cached permissions
      await this.cacheService?.invalidateAllPermissions(userId);

      return {
        success: true,
        role,
        userId
      };
    } catch (error) {
      this.logger.error(`Failed to assign system role '${role}' to user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Assign a system role within an existing transaction.
   *
   * Cache invalidation is the caller's responsibility after the transaction commits.
   */
  async assignSystemRoleInTransaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: NodePgDatabase<any>,
    userId: number,
    role: string,
    assignedBy: number | null = null,
    options?: AssignRoleOptions
  ): Promise<RoleAssignmentResult> {
    try {
      if (!Object.values(SYSTEM_ROLE).includes(role as SystemRole)) {
        throw new ConflictException(`Invalid system role: ${role}`);
      }

      const existing = await tx
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role as SystemRole)))
        .limit(1);

      if (existing.length > 0) {
        throw new ConflictException(`User already has system role: ${role}`);
      }

      await tx.insert(userRoles).values({
        userId,
        role: role as SystemRole,
        assignedBy,
        expiresAt: options?.expiresAt || null
      });

      this.logger.log(`System role '${role}' assigned to user ${userId} in transaction`);

      return {
        success: true,
        role,
        userId
      };
    } catch (error) {
      this.logger.error(
        `Failed to assign system role '${role}' to user ${userId} in transaction`,
        error
      );
      throw error;
    }
  }

  /**
   * Revoke a system role from a user
   *
   * @param userId - User ID to revoke the role from
   * @param role - System role to revoke
   * @returns True if role was revoked, false if user didn't have the role
   */
  async revokeSystemRole(userId: number, role: string, revokedBy?: number): Promise<boolean> {
    try {
      if (role === SYSTEM_ROLE.OWNER) {
        if (revokedBy === undefined) {
          throw new ForbiddenException('Revoking system_owner requires actor context');
        }

        const actorRoles = await this.getSystemRoles(revokedBy);
        if (!actorRoles.includes(SYSTEM_ROLE.OWNER)) {
          throw new ForbiddenException('Only system owners can revoke system_owner role');
        }
      }

      const result = await db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role as SystemRole)))
        .returning();

      if (result.length === 0) {
        return false;
      }

      this.logger.log(`System role '${role}' revoked from user ${userId}`);

      // Invalidate cached permissions
      await this.cacheService?.invalidateAllPermissions(userId);

      return true;
    } catch (error) {
      this.logger.error(`Failed to revoke system role '${role}' from user ${userId}`, error);
      throw error;
    }
  }

  // =========================================================================
  // Tenant Role Operations
  // =========================================================================

  /**
   * Get tenant role for a user
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns Tenant role string or null if not a member
   */
  async getTenantRole(userId: number, tenantId: number): Promise<string | null> {
    try {
      const directMembership = await db
        .select({
          role: userTenants.role,
          isActive: userTenants.isActive
        })
        .from(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
        .limit(1);

      if (directMembership.length > 0) {
        const member = directMembership[0];
        if (member !== undefined && member.isActive) {
          return member.role;
        }
      }

      // Fallback: tenantId may be organizations.id in API context.
      const [organization] = await db
        .select({ tenantId: organizations.tenantId })
        .from(organizations)
        .where(eq(organizations.id, tenantId))
        .limit(1);

      if (!organization || organization.tenantId === tenantId) {
        return null;
      }

      const mappedMembership = await db
        .select({
          role: userTenants.role,
          isActive: userTenants.isActive
        })
        .from(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, organization.tenantId)))
        .limit(1);

      if (mappedMembership.length === 0) {
        return null;
      }

      const mappedMember = mappedMembership[0];
      if (mappedMember === undefined || !mappedMember.isActive) {
        return null;
      }

      return mappedMember.role;
    } catch (error) {
      this.logger.error(
        `Failed to get tenant role for user ${userId} in tenant ${tenantId}`,
        error
      );
      return null;
    }
  }

  /**
   * Check if user is a member of a tenant
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns True if user is an active member, false otherwise
   */
  async isTenantMember(userId: number, tenantId: number): Promise<boolean> {
    const role = await this.getTenantRole(userId, tenantId);
    return role !== null;
  }

  /**
   * Assign or update a tenant role for a user
   *
   * Creates a new tenant membership if one doesn't exist,
   * or updates the role if the user is already a member.
   *
   * Uses a transaction to ensure atomicity and prevent race conditions.
   *
   * @param userId - User ID to assign the role to
   * @param tenantId - Tenant ID
   * @param role - Tenant role to assign (tenant_owner, tenant_admin, tenant_user, tenant_viewer)
   * @param isDefault - Whether this is the user's default tenant
   * @returns Role assignment result
   */
  async assignTenantRole(
    userId: number,
    tenantId: number,
    role: string,
    isDefault: boolean = false
  ): Promise<RoleAssignmentResult> {
    try {
      // Validate role
      if (!Object.values(TENANT_ROLE).includes(role as TenantRole)) {
        throw new ConflictException(`Invalid tenant role: ${role}`);
      }

      // Use transaction for atomicity
      return await db.transaction(async (tx) => {
        return this.assignTenantRoleInTransaction(tx, userId, tenantId, role, isDefault);
      });
    } catch (error) {
      this.logger.error(
        `Failed to assign tenant role '${role}' to user ${userId} in tenant ${tenantId}`,
        error
      );
      throw error;
    }
  }

  /**
   * Assign or update a tenant role for a user within an existing transaction
   *
   * This method is designed to be called within an existing database transaction
   * to ensure atomicity with other database operations. It creates a new tenant
   * membership if one doesn't exist, or updates the role if the user is already a member.
   *
   * IMPORTANT: This method does NOT create its own transaction. It uses the transaction
   * passed in as a parameter. This allows multiple operations to be performed atomically.
   *
   * NOTE: Cache invalidation is the caller's responsibility and should be performed
   * AFTER the transaction commits successfully. Call `cacheService.invalidatePermissions(userId, tenantId)`
   * after the transaction completes to ensure cache consistency.
   *
   * @param tx - Database transaction (uses existing transaction, does not create a new one)
   * @param userId - User ID to assign the role to
   * @param tenantId - Tenant ID
   * @param role - Tenant role to assign (tenant_owner, tenant_admin, tenant_user, tenant_viewer)
   * @param isDefault - Whether this is the user's default tenant
   * @returns Role assignment result
   */
  async assignTenantRoleInTransaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: NodePgDatabase<any>,
    userId: number,
    tenantId: number,
    role: string,
    isDefault: boolean = false
  ): Promise<RoleAssignmentResult> {
    try {
      // Validate role
      if (!Object.values(TENANT_ROLE).includes(role as TenantRole)) {
        throw new ConflictException(`Invalid tenant role: ${role}`);
      }

      // Check if membership exists
      const existing = await tx
        .select()
        .from(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
        .limit(1);

      if (existing.length > 0) {
        // Update existing membership
        const existingRecord = existing[0];
        if (existingRecord === undefined) {
          throw new Error('Expected existing record to be defined');
        }
        await tx
          .update(userTenants)
          .set({
            role: role as TenantRole,
            isActive: true,
            isDefault,
            joinedAt: existingRecord.joinedAt, // Preserve original join date
            updatedAt: new Date()
          })
          .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));
      } else {
        // Create new membership
        await tx.insert(userTenants).values({
          userId,
          tenantId,
          role: role as TenantRole,
          isActive: true,
          isDefault,
          joinedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      this.logger.log(
        `Tenant role '${role}' assigned to user ${userId} in tenant ${tenantId} (isDefault: ${isDefault})`
      );

      return {
        success: true,
        role,
        userId,
        tenantId
      };
    } catch (error) {
      this.logger.error(
        `Failed to assign tenant role '${role}' to user ${userId} in tenant ${tenantId}`,
        error
      );
      throw error;
    }
  }

  /**
   * Revoke a tenant role from a user (deactivates membership)
   *
   * @param userId - User ID to revoke the role from
   * @param tenantId - Tenant ID
   * @returns True if membership was deactivated, false if not found
   */
  async revokeTenantRole(userId: number, tenantId: number): Promise<boolean> {
    try {
      const result = await db
        .update(userTenants)
        .set({
          isActive: false,
          updatedAt: new Date()
        })
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
        .returning();

      if (result.length === 0) {
        return false;
      }

      this.logger.log(`Tenant membership deactivated for user ${userId} in tenant ${tenantId}`);

      // Invalidate cached permissions
      await this.cacheService?.invalidatePermissions(userId, tenantId);

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to revoke tenant role from user ${userId} in tenant ${tenantId}`,
        error
      );
      throw error;
    }
  }

  /**
   * Remove a user from a tenant (hard delete)
   *
   * Permanently removes the user's membership record from the tenant.
   * Use revokeTenantRole() for soft deactivation instead.
   *
   * @param userId - User ID to remove
   * @param tenantId - Tenant ID
   * @returns True if membership was removed, false if not found
   */
  async removeTenantMember(userId: number, tenantId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
        .returning();

      if (result.length === 0) {
        return false;
      }

      this.logger.log(`Tenant membership removed for user ${userId} in tenant ${tenantId}`);

      // Invalidate cached permissions
      await this.cacheService?.invalidatePermissions(userId, tenantId);

      return true;
    } catch (error) {
      this.logger.error(`Failed to remove user ${userId} from tenant ${tenantId}`, error);
      throw error;
    }
  }
  /**
   * Check if user has any of the specified roles
   *
   * @param userId - User ID
   * @param tenantId - Optional tenant ID for tenant-scoped roles
   * @param roles - Array of role strings to check for
   * @returns True if user has any of the roles, false otherwise
   */
  async hasAnyRole(
    userId: number,
    tenantId: number | undefined,
    roles: string[]
  ): Promise<boolean> {
    if (tenantId) {
      // Check tenant roles
      const tenantRole = await this.getTenantRole(userId, tenantId);
      return roles.includes(tenantRole || '');
    }

    // Check system roles
    const systemRoles = await this.getSystemRoles(userId);
    return systemRoles.some((r) => roles.includes(r));
  }
}
