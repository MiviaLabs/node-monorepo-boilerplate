import { Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { SYSTEM_PERMISSIONS } from '@package/constants';
import { DeadLetterService } from '@package/events';
import { Action, Resource } from '@package/opa';

import { DeadLetterEventDto, ReplayDeadLetterResponseDto } from '../dto';
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
 * Dead letter queue controller
 *
 * Admin endpoints for managing permanently failed events.
 * All endpoints require system admin permissions.
 */
@ApiTags('system')
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
@VersionedController('v1', 'console/queues/dead-letters')
export class DeadLettersController {
  constructor(
    private readonly deadLetterService: DeadLetterService,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  /**
   * Get all dead-lettered events
   *
   * Returns events that have exceeded max retry attempts.
   * Requires SYSTEM_PERMISSIONS.SYSTEM_MONITOR permission.
   */
  @Get()
  @ApiOperation({
    summary: 'List poisoned and dead-lettered queue events',
    description:
      'Queries exhausted event payloads that exceeded retry thresholds and were diverted to the dead-letter exchange. Requires system:system:monitor permission.'
  })
  @ApiResponse({
    status: 200,
    description: 'Dead-lettered events retrieved successfully',
    type: BaseResponseDto
  })
  @Resource({ type: OPA_RESOURCES.DEAD_LETTER_EVENTS, scope: 'system' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getDeadLetteredEvents(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<DeadLetterEventDto[]>> {
    const events = await this.deadLetterService.getDeadLetteredEvents();

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.dead.letter.listed.audit',
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        requestId: trace.requestId,
        aggregateId: 'dead-letter',
        action: 'LIST_DEAD_LETTER_EVENTS',
        target: {
          entityType: 'dead_letter_queue'
        },
        details: {
          resultCount: events.length
        },
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );

    return new BaseResponseDto(events);
  }

  /**
   * Replay a dead-lettered event
   *
   * Resets the event for retry by clearing dead letter fields.
   * Requires SYSTEM_PERMISSIONS.SYSTEM_SETTINGS permission.
   */
  @Post(':eventId/replay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-queue dead-lettered message for processing',
    description:
      'Purges error markers and dispatches the dead-lettered event back into the processing queue. Requires system:system:settings permission.'
  })
  @ApiParam({
    name: 'eventId',
    description: 'Identifier of the dead-lettered event to re-drive',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({
    status: 200,
    description: 'Event queued for replay',
    type: ReplayDeadLetterResponseDto
  })
  @Resource({ type: OPA_RESOURCES.DEAD_LETTER_EVENTS, scope: 'system' })
  @Action(OPA_ACTIONS.REPLAY)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_SETTINGS)
  async replayEvent(
    @CurrentUser('actorId') actorId: string,
    @Param('eventId') eventId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<ReplayDeadLetterResponseDto>> {
    const success = await this.deadLetterService.replayFromDeadLetter(eventId);

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.dead.letter.replayed.audit',
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        requestId: trace.requestId,
        aggregateId: eventId,
        action: 'REPLAY_DEAD_LETTER_EVENT',
        target: {
          entityType: 'dead_letter_event',
          entityId: eventId
        },
        details: {
          success
        },
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );

    const response: ReplayDeadLetterResponseDto = {
      eventId,
      success,
      message: success
        ? 'Event queued for replay'
        : 'Failed to queue event for replay (event may not exist or is not dead-lettered)'
    };

    return new BaseResponseDto(response);
  }

  /**
   * Delete a dead-lettered event
   *
   * Permanently removes a dead-lettered event.
   * Requires SYSTEM_PERMISSIONS.SYSTEM_SETTINGS permission.
   */
  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Purge dead-lettered event from quarantine',
    description:
      'Irrevocably deletes a dead-lettered message from the quarantine registry. Requires system:system:settings permission.'
  })
  @ApiParam({
    name: 'eventId',
    description: 'Identifier of the dead-lettered event to discard',
    type: String,
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @ApiResponse({
    status: 204,
    description: 'Event deleted successfully'
  })
  @Resource({ type: OPA_RESOURCES.DEAD_LETTER_EVENTS, scope: 'system' })
  @Action(OPA_ACTIONS.DELETE)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_SETTINGS)
  async deleteEvent(
    @CurrentUser('actorId') actorId: string,
    @Param('eventId') eventId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    // Delete the event - returns success even if event doesn't exist for idempotency
    const success = await this.deadLetterService.deleteDeadLetteredEvent(eventId);

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.dead.letter.deleted.audit',
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        requestId: trace.requestId,
        aggregateId: eventId,
        action: 'DELETE_DEAD_LETTER_EVENT',
        target: {
          entityType: 'dead_letter_event',
          entityId: eventId
        },
        details: {
          success
        },
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );
  }
}
