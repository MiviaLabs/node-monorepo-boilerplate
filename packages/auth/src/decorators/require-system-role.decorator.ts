import { SetMetadata } from '@nestjs/common';

import { REQUIRED_ROLES_KEY } from '../types/permissions.types';

/**
 * Require specific system role to access route
 *
 * System roles are global roles assigned to users at the platform level,
 * independent of any tenant context.
 *
 * @param roles - Array of system role strings required to access the route
 * @returns Decorator function that sets required system roles metadata
 *
 * @example Using with EnhancedRolesGuard in a controller
 * ```typescript
 * import { Controller, Get, Delete, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, EnhancedRolesGuard, RequireSystemRole } from '@package/auth';
 * import { SYSTEM_ROLE } from '@package/constants';
 *
 * @Controller('admin')
 * @UseGuards(JwtAuthGuard, EnhancedRolesGuard)
 * export class AdminController {
 *   @RequireSystemRole(SYSTEM_ROLE.ADMIN)
 *   @Get('stats')
 *   getStats() {
 *     return this.statsService.getSystemStats();
 *   }
 *
 *   @RequireSystemRole(SYSTEM_ROLE.SUPER_ADMIN)
 *   @Delete('tenants/:id')
 *   deleteTenant() {
 *     return this.tenantsService.delete();
 *   }
 * }
 * ```
 *
 * @see EnhancedRolesGuard - Guard that validates system roles
 * @see RequireTenantRole - Decorator for tenant-scoped roles
 */
export const RequireSystemRole = (...roles: string[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
