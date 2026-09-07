import { Injectable, ForbiddenException, Logger, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CachedPermissionService } from '../services/cached-permission.service';
import { REQUIRED_PERMISSIONS_KEY } from '../types/permissions.types';

import type { CanActivate } from '@nestjs/common';

// NOTE: Reflector and ExecutionContext MUST be value imports for NestJS DI metadata

/**
 * Enhanced Permissions Guard
 *
 * Guard that checks if the authenticated user has the required permissions.
 * Supports dual-provider architecture:
 * - Custom JWT Provider: Permissions embedded in token
 * - Firebase Provider: Permissions resolved from cache
 *
 * Uses the RequirePermissions decorator to specify required permissions.
 *
 * @example Using EnhancedPermissionsGuard in a controller
 * ```typescript
 * import { Controller, Get, Post, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, EnhancedPermissionsGuard, RequirePermissions } from '@package/auth';
 *
 * @Controller('tenants/:tenantId/users')
 * @UseGuards(JwtAuthGuard, EnhancedPermissionsGuard)
 * export class TenantUsersController {
 *   @RequirePermissions('tenant:users:read')
 *   @Get()
 *   findAll() {
 *     return this.usersService.findAll();
 *   }
 *
 *   @RequirePermissions('tenant:users:create', 'tenant:users:read')
 *   @Post()
 *   create() {
 *     return this.usersService.create();
 *   }
 * }
 * ```
 *
 * @example Global guard registration with tenant middleware
 * ```typescript
 * import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
 * import { APP_GUARD } from '@nestjs/core';
 * import { JwtAuthGuard, EnhancedPermissionsGuard, TenantMiddleware } from '@package/auth';
 *
 * @Module({
 *   providers: [
 *     { provide: APP_GUARD, useClass: JwtAuthGuard },
 *     { provide: APP_GUARD, useClass: EnhancedPermissionsGuard },
 *   ],
 * })
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(TenantMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 *
 * @see RequirePermissions - Decorator to specify required permissions
 * @see CachedPermissionService - Service for resolving cached permissions
 */
@Injectable()
export class EnhancedPermissionsGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedPermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private cachedPermissionService: CachedPermissionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from decorator
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) || [];

    // If no permissions required, allow access
    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!user.userId) {
      throw new ForbiddenException('Invalid user context');
    }

    // Get tenantId from request context (set by tenant middleware)
    // CRITICAL: Do NOT fall back to user.tenantId from JWT
    // The request.tenantContext MUST be set by TenantMiddleware for protected routes.
    // If tenantContext is not set, the TenantMiddleware should have thrown an error.
    // Using JWT tenant_id claim bypasses the x-tenant-id header requirement.
    const tenantId = request.tenantContext?.tenantId;

    // If tenant context is not set, this is a configuration error
    // TenantMiddleware should have validated and set the context
    if (!tenantId) {
      this.logger.error(
        'Tenant context not set in request. TenantMiddleware should have validated x-tenant-id header.'
      );
      throw new ForbiddenException('Tenant context not set. Please provide x-tenant-id header.');
    }

    // Check if permissions are already embedded in token (Custom JWT Provider)
    if (user.permissions && Array.isArray(user.permissions) && user.permissions.length > 0) {
      return this.checkEmbeddedPermissions(user.permissions, requiredPermissions);
    }

    // Otherwise, resolve from cache (Firebase Provider with perm_version)
    const permVersion = user.permVersion || 'default';
    const userIdNum = typeof user.userId === 'string' ? parseInt(user.userId, 10) : user.userId;
    const tenantIdNum = tenantId
      ? typeof tenantId === 'string'
        ? parseInt(tenantId, 10)
        : tenantId
      : undefined;

    return this.checkCachedPermissions(userIdNum, tenantIdNum, permVersion, requiredPermissions);
  }

  /**
   * Check permissions from token-embedded permissions
   * Used by Custom JWT Provider
   */
  private checkEmbeddedPermissions(
    userPermissions: string[],
    requiredPermissions: string[]
  ): boolean {
    // Wildcard permission grants all permissions
    const hasWildcard = userPermissions.includes('*');

    const hasAll = requiredPermissions.every((p) =>
      hasWildcard ? true : userPermissions.includes(p)
    );

    if (!hasAll) {
      const missing = requiredPermissions.filter((p) => !userPermissions.includes(p));
      this.logger.warn(`Permission denied: missing embedded permissions: ${missing.join(', ')}`);
      throw new ForbiddenException(`Missing required permissions: ${missing.join(', ')}`);
    }

    return true;
  }

  /**
   * Check permissions from cached permissions
   * Used by Firebase Provider
   */
  private async checkCachedPermissions(
    userId: number,
    tenantId: number | undefined,
    _permVersion: string,
    requiredPermissions: string[]
  ): Promise<boolean> {
    const result = await this.cachedPermissionService.getUserPermissions(userId, tenantId);

    // Wildcard permission grants all permissions
    const hasWildcard = result.includes('*');

    const granted = requiredPermissions.every((p) => (hasWildcard ? true : result.includes(p)));

    if (!granted) {
      const missing = requiredPermissions.filter((p) => !result.includes(p));
      this.logger.warn(
        `Permission denied for user ${userId}: missing cached permissions: ${missing.join(', ')}`
      );
      throw new ForbiddenException(
        `Missing required permissions. Need all of: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }
}
