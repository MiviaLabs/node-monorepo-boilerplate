import { Injectable, ForbiddenException, Logger, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_MESSAGES } from '@package/constants';

import { RoleService } from '../services/role.service';
import { REQUIRED_ROLES_KEY } from '../types/permissions.types';

import type { CanActivate } from '@nestjs/common';

// NOTE: Reflector and ExecutionContext MUST be value imports for NestJS DI metadata

/**
 * Enhanced Roles Guard
 *
 * Guard that checks if the authenticated user has the required roles.
 * Queries roles from the database via RoleService with tenant context.
 * Uses the RequireSystemRole or RequireTenantRole decorators to specify required roles.
 *
 * @example Using EnhancedRolesGuard with system roles
 * ```typescript
 * import { Controller, Get, Delete, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, EnhancedRolesGuard, RequireSystemRole, SYSTEM_ROLE } from '@package/auth';
 *
 * @Controller('admin')
 * @UseGuards(JwtAuthGuard, EnhancedRolesGuard)
 * export class AdminController {
 *   @RequireSystemRole(SYSTEM_ROLE.ADMIN)
 *   @Get('dashboard')
 *   getDashboard() {
 *     return this.adminService.getDashboard();
 *   }
 *
 *   @RequireSystemRole(SYSTEM_ROLE.OWNER)
 *   @Delete('users/:id')
 *   deleteUser() {
 *     return this.usersService.delete();
 *   }
 * }
 * ```
 *
 * @example Using EnhancedRolesGuard with tenant roles
 * ```typescript
 * import { Controller, Get, Post, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, EnhancedRolesGuard, RequireTenantRole, TENANT_ROLE } from '@package/auth';
 *
 * @Controller('tenants/:tenantId/settings')
 * @UseGuards(JwtAuthGuard, EnhancedRolesGuard)
 * export class TenantSettingsController {
 *   @RequireTenantRole(TENANT_ROLE.ADMIN)
 *   @Get()
 *   getSettings() {
 *     return this.settingsService.findAll();
 *   }
 *
 *   @RequireTenantRole(TENANT_ROLE.OWNER)
 *   @Post()
 *   updateSettings() {
 *     return this.settingsService.update();
 *   }
 * }
 * ```
 *
 * @see RequireSystemRole - Decorator for system-level role requirements
 * @see RequireTenantRole - Decorator for tenant-level role requirements
 * @see RoleService - Service for querying user roles
 */
@Injectable()
export class EnhancedRolesGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedRolesGuard.name);

  constructor(
    private reflector: Reflector,
    private roleService: RoleService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required roles from decorator
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [
        context.getHandler(),
        context.getClass()
      ]) || [];

    // If no roles required, allow access
    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Get tenantId from request context (set by tenant middleware)
    // CRITICAL: Do NOT fall back to user.tenantId from JWT
    // The request.tenantContext MUST be set by TenantMiddleware for protected routes.
    // If tenantContext is not set, the TenantMiddleware should have thrown an error.
    // Using JWT tenant_id claim bypasses the x-tenant-id header requirement.
    const tenantId = request.tenantContext?.tenantId;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!user.userId) {
      throw new ForbiddenException('Invalid user context');
    }

    // If tenant context is not set, this is a configuration error
    // TenantMiddleware should have validated and set the context
    if (!tenantId) {
      this.logger.error(
        `${ERROR_MESSAGES.TENANT_CONTEXT_NOT_SET} in request. TenantMiddleware should have validated x-tenant-id header.`
      );
      throw new ForbiddenException(ERROR_MESSAGES.TENANT_CONTEXT_NOT_SET);
    }

    // Check roles
    const hasRole = await this.roleService.hasAnyRole(user.userId, tenantId, requiredRoles);

    if (!hasRole) {
      this.logger.warn(
        `Role check failed for user ${user.userId}. Required one of: ${requiredRoles.join(', ')}`
      );
      throw new ForbiddenException(`Requires one of roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
