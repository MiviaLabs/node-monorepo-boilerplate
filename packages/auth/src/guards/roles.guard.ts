/**
 * Roles Guard
 *
 * Guard to protect routes based on user roles
 */

import { Injectable, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRED_PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

import type { CanActivate } from '@nestjs/common';
import type { Observable } from 'rxjs';
// NOTE: Reflector and ExecutionContext MUST be value imports (not type imports)
// for NestJS DI decorator metadata to work correctly

/**
 * Role-based access control guard
 *
 * Checks if the authenticated user has the required roles.
 * User must have at least one of the specified roles to access the route.
 *
 * @example Using RolesGuard with @Roles decorator
 * ```typescript
 * import { Controller, Get, Post, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, RolesGuard, Roles } from '@package/auth';
 *
 * @Controller('admin')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * export class AdminController {
 *   @Roles('admin')
 *   @Get('dashboard')
 *   getDashboard() {
 *     return { message: 'Admin dashboard' };
 *   }
 *
 *   @Roles('admin', 'moderator')
 *   @Post('content/approve')
 *   approveContent() {
 *     return { message: 'Content approved' };
 *   }
 * }
 * ```
 *
 * @example Global guard registration in module
 * ```typescript
 * import { Module } from '@nestjs/common';
 * import { APP_GUARD } from '@nestjs/core';
 * import { JwtAuthGuard, RolesGuard } from '@package/auth';
 *
 * @Module({
 *   providers: [
 *     { provide: APP_GUARD, useClass: JwtAuthGuard },
 *     { provide: APP_GUARD, useClass: RolesGuard },
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @see Roles - Decorator to specify required roles
 * @see RequireAdmin - Convenience decorator for admin-only routes
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /**
   * Check if user has required roles
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Get required roles from decorator metadata
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    // If no roles are required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // User must be authenticated
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get user roles
    const userRoles = user.roles ?? [];

    // Check if user has any of the required roles
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient privileges. Required roles: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}

/**
 * Combined Roles and Permissions Guard
 *
 * Checks both roles and permissions if they are defined.
 * Prioritizes permission checks when permissions are specified via decorator.
 *
 * @example Using RolesAndPermissionsGuard for flexible access control
 * ```typescript
 * import { Controller, Get, Post, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, RolesAndPermissionsGuard, Roles, RequirePermissions } from '@package/auth';
 *
 * @Controller('resources')
 * @UseGuards(JwtAuthGuard, RolesAndPermissionsGuard)
 * export class ResourcesController {
 *   // Uses permissions check
 *   @RequirePermissions('resources:read')
 *   @Get()
 *   findAll() {
 *     return { message: 'List resources' };
 *   }
 *
 *   // Falls back to roles check
 *   @Roles('admin')
 *   @Post()
 *   create() {
 *     return { message: 'Resource created' };
 *   }
 * }
 * ```
 *
 * @see RolesGuard - Guard that only checks roles
 * @see PermissionsGuard - Guard that only checks permissions
 */
@Injectable()
export class RolesAndPermissionsGuard implements CanActivate {
  constructor(
    private rolesGuard: RolesGuard,
    private reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if permissions are required
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    // If permissions are required, use permissions guard logic
    if (requiredPermissions && requiredPermissions.length > 0) {
      return this.checkPermissions(context, requiredPermissions);
    }

    // Otherwise use roles guard
    return this.rolesGuard.canActivate(context) as boolean;
  }

  /**
   * Check if user has required permissions
   */
  private checkPermissions(context: ExecutionContext, requiredPermissions: string[]): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userPermissions = user.permissions ?? [];

    const hasPermission = requiredPermissions.some((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Insufficient privileges. Required roles: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }
}
