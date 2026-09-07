import { Injectable, ForbiddenException, type ExecutionContext, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CachedPermissionService,
  CachedRoleService,
  REQUIRED_PERMISSIONS_KEY,
  ROLES_KEY
} from '@package/auth';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { roles?: string[] } }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userRoles = user.roles ?? [];
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient privileges. Required roles: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { permissions?: string[] } }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userPermissions = user.permissions ?? [];
    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Insufficient privileges. Required permissions: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }
}

@Injectable()
export class EnhancedPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cachedPermissionService: CachedPermissionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: {
        userId?: number | string;
        permissions?: string[];
      };
      tenantContext?: {
        tenantId?: number | string;
      };
    }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }
    if (!user.userId) {
      throw new ForbiddenException('Invalid user context');
    }

    const tenantId = request.tenantContext?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not set. Please provide x-tenant-id header.');
    }

    if (Array.isArray(user.permissions) && user.permissions.length > 0) {
      const userPermissions = user.permissions;
      const hasWildcard = userPermissions.includes('*');
      const granted = requiredPermissions.every((permission) =>
        hasWildcard ? true : userPermissions.includes(permission)
      );
      if (!granted) {
        const missing = requiredPermissions.filter((p) => !userPermissions.includes(p));
        throw new ForbiddenException(`Missing required permissions: ${missing.join(', ')}`);
      }
      return true;
    }

    const userIdNum =
      typeof user.userId === 'string' ? Number.parseInt(user.userId, 10) : user.userId;
    const tenantIdNum = typeof tenantId === 'string' ? Number.parseInt(tenantId, 10) : tenantId;
    const resolvedPermissions = await this.cachedPermissionService.getUserPermissions(
      userIdNum,
      tenantIdNum
    );
    const hasWildcard = resolvedPermissions.includes('*');
    const granted = requiredPermissions.every((permission) =>
      hasWildcard ? true : resolvedPermissions.includes(permission)
    );

    if (!granted) {
      throw new ForbiddenException(
        `Missing required permissions. Need all of: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }
}

export { CachedPermissionService, CachedRoleService };

export const ROLES_GUARD_TOKEN = 'RolesGuard';
export const PERMISSIONS_GUARD_TOKEN = 'PermissionsGuard';
export const ENHANCED_PERMISSIONS_GUARD_TOKEN = 'EnhancedPermissionsGuard';
