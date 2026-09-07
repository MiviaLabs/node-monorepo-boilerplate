/**
 * Permission Service
 *
 * Service for resolving user permissions from database roles.
 * Maps system and tenant roles to their corresponding permissions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ROLE_PERMISSIONS, SystemRole, TenantRole } from '@package/constants';
import { db, organizations, userRoles, userTenants } from '@package/db-core';
import { eq, and, or, gt, isNull } from 'drizzle-orm';

/**
 * Permission Service
 *
 * Resolves user permissions by:
 * 1. Querying system roles from user_roles table
 * 2. Querying tenant role from user_tenants table (if tenantId provided)
 * 3. Mapping roles to permissions using ROLE_PERMISSIONS mapping
 * 4. Returning unique permissions array
 *
 * @example Injecting PermissionService in a NestJS service
 * ```typescript
 * import { Injectable } from '@nestjs/common';
 * import { PermissionService } from '@package/auth';
 *
 * @Injectable()
 * export class AuthorizationService {
 *   constructor(private readonly permissionService: PermissionService) {}
 *
 *   async canUserCreateResource(userId: number, tenantId: number) {
 *     return this.permissionService.hasPermission(
 *       userId, tenantId, 'resources:create'
 *     );
 *   }
 * }
 * ```
 *
 * @example Checking multiple permissions
 * ```typescript
 * const result = await permissionService.hasAllPermissions(
 *   userId,
 *   tenantId,
 *   ['users:read', 'users:create', 'users:update']
 * );
 *
 * if (!result.granted) {
 *   throw new ForbiddenException(result.reason);
 * }
 * ```
 */
@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);

  /**
   * Get all permissions for a user
   *
   * @param userId - User ID
   * @param tenantId - Optional tenant ID for tenant-scoped permissions
   * @returns Array of unique permission strings
   *
   * @example Getting all user permissions
   * ```typescript
   * // Get system-level permissions only
   * const systemPermissions = await permissionService.getUserPermissions(userId);
   *
   * // Get combined system and tenant permissions
   * const allPermissions = await permissionService.getUserPermissions(userId, tenantId);
   * console.log(allPermissions);
   * // ['users:read', 'users:create', 'tenant:settings:read']
   * ```
   */
  async getUserPermissions(userId: number, tenantId?: number): Promise<string[]> {
    try {
      const permissionsSet = new Set<string>();

      // Get system roles (global permissions)
      const systemRoles = await this.getSystemRoles(userId);
      for (const role of systemRoles) {
        const rolePermissions = ROLE_PERMISSIONS[role] || [];
        for (const permission of rolePermissions) {
          permissionsSet.add(permission);
        }
      }

      // Get tenant role (tenant-scoped permissions) if tenantId provided
      if (tenantId) {
        const tenantRole = await this.getTenantRole(userId, tenantId);
        if (tenantRole) {
          const rolePermissions = ROLE_PERMISSIONS[tenantRole] || [];
          for (const permission of rolePermissions) {
            permissionsSet.add(permission);
          }
        }
      }

      return Array.from(permissionsSet);
    } catch (error) {
      this.logger.error(
        `Failed to get permissions for user ${userId}${tenantId ? ` in tenant ${tenantId}` : ''}`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if user has a specific permission
   *
   * @param userId - User ID
   * @param tenantId - Optional tenant ID for tenant-scoped permissions
   * @param requiredPermission - Permission to check for
   * @returns True if user has the permission, false otherwise
   *
   * @example Checking a single permission
   * ```typescript
   * const canCreate = await permissionService.hasPermission(
   *   userId,
   *   tenantId,
   *   'users:create'
   * );
   *
   * if (!canCreate) {
   *   throw new ForbiddenException('You do not have permission to create users');
   * }
   * ```
   */
  async hasPermission(
    userId: number,
    tenantId: number | undefined,
    requiredPermission: string
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, tenantId);
    return permissions.includes(requiredPermission);
  }

  /**
   * Get system roles for a user
   *
   * @param userId - User ID
   * @returns Array of system role strings
   * @private
   */
  private async getSystemRoles(userId: number): Promise<SystemRole[]> {
    try {
      const roles = await db
        .select({
          role: userRoles.role
        })
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            // Filter out expired roles (same as RoleService)
            or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date()))
          )
        );

      return roles.map((r) => r.role as SystemRole);
    } catch (error) {
      this.logger.error(`Failed to get system roles for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get tenant role for a user
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns Tenant role string or null if not found
   * @private
   */
  private async getTenantRole(userId: number, tenantId: number): Promise<TenantRole | null> {
    try {
      const directMembership = await db
        .select({
          role: userTenants.role
        })
        .from(userTenants)
        .where(
          and(
            eq(userTenants.userId, userId),
            eq(userTenants.tenantId, tenantId),
            eq(userTenants.isActive, true)
          )
        )
        .limit(1);

      if (directMembership[0]?.role) {
        return directMembership[0].role as TenantRole;
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
          role: userTenants.role
        })
        .from(userTenants)
        .where(
          and(
            eq(userTenants.userId, userId),
            eq(userTenants.tenantId, organization.tenantId),
            eq(userTenants.isActive, true)
          )
        )
        .limit(1);

      return (mappedMembership[0]?.role as TenantRole) || null;
    } catch (error) {
      this.logger.error(
        `Failed to get tenant role for user ${userId} in tenant ${tenantId}`,
        error
      );
      throw error;
    }
  }
  /**
   * Check if user has ALL of the specified permissions
   *
   * @param userId - User ID
   * @param tenantId - Optional tenant ID for tenant-scoped permissions
   * @param requiredPermissions - Array of permission strings to check for
   * @returns PermissionCheckResult with granted status and permissions
   *
   * @example Checking multiple permissions for an operation
   * ```typescript
   * const result = await permissionService.hasAllPermissions(
   *   userId,
   *   tenantId,
   *   ['orders:read', 'orders:update', 'orders:refund']
   * );
   *
   * if (result.granted) {
   *   // User has all required permissions
   *   await this.processRefund(orderId);
   * } else {
   *   throw new ForbiddenException(result.reason);
   *   // "Missing required permissions. Need all of: orders:read, orders:update, orders:refund"
   * }
   * ```
   */
  async hasAllPermissions(
    userId: number,
    tenantId: number | undefined,
    requiredPermissions: string[]
  ): Promise<{ granted: boolean; reason?: string }> {
    const permissions = await this.getUserPermissions(userId, tenantId);
    const granted = requiredPermissions.every((p) => permissions.includes(p));
    const result: { granted: boolean; reason?: string } = { granted };
    if (!granted) {
      result.reason = `Missing required permissions. Need all of: ${requiredPermissions.join(', ')}`;
    }
    return result;
  }
}
