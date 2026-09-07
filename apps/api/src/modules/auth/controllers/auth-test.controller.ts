/**
 * Auth Test Controller
 *
 * This controller exists solely for E2E testing of @package/auth package.
 * It provides endpoints that exercise various guards and decorators:
 * - JWT authentication
 * - Role-based access control (RBAC)
 * - Permission-based access control
 * - User context decorators (@User, @UserId, @TenantId, @ActorId, @Email)
 * - Public routes
 *
 * NOTE: This controller should ONLY be used in test environments.
 */

/* eslint-disable import/order */
import { Body, Delete, Get, Post, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Email, ActorId, TenantId, UserId, RequirePermissions, Roles } from '@package/auth';

import { EnhancedPermissionsGuard, RolesGuard } from '../guards/auth.guards';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { EnvironmentGuard } from '@/common/guards/environment.guard';
/* eslint-enable import/order */

/**
 * Post object for testing
 */
interface TestPost {
  id?: string;
  title: string;
  tenantId?: string;
}

/**
 * Auth Test Controller
 *
 * Endpoints for testing auth package features
 *
 * SECURITY: This controller is restricted to development and test environments only.
 * The EnvironmentGuard prevents access in production environments.
 */
@ApiTags('Auth Test')
@VersionedController('v1', 'iam')
@UseGuards(EnvironmentGuard)
@SetMetadata('environments', ['development', 'test'])
export class IdentityProbeController {
  /**
   * Admin-only endpoint
   * Tests: Role-based access control (RBAC)
   *
   * Aligned with OPA policies:
   * - tenant_owner: Full tenant access
   * - tenant_admin: Can perform actions within their organization
   */
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tenant_owner', 'tenant_admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin endpoint (RBAC)',
    description:
      'Requires tenant_owner or tenant_admin role. Tests RolesGuard with @Roles decorator. Aligned with OPA policies.'
  })
  getAdminDashboard(): Record<string, string> {
    return { message: 'Admin access granted' };
  }

  /**
   * Create post endpoint
   * Tests: Permission-based access control
   */
  @Post('posts')
  @UseGuards(JwtAuthGuard, EnhancedPermissionsGuard)
  @RequirePermissions('tenant:posts:write')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create post (permission-based)',
    description:
      'Requires tenant:posts:write permission. Tests PermissionsGuard with @RequirePermissions.'
  })
  createPost(@Body() post: TestPost): Record<string, unknown> {
    return { ...post, id: 'test-post-id', createdAt: new Date().toISOString() };
  }

  /**
   * Delete post endpoint
   * Tests: Multiple required permissions (AND logic)
   */
  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard, EnhancedPermissionsGuard)
  @RequirePermissions('tenant:posts:delete', 'tenant:posts:write')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete post (multiple permissions)',
    description:
      'Requires both tenant:posts:delete AND tenant:posts:write permissions. Tests AND logic in PermissionsGuard.'
  })
  deletePost(): Record<string, string> {
    return { message: 'Post deleted' };
  }

  /**
   * Get posts endpoint
   * Tests: Permission-based access control
   */
  @Get('posts')
  @UseGuards(JwtAuthGuard, EnhancedPermissionsGuard)
  @RequirePermissions('tenant:posts:read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get posts (permission-based)',
    description: 'Requires tenant:posts:read permission. Tests PermissionsGuard.'
  })
  getPosts(): unknown[] {
    // In a real scenario, this would be scoped to tenant
    return [];
  }

  /**
   * Tenant endpoint
   * Tests: @TenantId() decorator extraction
   */
  @Get('tenant')
  @UseGuards(JwtAuthGuard, EnhancedPermissionsGuard)
  @RequirePermissions('tenant:posts:read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get tenant ID',
    description: 'Extracts tenant_id from JWT token using @TenantId() decorator.'
  })
  getTenant(@TenantId() tenantId: string): Record<string, string> {
    return { tenantId };
  }

  /**
   * Email endpoint
   * Tests: @Email() decorator extraction
   */
  @Get('email')
  @UseGuards(JwtAuthGuard, EnhancedPermissionsGuard)
  @RequirePermissions('tenant:users:read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user email',
    description: 'Extracts email from JWT token using @Email() decorator.'
  })
  getEmail(@Email() email: string): Record<string, string> {
    return { email };
  }

  /**
   * Actor endpoint
   * Tests: @ActorId() decorator extraction
   */
  @Get('actor')
  @UseGuards(JwtAuthGuard, EnhancedPermissionsGuard)
  @RequirePermissions('tenant:users:read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get actor ID',
    description:
      'Extracts actor_id from JWT token using @ActorId() decorator. Used for audit trails.'
  })
  getActor(@ActorId() actorId: string): Record<string, string> {
    return { actorId };
  }

  /**
   * User ID endpoint
   * Tests: @UserId() decorator extraction
   */
  @Get('user-id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('tenant:users:read')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user ID',
    description: 'Extracts user ID (sub) from JWT token using @UserId() decorator.'
  })
  getUserId(@UserId() userId: string): Record<string, string> {
    return { userId };
  }
}
