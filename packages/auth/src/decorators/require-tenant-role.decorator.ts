import { SetMetadata } from '@nestjs/common';

import { REQUIRED_ROLES_KEY } from '../types/permissions.types';

/**
 * Require specific tenant role to access route
 *
 * Tenant roles are scoped to specific tenants. The user must have the
 * required role within the tenant specified in the request context.
 *
 * @param roles - Array of tenant role strings required to access the route
 * @returns Decorator function that sets required tenant roles metadata
 *
 * @example Using with EnhancedRolesGuard in a controller
 * ```typescript
 * import { Controller, Get, Post, Delete, UseGuards, Param } from '@nestjs/common';
 * import { JwtAuthGuard, EnhancedRolesGuard, RequireTenantRole, TenantId } from '@package/auth';
 * import { TENANT_ROLE } from '@package/constants';
 *
 * @Controller('tenants/:tenantId/members')
 * @UseGuards(JwtAuthGuard, EnhancedRolesGuard)
 * export class TenantMembersController {
 *   @RequireTenantRole(TENANT_ROLE.USER)
 *   @Get()
 *   findAll(@TenantId() tenantId: string) {
 *     return this.membersService.findAll(tenantId);
 *   }
 *
 *   @RequireTenantRole(TENANT_ROLE.ADMIN)
 *   @Post()
 *   invite(@TenantId() tenantId: string) {
 *     return this.membersService.invite(tenantId);
 *   }
 *
 *   @RequireTenantRole(TENANT_ROLE.OWNER)
 *   @Delete(':memberId')
 *   remove(@TenantId() tenantId: string, @Param('memberId') memberId: string) {
 *     return this.membersService.remove(tenantId, memberId);
 *   }
 * }
 * ```
 *
 * @see EnhancedRolesGuard - Guard that validates tenant roles
 * @see RequireSystemRole - Decorator for system-level roles
 */
export const RequireTenantRole = (...roles: string[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
