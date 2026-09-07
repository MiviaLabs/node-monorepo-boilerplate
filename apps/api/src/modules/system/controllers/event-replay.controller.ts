import {
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  Logger
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiBody,
  ApiProperty
} from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { SYSTEM_PERMISSIONS } from '@package/constants';
import { EventReplayService, ReplayOptions } from '@package/events';
import { Action, Resource } from '@package/opa';
import { IsString, IsOptional, IsDateString, IsInt, Min } from 'class-validator';

import { buildSystemAuditEvent } from '../events';

import type { RequestTrace } from '@/common/cqrs/request-trace';
import type { NodePgDatabase } from '@package/db-core';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { MAIN_DB } from '@/common/database/database.constants';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequestTraceData } from '@/common/decorators/request-trace.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { JwtAuthGuard, HybridPolicyGuard } from '@/modules/auth/guards';

const SYSTEM_SCOPE_TENANT_ID = 'system';

/**
 * Start replay request DTO with validation
 */
export class StartReplayDto {
  @ApiProperty({
    description: 'Aggregate ID to filter events for replay',
    example: 'user-123',
    required: false
  })
  @IsOptional()
  @IsString()
  aggregateId?: string;

  @ApiProperty({
    description: 'Tenant ID to filter events for replay',
    example: 'primary-encryption-key',
    required: false
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({
    description: 'Event type to filter (e.g., user.created, order.completed)',
    example: 'user.created',
    required: false
  })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiProperty({
    description: 'Start date for event replay range (ISO 8601 format)',
    example: '2024-01-01T00:00:00.000Z',
    required: false
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'End date for event replay range (ISO 8601 format)',
    example: '2024-01-31T23:59:59.999Z',
    required: false
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Maximum number of events to replay',
    example: 100,
    minimum: 1,
    required: false
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxEvents?: number;
}

/**
 * Start replay response DTO
 */
export interface StartReplayResponseDto {
  replayId: string;
  status: string;
}

/**
 * Replay status response DTO
 */
export interface ReplayStatusResponseDto {
  replayId: string;
  status: string;
  processedCount: number;
  totalCount: number;
  successCount: number;
  failureCount: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Cancel replay response DTO
 */
export interface CancelReplayResponseDto {
  success: boolean;
  message: string;
}

/**
 * Event replay controller
 *
 * Admin endpoints for replaying historical events for debugging,
 * recovery, or aggregate rebuild scenarios.
 * All endpoints require system admin permissions.
 *
 * **Security Note - Cross-Tenant Access:**
 * This controller intentionally allows cross-tenant event replay for system admins.
 * The `tenantId` in the request body is a filter parameter, not an authorization scope.
 * System admins with `SYSTEM_PERMISSIONS.SYSTEM_SETTINGS` can replay events for any
 * tenant - this is required for disaster recovery, data migration, and debugging.
 * All operations are audit-logged with the actor's identity for compliance tracking.
 *
 * @see SYSTEM_PERMISSIONS.SYSTEM_SETTINGS - Required permission for replay operations
 * @see SYSTEM_PERMISSIONS.SYSTEM_MONITOR - Required permission for status checks
 */
@ApiTags('system')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
@VersionedController('v1', 'platform/event-replay')
export class ReplayController {
  private readonly logger = new Logger(ReplayController.name);

  constructor(
    private readonly replayService: EventReplayService,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  /**
   * Start a new event replay
   *
   * Replays historical events based on provided options.
   * Events are republished through the event bus with replay tracking.
   *
   * Requires SYSTEM_PERMISSIONS.SYSTEM_SETTINGS permission.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate event stream replay cycle',
    description:
      'Spawns a managed replay job that republishes historical events satisfying query criteria to the message broker. Requires system:system:settings permission.'
  })
  @ApiBody({
    type: StartReplayDto,
    description: 'Replay options for filtering events',
    examples: {
      aggregateReplay: {
        summary: 'Replay events for specific aggregate',
        value: {
          aggregateId: 'user-123'
        }
      },
      eventTypeFilter: {
        summary: 'Replay events filtered by type',
        value: {
          aggregateId: 'user-123',
          eventType: 'user.created'
        }
      },
      tenantReplay: {
        summary: 'Replay events for tenant',
        value: {
          tenantId: 'primary-encryption-key'
        }
      },
      dateRangeReplay: {
        summary: 'Replay events within date range',
        value: {
          tenantId: 'primary-encryption-key',
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T23:59:59.999Z'
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Replay started successfully',
    type: BaseResponseDto
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request parameters'
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid authentication'
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions'
  })
  @Resource({ type: OPA_RESOURCES.EVENT_REPLAY, scope: 'system' })
  @Action(OPA_ACTIONS.START)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_SETTINGS)
  async startReplay(
    @CurrentUser('actorId') actorId: string,
    @Body() dto: StartReplayDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<StartReplayResponseDto>> {
    // Audit log: Track which admin initiated cross-tenant replay
    this.logger.log(
      `Event replay initiated by actor ${actorId}` +
        (dto.tenantId ? ` for tenant ${dto.tenantId}` : ' (all tenants)') +
        (dto.aggregateId ? `, aggregate ${dto.aggregateId}` : '') +
        (dto.eventType ? `, type ${dto.eventType}` : '')
    );

    // Convert DTO to ReplayOptions
    const options: ReplayOptions = {
      aggregateId: dto.aggregateId,
      tenantId: dto.tenantId,
      eventType: dto.eventType,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      maxEvents: dto.maxEvents
    };

    const session = await this.replayService.startReplay(options);

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.event.replay.started.audit',
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        requestId: trace.requestId,
        aggregateId: session.replayId,
        action: 'START_EVENT_REPLAY',
        target: {
          entityType: 'event_replay',
          entityId: session.replayId
        },
        details: {
          aggregateFilterProvided: dto.aggregateId !== undefined,
          tenantFilterProvided: dto.tenantId !== undefined,
          eventTypeFilterProvided: dto.eventType !== undefined,
          dateRangeApplied: dto.startDate !== undefined || dto.endDate !== undefined,
          maxEvents: dto.maxEvents
        },
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );

    // Audit log: Record successful replay start
    this.logger.log(`Replay session ${session.replayId} started by actor ${actorId}`);

    const response: StartReplayResponseDto = {
      replayId: session.replayId,
      status: session.status
    };

    return new BaseResponseDto(response);
  }

  /**
   * Get replay session status
   *
   * Returns the current status of a replay session including
   * progress, success/failure counts, and completion status.
   *
   * Requires SYSTEM_PERMISSIONS.SYSTEM_MONITOR permission.
   */
  @Get(':replayId')
  @ApiOperation({
    summary: 'Query event replay job progression',
    description:
      'Inspects execution metrics, emitted event counts, and processing lifecycle state for an active or completed replay job. Requires system:system:monitor permission.'
  })
  @ApiParam({
    name: 'replayId',
    description: 'Replay session ID',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({
    status: 200,
    description: 'Replay status retrieved successfully',
    type: BaseResponseDto
  })
  @ApiResponse({
    status: 404,
    description: 'Replay session not found'
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid authentication'
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions'
  })
  @Resource({ type: OPA_RESOURCES.EVENT_REPLAY, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  getReplayStatus(
    @CurrentUser('actorId') actorId: string,
    @Param('replayId') replayId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<ReplayStatusResponseDto>> {
    const session = this.replayService.getReplayStatus(replayId);

    if (!session) {
      // Use NestJS built-in exception for proper 404 response
      throw new NotFoundException(`Replay session ${replayId} not found`);
    }

    const response: ReplayStatusResponseDto = {
      replayId: session.replayId,
      status: session.status,
      processedCount: session.processedCount,
      totalCount: session.totalCount,
      successCount: session.successCount,
      failureCount: session.failureCount,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      error: session.error
    };

    return this.auditOutbox
      .insert(
        this.db,
        buildSystemAuditEvent({
          eventType: 'system.event.replay.status.viewed.audit',
          tenantId: SYSTEM_SCOPE_TENANT_ID,
          actorId,
          requestId: trace.requestId,
          aggregateId: replayId,
          action: 'VIEW_EVENT_REPLAY_STATUS',
          target: {
            entityType: 'event_replay',
            entityId: replayId
          },
          details: {
            status: session.status
          },
          correlationId: trace.correlationId,
          causationId: trace.causationId
        })
      )
      .then(() => new BaseResponseDto(response));
  }

  /**
   * Cancel an active replay session
   *
   * Cancels a running replay session. Events already processed
   * will remain replayed, but no new events will be processed.
   *
   * Requires SYSTEM_PERMISSIONS.SYSTEM_SETTINGS permission.
   */
  @Post(':replayId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Abort in-flight event replay job',
    description:
      'Terminates an ongoing replay job immediately. Previously published events remain processed. Requires system:system:settings permission.'
  })
  @ApiParam({
    name: 'replayId',
    description: 'Replay session ID to cancel',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({
    status: 200,
    description: 'Replay cancelled successfully',
    type: BaseResponseDto
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid authentication'
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - insufficient permissions'
  })
  @Resource({ type: OPA_RESOURCES.EVENT_REPLAY, scope: 'system' })
  @Action(OPA_ACTIONS.CANCEL)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_SETTINGS)
  cancelReplay(
    @CurrentUser('actorId') actorId: string,
    @Param('replayId') replayId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<CancelReplayResponseDto>> {
    // Audit log: Track cancellation request
    this.logger.log(`Replay cancellation requested by actor ${actorId} for session ${replayId}`);

    const success = this.replayService.cancelReplay(replayId);

    // Audit log: Record cancellation result
    this.logger.log(
      `Replay ${replayId} cancellation by actor ${actorId}: ${success ? 'successful' : 'failed'}`
    );

    const response: CancelReplayResponseDto = {
      success,
      message: success
        ? 'Replay cancelled successfully'
        : 'Failed to cancel replay (session not found or already completed)'
    };

    return this.auditOutbox
      .insert(
        this.db,
        buildSystemAuditEvent({
          eventType: 'system.event.replay.cancelled.audit',
          tenantId: SYSTEM_SCOPE_TENANT_ID,
          actorId,
          requestId: trace.requestId,
          aggregateId: replayId,
          action: 'CANCEL_EVENT_REPLAY',
          target: {
            entityType: 'event_replay',
            entityId: replayId
          },
          details: {
            success
          },
          correlationId: trace.correlationId,
          causationId: trace.causationId
        })
      )
      .then(() => new BaseResponseDto(response));
  }
}
