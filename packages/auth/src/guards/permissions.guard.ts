/**
 * Permissions Guard
 *
 * Guard to protect routes based on user permissions
 */

import { Injectable, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRED_PERMISSIONS_KEY } from '../decorators/permissions.decorator';

import type { CanActivate } from '@nestjs/common';
import type { Observable } from 'rxjs';
// NOTE: Reflector and ExecutionContext MUST be value imports for NestJS DI metadata

/**
 * Permission-based access control guard
 *
 * Checks if the authenticated user has ALL required permissions.
 * Use this for fine-grained access control at the permission level.
 *
 * @example Using PermissionsGuard with @RequirePermissions decorator
 * ```typescript
 * import { Controller, Get, Post, Delete, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from '@package/auth';
 *
 * @Controller('users')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * export class UsersController {
 *   @RequirePermissions('users:read')
 *   @Get()
 *   findAll() {
 *     return this.usersService.findAll();
 *   }
 *
 *   @RequirePermissions('users:create', 'users:write')
 *   @Post()
 *   create() {
 *     return this.usersService.create();
 *   }
 *
 *   @RequirePermissions('users:delete')
 *   @Delete(':id')
 *   remove() {
 *     return this.usersService.remove();
 *   }
 * }
 * ```
 *
 * @example Using helper decorators for CRUD permissions
 * ```typescript
 * import { Controller, Get, Post, Patch, Delete, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, PermissionsGuard, CanRead, CanCreate, CanUpdate, CanDelete } from '@package/auth';
 *
 * @Controller('posts')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * export class PostsController {
 *   @CanRead('posts')
 *   @Get()
 *   findAll() { ... }
 *
 *   @CanCreate('posts')
 *   @Post()
 *   create() { ... }
 *
 *   @CanUpdate('posts')
 *   @Patch(':id')
 *   update() { ... }
 *
 *   @CanDelete('posts')
 *   @Delete(':id')
 *   remove() { ... }
 * }
 * ```
 *
 * @see RequirePermissions - Decorator to specify required permissions
 * @see AnyPermissionGuard - Guard that allows access with ANY of the required permissions
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  /**
   * Check if user has required permissions
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Get required permissions from decorator metadata
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    // If no permissions are required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // User must be authenticated
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get user permissions
    const userPermissions = user.permissions ?? [];

    // Check if user has all required permissions
    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Insufficient privileges. Required permissions: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }
}

/**
 * Any Permission Guard
 *
 * Allows access if user has ANY of the required permissions.
 * Use this for OR-based permission checks (less restrictive than PermissionsGuard).
 *
 * @example Using AnyPermissionGuard for OR-based permissions
 * ```typescript
 * import { Controller, Get, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, AnyPermissionGuard, RequireAnyPermission } from '@package/auth';
 *
 * @Controller('content')
 * @UseGuards(JwtAuthGuard, AnyPermissionGuard)
 * export class ContentController {
 *   // User needs 'content:read' OR 'content:admin' to access
 *   @RequireAnyPermission('content:read', 'content:admin')
 *   @Get()
 *   findAll() {
 *     return this.contentService.findAll();
 *   }
 * }
 * ```
 *
 * @see PermissionsGuard - Guard that requires ALL specified permissions
 * @see RequireAnyPermission - Decorator for specifying OR-based permissions
 */
@Injectable()
export class AnyPermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userPermissions = user.permissions ?? [];

    // Check if user has ANY of the required permissions
    const hasPermission = requiredPermissions.some((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Insufficient privileges. Required permissions: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }
}
