import {
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { SYSTEM_PERMISSIONS } from '@package/constants';
import { Action, Resource } from '@package/opa';

import {
  AdminAccessOverviewDto,
  AdminEmailDetailDto,
  AdminEmailSummaryDto,
  AdminEmailsOverviewDto,
  AdminDeletionQueueSummaryDto,
  AdminDeletionsOverviewDto,
  AdminHealthOverviewDto,
  AdminInboxOverviewDto,
  AdminMemberDetailDto,
  AdminOutboxOverviewDto,
  AdminOutboxSummaryDto,
  AdminStatisticsOverviewDto,
  AdminTenantDetailDto,
  AdminTenantsOverviewDto,
  AdminUserDetailDto,
  AdminUsersOverviewDto,
  QueryAdminAccessOverviewDto,
  QueryAdminEmailsOverviewDto,
  QueryAdminDeletionsOverviewDto,
  QueryAdminOutboxOverviewDto,
  QueryAdminTenantsOverviewDto,
  QueryAdminUsersOverviewDto
} from './dto';
import {
  GetAdminAccessOverviewQuery,
  GetAdminEmailDetailQuery,
  GetAdminEmailSummaryQuery,
  GetAdminEmailsOverviewQuery,
  GetAdminDeletionQueueSummaryQuery,
  GetAdminDeletionsOverviewQuery,
  GetAdminHealthOverviewQuery,
  GetAdminInboxOverviewQuery,
  GetAdminMemberDetailQuery,
  GetAdminOutboxOverviewQuery,
  GetAdminOutboxSummaryQuery,
  GetAdminStatisticsOverviewQuery,
  GetAdminTenantDetailQuery,
  GetAdminTenantsOverviewQuery,
  GetAdminUserDetailQuery,
  GetAdminUsersOverviewQuery
} from './queries';
import { DeleteTenantCommand } from '../system/commands';
import { RemoveMemberCommand } from '../tenants/commands';
import { DeleteUserCommand } from '../users/commands';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequestTraceData } from '@/common/decorators/request-trace.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

@ApiTags('admin')
@ApiBearerAuth()
@VersionedController('v1', 'console')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class ConsoleController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus
  ) {}

  @Get('ops/health')
  @ApiOperation({
    summary: 'Retrieve administrative health and subsystem diagnostics',
    description:
      'Gathers operational health indicators, database connectivity, and messaging queue status for administrator dashboards.'
  })
  @ApiOkResponse({
    description: 'Admin health overview returned successfully.',
    type: AdminHealthOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getHealthOverview(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminHealthOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminHealthOverviewQuery,
      AdminHealthOverviewDto
    >(
      new GetAdminHealthOverviewQuery({
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('statistics')
  @ApiOperation({
    summary: 'Retrieve platform operations metrics and aggregates',
    description:
      'Aggregates tenant populations, user counts, and platform activity counters for administrative monitoring.'
  })
  @ApiOkResponse({
    description: 'Admin statistics overview returned successfully.',
    type: AdminStatisticsOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getStatisticsOverview(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminStatisticsOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminStatisticsOverviewQuery,
      AdminStatisticsOverviewDto
    >(
      new GetAdminStatisticsOverviewQuery({
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('deletions/summary')
  @ApiOperation({
    summary: 'Retrieve data retention and purge queue posture',
    description:
      'Exposes pending soft-deletion backlogs, scheduled purges, and retention lifecycle metrics.'
  })
  @ApiOkResponse({
    description: 'Admin deletion queue summary returned successfully.',
    type: AdminDeletionQueueSummaryDto
  })
  @Resource({ type: OPA_RESOURCES.DATA_RETENTION, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_RETENTION_READ)
  async getDeletionQueueSummary(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminDeletionQueueSummaryDto>> {
    const result = await this.queryBus.execute<
      GetAdminDeletionQueueSummaryQuery,
      AdminDeletionQueueSummaryDto
    >(
      new GetAdminDeletionQueueSummaryQuery({
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('deletions')
  @ApiOperation({
    summary: 'List pending soft-deletion records',
    description:
      'Retrieves a paginated inventory of soft-deleted organizations and user accounts queued for permanent data purging.'
  })
  @ApiOkResponse({
    description: 'Admin deletions overview returned successfully.',
    type: AdminDeletionsOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.DATA_RETENTION, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.DATA_RETENTION_READ)
  async getDeletionsOverview(
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryAdminDeletionsOverviewDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminDeletionsOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminDeletionsOverviewQuery,
      AdminDeletionsOverviewDto
    >(
      new GetAdminDeletionsOverviewQuery({
        ...queryDto,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('outbox/summary')
  @ApiOperation({
    summary: 'Fetch event outbox health and backlog telemetry',
    description:
      'Surveys queued outbox records, in-flight retries, and dead-letter statuses across asynchronous handlers.'
  })
  @ApiOkResponse({
    description: 'Admin outbox summary returned successfully.',
    type: AdminOutboxSummaryDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getOutboxSummary(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminOutboxSummaryDto>> {
    const result = await this.queryBus.execute<
      GetAdminOutboxSummaryQuery,
      AdminOutboxSummaryDto
    >(
      new GetAdminOutboxSummaryQuery({
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('outbox')
  @ApiOperation({
    summary: 'Query asynchronous outbox transaction ledger',
    description:
      'Provides a paginated audit stream of transactional outbox records segmented by dispatch state and error context.'
  })
  @ApiOkResponse({
    description: 'Admin outbox overview returned successfully.',
    type: AdminOutboxOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getOutboxOverview(
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryAdminOutboxOverviewDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminOutboxOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminOutboxOverviewQuery,
      AdminOutboxOverviewDto
    >(
      new GetAdminOutboxOverviewQuery({
        ...queryDto,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('emails/summary')
  @ApiOperation({
    summary: 'Aggregate transactional email delivery analytics',
    description:
      'Compiles high-level delivery counters, failure tallies, and provider statuses for transactional emails.'
  })
  @ApiOkResponse({
    description: 'Admin email summary returned successfully.',
    type: AdminEmailSummaryDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getEmailSummary(
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryAdminEmailsOverviewDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminEmailSummaryDto>> {
    const result = await this.queryBus.execute<
      GetAdminEmailSummaryQuery,
      AdminEmailSummaryDto
    >(
      new GetAdminEmailSummaryQuery({
        ...queryDto,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('emails')
  @ApiOperation({
    summary: 'List transactional email dispatch logs',
    description:
      'Retrieves a searchable, paginated log of outbound emails alongside live delivery state and provider responses.'
  })
  @ApiOkResponse({
    description: 'Admin emails overview returned successfully.',
    type: AdminEmailsOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getEmailsOverview(
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryAdminEmailsOverviewDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminEmailsOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminEmailsOverviewQuery,
      AdminEmailsOverviewDto
    >(
      new GetAdminEmailsOverviewQuery({
        ...queryDto,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('emails/:emailMessageId')
  @ApiOperation({
    summary: 'Inspect detailed email dispatch lifecycle',
    description:
      'Presents the full operational timeline, delivery attempts, and associated webhook callbacks for a specific outbound email.'
  })
  @ApiOkResponse({
    description: 'Admin email detail returned successfully.',
    type: AdminEmailDetailDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getEmailDetail(
    @CurrentUser('actorId') actorId: string,
    @Param('emailMessageId', ParseIntPipe) emailMessageId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminEmailDetailDto>> {
    const result = await this.queryBus.execute<
      GetAdminEmailDetailQuery,
      AdminEmailDetailDto
    >(
      new GetAdminEmailDetailQuery({
        emailMessageId,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('workspaces')
  @ApiOperation({
    summary: 'List managed tenant organizations',
    description:
      'Supplies a paginated catalog of platform tenants, current subscription postures, and lifecycle statuses.'
  })
  @ApiOkResponse({
    description: 'Admin tenants overview returned successfully.',
    type: AdminTenantsOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.TENANTS, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANTS_READ)
  async getTenantsOverview(
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryAdminTenantsOverviewDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminTenantsOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminTenantsOverviewQuery,
      AdminTenantsOverviewDto
    >(
      new GetAdminTenantsOverviewQuery({
        ...queryDto,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('workspaces/:organizationId')
  @ApiOperation({
    summary: 'Retrieve single tenant operational dossier',
    description:
      'Delivers full configuration, security posture, and membership stats for a specified tenant organization.'
  })
  @ApiOkResponse({
    description: 'Admin tenant detail returned successfully.',
    type: AdminTenantDetailDto
  })
  @Resource({ type: OPA_RESOURCES.TENANTS, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANTS_READ)
  async getTenantDetail(
    @CurrentUser('actorId') actorId: string,
    @Param('organizationId', ParseIntPipe) organizationId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminTenantDetailDto>> {
    const result = await this.queryBus.execute<
      GetAdminTenantDetailQuery,
      AdminTenantDetailDto
    >(
      new GetAdminTenantDetailQuery({
        organizationId,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('access')
  @ApiOperation({
    summary: 'Audit platform access and permission assignments',
    description:
      'Presents a cross-cutting view of user roles, tenant memberships, and assigned permission profiles.'
  })
  @ApiOkResponse({
    description: 'Admin access overview returned successfully.',
    type: AdminAccessOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_READ)
  async getAccessOverview(
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryAdminAccessOverviewDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminAccessOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminAccessOverviewQuery,
      AdminAccessOverviewDto
    >(
      new GetAdminAccessOverviewQuery({
        ...queryDto,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('people')
  @ApiOperation({
    summary: 'List global user identities across tenants',
    description:
      'Retrieves a directory of all registered user accounts, credential postures, and account activity indicators.'
  })
  @ApiOkResponse({
    description: 'Admin users overview returned successfully.',
    type: AdminUsersOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_READ)
  async getUsersOverview(
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryAdminUsersOverviewDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminUsersOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminUsersOverviewQuery,
      AdminUsersOverviewDto
    >(
      new GetAdminUsersOverviewQuery({
        ...queryDto,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('people/:userId')
  @ApiOperation({
    summary: 'Inspect global user identity profile',
    description:
      'Fetches comprehensive user account details, identity provider links, and cross-tenant associations.'
  })
  @ApiOkResponse({
    description: 'Admin user detail returned successfully.',
    type: AdminUserDetailDto
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_READ)
  async getUserDetail(
    @CurrentUser('actorId') actorId: string,
    @Param('userId', ParseIntPipe) userId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminUserDetailDto>> {
    const result = await this.queryBus.execute<
      GetAdminUserDetailQuery,
      AdminUserDetailDto
    >(
      new GetAdminUserDetailQuery({
        userId,
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Get('memberships/:userId')
  @ApiOperation({
    summary: 'Inspect tenant membership authorization details',
    description:
      'Retrieves specific membership roles, status flags, and scopes for a user within a target tenant organization.'
  })
  @ApiOkResponse({
    description: 'Admin member detail returned successfully.',
    type: AdminMemberDetailDto
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_READ)
  async getMemberDetail(
    @CurrentUser('actorId') actorId: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('tenantId', ParseIntPipe) tenantId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminMemberDetailDto>> {
    const result = await this.queryBus.execute<
      GetAdminMemberDetailQuery,
      AdminMemberDetailDto
    >(
      new GetAdminMemberDetailQuery({
        userId,
        tenantId,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }

  @Delete('workspaces/:tenantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Flag tenant organization for soft decommissioning',
    description:
      'Marks a tenant organization and its scoped user relationships for soft-deletion and subsequent purge queues.'
  })
  @Resource({ type: OPA_RESOURCES.TENANTS, scope: 'system' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANTS_DELETE)
  async deleteTenant(
    @CurrentUser('actorId') actorId: string,
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteTenantCommand({
        tenantId: 0,
        actorId,
        targetTenantId: String(tenantId),
        ...toCqrsTrace(trace)
      })
    );
  }

  @Delete('people/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Flag user account for global soft-deletion',
    description:
      'Initiates global soft-deletion of an account across the platform, maintaining audit lineage within the owning organization.'
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'system' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_DELETE)
  async deleteUser(
    @CurrentUser('actorId') actorId: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('organizationId', ParseIntPipe) organizationId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    await this.commandBus.execute(
      new DeleteUserCommand({
        tenantId: organizationId,
        actorId: Number(actorId),
        id: userId,
        ...toCqrsTrace(trace)
      })
    );
  }

  @Delete('memberships/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke organization tenancy membership',
    description:
      'Detaches a user from a specific organization tenant while leaving the global user identity intact.'
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'system' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_DELETE)
  async removeMembership(
    @CurrentUser('actorId') actorId: string,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('tenantId', ParseIntPipe) tenantId: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveMemberCommand({
        tenantId: String(tenantId),
        actorId,
        memberId: String(userId),
        ...toCqrsTrace(trace)
      })
    );
  }

  @Get('inbox')
  @ApiOperation({
    summary: 'Inspect administrative notification feed',
    description: 'Queries incoming system alerts, operational signals, and administrative messages.'
  })
  @ApiOkResponse({
    description: 'Admin inbox overview returned successfully.',
    type: AdminInboxOverviewDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getInboxOverview(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AdminInboxOverviewDto>> {
    const result = await this.queryBus.execute<
      GetAdminInboxOverviewQuery,
      AdminInboxOverviewDto
    >(
      new GetAdminInboxOverviewQuery({
        tenantId: 0,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(result);
  }
}
