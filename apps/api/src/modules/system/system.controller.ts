import {
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { SYSTEM_PERMISSIONS } from '@package/constants';
import { Action, Resource } from '@package/opa';

import {
  CreateTenantCommand,
  UpdateTenantCommand,
  DeleteTenantCommand,
  UpdateSettingsCommand
} from './commands';
import {
  CreateTenantDto,
  UpdateTenantDto,
  SystemSettingsDto,
  TenantResponseDto,
  SystemMetricsDto
} from './dto';
import { ListTenantsQuery, GetMetricsQuery, GetSettingsQuery } from './queries';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { CurrentUser, RequestTraceData } from '@/common/decorators';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos';
import { JwtAuthGuard, HybridPolicyGuard } from '@/modules/auth/guards';

/**
 * System controller
 *
 * Handles system-wide operations that require elevated permissions.
 * All endpoints require authentication and specific system permissions.
 */
@ApiTags('system')
@ApiBearerAuth()
@VersionedController('v1', 'platform')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
export class PlatformController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  /**
   * List all tenants (system-wide operation)
   *
   * Requires SYSTEM_PERMISSIONS.TENANTS_READ
   */
  @Get('workspaces')
  @ApiOperation({
    summary: 'Retrieve registered tenants directory',
    description:
      'Fetches a comprehensive roster of system tenants. Access is restricted to callers holding the system:tenants:read permission.'
  })
  @Resource({ type: OPA_RESOURCES.TENANTS, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANTS_READ)
  async listTenants(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<TenantResponseDto[]>> {
    // System tenant ID is typically 0 or a special system tenant
    const systemTenantId = 0;

    const query = new ListTenantsQuery({
      tenantId: systemTenantId,
      actorId,
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.queryBus.execute(query);

    return new BaseResponseDto(result);
  }

  /**
   * Create a new tenant (system-wide operation)
   *
   * Requires SYSTEM_PERMISSIONS.TENANTS_CREATE
   */
  @Post('workspaces')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Provision tenant organization',
    description:
      'Initializes and registers a new organization tenant entity. Access requires the system:tenants:create permission.'
  })
  @ApiBody({
    type: CreateTenantDto,
    description: 'Tenant creation parameters including name and slug'
  })
  @Resource({ type: OPA_RESOURCES.TENANTS, scope: 'system' })
  @Action(OPA_ACTIONS.CREATE)
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANTS_CREATE)
  async createTenant(
    @CurrentUser('actorId') actorId: string,
    @Body() createTenantDto: CreateTenantDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<TenantResponseDto>> {
    // System tenant ID is typically 0 or a special system tenant
    const systemTenantId = 0;

    const command = new CreateTenantCommand({
      tenantId: systemTenantId,
      actorId,
      name: createTenantDto.name,
      slug: createTenantDto.slug,
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.commandBus.execute(command);

    return new BaseResponseDto(result);
  }

  /**
   * Update tenant settings (system-wide operation)
   *
   * Requires SYSTEM_PERMISSIONS.TENANTS_UPDATE
   */
  @Patch('workspaces/:id')
  @ApiOperation({
    summary: 'Modify tenant configuration and profile',
    description:
      'Applies incremental updates to target tenant properties. Requires the system:tenants:update permission.'
  })
  @ApiParam({
    name: 'id',
    description: 'Target tenant unique identifier',
    type: String,
    example: '123'
  })
  @ApiBody({
    type: UpdateTenantDto,
    description: 'Partial tenant payload with mutable fields'
  })
  @Resource({ type: OPA_RESOURCES.TENANTS, scope: 'system' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANTS_UPDATE)
  async updateTenant(
    @CurrentUser('actorId') actorId: string,
    @Param('id') targetTenantId: string,
    @Body() updateTenantDto: UpdateTenantDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<TenantResponseDto>> {
    // System tenant ID is typically 0 or a special system tenant
    const systemTenantId = 0;

    const command = new UpdateTenantCommand({
      tenantId: systemTenantId,
      actorId,
      targetTenantId,
      ...(updateTenantDto.name !== undefined && { name: updateTenantDto.name }),
      ...(updateTenantDto.slug !== undefined && { slug: updateTenantDto.slug }),
      ...(updateTenantDto.status !== undefined && { status: updateTenantDto.status }),
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.commandBus.execute(command);

    return new BaseResponseDto(result);
  }

  /**
   * Delete a tenant (dangerous operation)
   *
   * Requires SYSTEM_PERMISSIONS.TENANTS_DELETE
   */
  @Delete('workspaces/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hard delete tenant and purge associated records',
    description:
      'Permanently purges a tenant along with bound resources across all services. Requires the system:tenants:delete permission.'
  })
  @ApiParam({
    name: 'id',
    description: 'Tenant unique identifier to purge',
    type: String,
    example: '123'
  })
  @Resource({ type: OPA_RESOURCES.TENANTS, scope: 'system' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(SYSTEM_PERMISSIONS.TENANTS_DELETE)
  async deleteTenant(
    @CurrentUser('actorId') actorId: string,
    @Param('id') targetTenantId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    // System tenant ID is typically 0 or a special system tenant
    const systemTenantId = 0;

    const command = new DeleteTenantCommand({
      tenantId: systemTenantId,
      actorId,
      targetTenantId,
      ...toCqrsTrace(trace)
    });

    await this.commandBus.execute(command);
  }

  /**
   * System monitoring endpoint
   *
   * Requires SYSTEM_PERMISSIONS.SYSTEM_MONITOR
   */
  @Get('monitor')
  @ApiOperation({
    summary: 'Inspect operational system metrics',
    description:
      'Gathers uptime, resource consumption, tenant breakdowns, and request telemetry. Requires the system:system:monitor permission.'
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getSystemMetrics(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<SystemMetricsDto>> {
    // System tenant ID is typically 0 or a special system tenant
    const systemTenantId = 0;

    const query = new GetMetricsQuery({
      tenantId: systemTenantId,
      actorId,
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.queryBus.execute(query);

    return new BaseResponseDto(result);
  }

  /**
   * System settings endpoint (GET)
   *
   * Requires SYSTEM_PERMISSIONS.SYSTEM_SETTINGS
   */
  @Get('settings')
  @ApiOperation({
    summary: 'Inspect platform configuration parameters',
    description:
      'Reads system-wide registration, session, and security policy preferences. Requires the system:system:settings permission.'
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_SETTINGS, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_SETTINGS)
  async getSystemSettings(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<SystemSettingsDto>> {
    const targetTenantId = Number(tenantId);

    const query = new GetSettingsQuery({
      tenantId: targetTenantId,
      actorId,
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.queryBus.execute(query);

    return new BaseResponseDto(result);
  }

  /**
   * System settings endpoint (PUT)
   *
   * Requires SYSTEM_PERMISSIONS.SYSTEM_SETTINGS
   */
  @Patch('settings')
  @ApiOperation({
    summary: 'Update platform configuration parameters',
    description:
      'Modifies global system settings including authentication and tenancy guardrails. Requires the system:system:settings permission.'
  })
  @ApiBody({
    type: SystemSettingsDto,
    description: 'Updated system settings attributes'
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_SETTINGS, scope: 'system' })
  @Action(OPA_ACTIONS.WRITE)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_SETTINGS)
  async updateSystemSettings(
    @TenantId() tenantId: string,
    @CurrentUser('actorId') actorId: string,
    @Body() settingsDto: SystemSettingsDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<SystemSettingsDto>> {
    const targetTenantId = Number(tenantId);

    const command = new UpdateSettingsCommand({
      tenantId: targetTenantId,
      actorId,
      settings: settingsDto,
      ...toCqrsTrace(trace)
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.commandBus.execute(command);

    return new BaseResponseDto(result);
  }
}
