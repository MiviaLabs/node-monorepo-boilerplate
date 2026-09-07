import {
  Get,
  Post,
  Patch,
  Delete,
  HttpCode,
  Param,
  Body,
  Query,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { TENANT_PERMISSIONS } from '@package/constants';
import { Action, Resource } from '@package/opa';

import {
  UpdateTenantSettingsCommand,
  InviteMemberCommand,
  GenerateInvitationLinkCommand,
  ResendInvitationCommand,
  RevokeInvitationCommand,
  RemoveMemberCommand,
  UpdateMemberRoleCommand,
  UpdateMemberStatusCommand
} from './commands';
import {
  InviteMemberDto,
  UpdateTenantSettingsDto,
  UpdateMemberRoleDto,
  UpdateMemberStatusDto
} from './dto';
import {
  GetCurrentTenantQuery,
  GetMembersQuery,
  MemberRoleFilter,
  MemberStatusFilter,
  MembersSortBy,
  MembersSortOrder
} from './queries';

import type { RequestTrace } from '@/common/cqrs/request-trace';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { CurrentUser, RequestTraceData } from '@/common/decorators';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { HybridPolicyGuard } from '@/modules/auth/guards';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

/**
 * Tenants controller
 *
 * Handles tenant-scoped operations for managing the current tenant.
 * All endpoints require authentication and specific tenant permissions or roles.
 */
@ApiTags('tenants')
@ApiBearerAuth()
@VersionedController('v1', 'workspaces')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class WorkspacesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  /**
   * Get current tenant settings
   *
   * Requires TENANT_PERMISSIONS.SETTINGS_UPDATE (or being a tenant_owner)
   */
  @Get('current')
  @ApiOperation({
    summary: 'Get current tenant settings',
    description: 'Returns the current tenant settings. Requires tenant:settings:update permission.'
  })
  @ApiOkResponse({ description: 'Current tenant settings returned successfully.' })
  @Resource({ type: OPA_RESOURCES.ORGANIZATIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_UPDATE)
  async getCurrentTenant(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<unknown> {
    const query = new GetCurrentTenantQuery({ tenantId, actorId, ...trace });
    return this.queryBus.execute(query);
  }

  /**
   * Update tenant settings
   *
   * Requires TENANT_PERMISSIONS.SETTINGS_UPDATE
   */
  @Patch('current')
  @ApiOperation({
    summary: 'Update tenant settings',
    description: 'Updates the current tenant settings. Requires tenant:settings:update permission.'
  })
  @Resource({ type: OPA_RESOURCES.ORGANIZATIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(TENANT_PERMISSIONS.SETTINGS_UPDATE)
  async updateTenantSettings(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @Body() updateDto: UpdateTenantSettingsDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<unknown> {
    const command = new UpdateTenantSettingsCommand({
      tenantId,
      actorId,
      settings: updateDto,
      ...trace
    });

    return this.commandBus.execute(command);
  }

  /**
   * Get tenant members
   *
   * Requires TENANT_PERMISSIONS.USERS_READ
   */
  @Get('members')
  @ApiOperation({
    summary: 'Get tenant members',
    description:
      'Returns a paginated list of tenant members. Requires tenant:users:read permission.'
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-based)',
    example: 1
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Number of items per page',
    example: 20
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by display name, email, or role'
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['tenant_owner', 'tenant_admin', 'tenant_user', 'tenant_viewer'],
    description: 'Filter by member role'
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    description: 'Filter by member status'
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['email', 'displayName', 'role', 'joinedAt', 'status'],
    description: 'Sort field'
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order'
  })
  @ApiOkResponse({ description: 'Tenant members returned successfully.' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_READ)
  async getMembers(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: {
      page?: number;
      pageSize?: number;
      search?: string;
      role?: MemberRoleFilter;
      status?: MemberStatusFilter;
      sortBy?: MembersSortBy;
      sortOrder?: MembersSortOrder;
    },
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<unknown> {
    const query = new GetMembersQuery({
      tenantId,
      actorId,
      ...trace,
      ...(queryDto.page !== undefined && { page: queryDto.page }),
      ...(queryDto.pageSize !== undefined && { pageSize: queryDto.pageSize }),
      ...(queryDto.search !== undefined && { search: queryDto.search }),
      ...(queryDto.role !== undefined && { role: queryDto.role }),
      ...(queryDto.status !== undefined && { status: queryDto.status }),
      ...(queryDto.sortBy !== undefined && { sortBy: queryDto.sortBy }),
      ...(queryDto.sortOrder !== undefined && { sortOrder: queryDto.sortOrder })
    });

    return this.queryBus.execute(query);
  }

  /**
   * Invite user to tenant
   *
   * Requires TENANT_PERMISSIONS.USERS_CREATE
   */
  @Post('members/invite')
  @ApiOperation({
    summary: 'Invite user to tenant',
    description:
      'Invites a user to join the current tenant. Requires tenant:users:create permission.'
  })
  @ApiCreatedResponse({ description: 'Tenant invitation created successfully.' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.INVITE)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_CREATE)
  async inviteMember(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace,
    @Body() inviteDto: InviteMemberDto
  ): Promise<unknown> {
    const command = new InviteMemberCommand({
      tenantId,
      actorId,
      invitation: inviteDto,
      ...trace
    });

    return this.commandBus.execute(command);
  }

  @Post('members/invitations/:invitationId/link')
  @ApiOperation({
    summary: 'Generate invitation link token',
    description:
      'Regenerates a pending invitation token for manual sharing. Requires tenant:users:create permission.'
  })
  @ApiCreatedResponse({ description: 'Invitation link token regenerated successfully.' })
  @Resource({ type: OPA_RESOURCES.INVITATIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.GENERATE_LINK)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_CREATE)
  async generateInvitationLink(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace,
    @Param('invitationId') invitationId: string
  ): Promise<unknown> {
    const command = new GenerateInvitationLinkCommand({
      tenantId,
      actorId,
      invitationId,
      ...trace
    });
    return this.commandBus.execute(command);
  }

  @Post('members/invitations/:invitationId/resend')
  @ApiOperation({
    summary: 'Resend invitation email',
    description:
      'Regenerates a pending invitation token and dispatches email only when a non-mock email provider is configured.'
  })
  @ApiCreatedResponse({ description: 'Invitation token regenerated and resend processed.' })
  @Resource({ type: OPA_RESOURCES.INVITATIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.GENERATE_LINK)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_CREATE)
  async resendInvitation(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace,
    @Param('invitationId') invitationId: string
  ): Promise<unknown> {
    const command = new ResendInvitationCommand({
      tenantId,
      actorId,
      invitationId,
      ...trace
    });

    return this.commandBus.execute(command);
  }

  @Delete('members/invitations/:invitationId')
  @ApiOperation({
    summary: 'Revoke pending invitation',
    description:
      'Cancels a pending invitation so it can no longer be used. Requires tenant:users:update permission.'
  })
  @ApiNoContentResponse({ description: 'Pending invitation revoked successfully.' })
  @Resource({ type: OPA_RESOURCES.INVITATIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.REVOKE)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_UPDATE)
  @HttpCode(204)
  async revokeInvitation(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace,
    @Param('invitationId') invitationId: string
  ): Promise<void> {
    const command = new RevokeInvitationCommand({
      tenantId,
      actorId,
      invitationId,
      ...trace
    });

    return this.commandBus.execute(command);
  }

  /**
   * Update member role
   *
   * Requires TENANT_PERMISSIONS.USERS_UPDATE
   */
  @Patch('members/:memberId/role')
  @ApiOperation({
    summary: 'Update member role',
    description:
      "Updates a tenant member's role. Requires tenant:users:update permission. Cannot change owner role."
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.ASSIGN_ROLE)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_UPDATE)
  async updateMemberRole(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace,
    @Param('memberId') memberId: string,
    @Body() updateDto: UpdateMemberRoleDto
  ): Promise<unknown> {
    const command = new UpdateMemberRoleCommand({
      tenantId,
      actorId,
      memberId,
      role: updateDto.role,
      ...trace
    });

    return this.commandBus.execute(command);
  }

  /**
   * Update member status
   *
   * Requires TENANT_PERMISSIONS.USERS_UPDATE
   */
  @Patch('members/:memberId/status')
  @ApiOperation({
    summary: 'Update member status',
    description:
      "Updates a tenant member's status (active/inactive/suspended/pending). Requires tenant:users:update permission. Cannot deactivate owner."
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE_STATUS)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_UPDATE)
  async updateMemberStatus(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace,
    @Param('memberId') memberId: string,
    @Body() updateDto: UpdateMemberStatusDto
  ): Promise<unknown> {
    const command = new UpdateMemberStatusCommand({
      tenantId,
      actorId,
      memberId,
      status: updateDto.status,
      ...trace
    });

    return this.commandBus.execute(command);
  }

  /**
   * Remove member from tenant
   *
   * Requires TENANT_PERMISSIONS.USERS_DELETE
   */
  @Delete('members/:memberId')
  @ApiOperation({
    summary: 'Remove member',
    description:
      'Removes a member from the current tenant. Requires tenant:users:delete permission. Cannot remove owner or yourself.'
  })
  @ApiNoContentResponse({ description: 'Tenant member removed successfully.' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(TENANT_PERMISSIONS.USERS_DELETE)
  @HttpCode(204)
  async removeMember(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace,
    @Param('memberId') memberId: string
  ): Promise<void> {
    const command = new RemoveMemberCommand({
      tenantId,
      actorId,
      memberId,
      ...trace
    });

    return this.commandBus.execute(command);
  }
}
