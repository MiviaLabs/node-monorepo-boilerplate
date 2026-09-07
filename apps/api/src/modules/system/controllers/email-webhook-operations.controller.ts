import {
  Inject,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  ValidationPipe
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '@package/auth';
import { SYSTEM_PERMISSIONS } from '@package/constants';
import { Action, Resource } from '@package/opa';

import { ReprocessEmailWebhookEventCommand } from '../../email-webhooks/commands';
import {
  EmailWebhookEventListDto,
  EmailWebhookProcessingSummaryDto,
  ReprocessEmailWebhookEventResultDto
} from '../../email-webhooks/dto/email-webhook-operations.dto';
import { QueryEmailWebhookEventsDto } from '../../email-webhooks/dto/query-email-webhook-events.dto';
import {
  GetEmailWebhookProcessingSummaryQuery,
  ListEmailWebhookEventsQuery
} from '../../email-webhooks/queries';
import { buildSystemAuditEvent } from '../events';

import type { NodePgDatabase } from '@package/db-core';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { MAIN_DB } from '@/common/database/database.constants';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequestTraceData } from '@/common/decorators/request-trace.decorator';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { JwtAuthGuard, HybridPolicyGuard } from '@/modules/auth/guards';

const SYSTEM_SCOPE_TENANT_ID = 0;

@ApiTags('system')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, HybridPolicyGuard)
@VersionedController('v1', 'console/inbound-mail')
export class InboundMailOpsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Retrieve inbound webhook telemetry aggregation',
    description:
      'Compiles cross-tenant analytics and processing health indicators for external email webhooks.'
  })
  @ApiOkResponse({ type: EmailWebhookProcessingSummaryDto })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async getSummary(
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<EmailWebhookProcessingSummaryDto>> {
    const result = await this.queryBus.execute<
      GetEmailWebhookProcessingSummaryQuery,
      EmailWebhookProcessingSummaryDto
    >(
      new GetEmailWebhookProcessingSummaryQuery({
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        ...toCqrsTrace(trace)
      })
    );

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.email.webhooks.summary.viewed.audit',
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        requestId: trace.requestId,
        aggregateId: 'email-webhooks-summary',
        action: 'VIEW_EMAIL_WEBHOOK_SUMMARY',
        target: { entityType: 'email_webhook_summary' },
        details: {
          totalEvents: result.totalEvents,
          retryableEvents: result.retryableEvents
        },
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );

    return new BaseResponseDto(result);
  }

  @Get()
  @ApiOperation({
    summary: 'Search email webhook audit events',
    description:
      'Queries paginated event records ingested from email service providers with state and correlation filters.'
  })
  @ApiOkResponse({ type: EmailWebhookEventListDto })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.LIST)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_MONITOR)
  async listEvents(
    @CurrentUser('actorId') actorId: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    queryDto: QueryEmailWebhookEventsDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<EmailWebhookEventListDto>> {
    const result = await this.queryBus.execute<
      ListEmailWebhookEventsQuery,
      EmailWebhookEventListDto
    >(
      new ListEmailWebhookEventsQuery({
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        ...queryDto,
        ...toCqrsTrace(trace)
      })
    );

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.email.webhooks.listed.audit',
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        requestId: trace.requestId,
        aggregateId: 'email-webhooks',
        action: 'LIST_EMAIL_WEBHOOK_EVENTS',
        target: { entityType: 'email_webhook_event' },
        details: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          provider: queryDto.provider,
          organizationId: queryDto.organizationId,
          processingStatus: queryDto.processingStatus,
          verificationStatus: queryDto.verificationStatus,
          normalizedEventType: queryDto.normalizedEventType,
          providerEventType: queryDto.providerEventType,
          providerMessageId: queryDto.providerMessageId,
          providerDeliveryId: queryDto.providerDeliveryId,
          providerEventId: queryDto.providerEventId,
          emailMessageId: queryDto.emailMessageId,
          dateFrom: queryDto.dateFrom,
          dateTo: queryDto.dateTo
        },
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );

    return new BaseResponseDto(result);
  }

  @Post(':id/reprocess')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger reprocessing of failed webhook event',
    description:
      'Replays correlation resolution and delivery tracking logic for an unmatched or failed email notification payload.'
  })
  @ApiOkResponse({ type: ReprocessEmailWebhookEventResultDto })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.REPLAY)
  @RequirePermissions(SYSTEM_PERMISSIONS.SYSTEM_SETTINGS)
  async reprocessEvent(
    @CurrentUser('actorId') actorId: string,
    @Param('id', ParseIntPipe) id: number,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<ReprocessEmailWebhookEventResultDto>> {
    const result = await this.commandBus.execute<
      ReprocessEmailWebhookEventCommand,
      ReprocessEmailWebhookEventResultDto
    >(
      new ReprocessEmailWebhookEventCommand({
        webhookEventId: id
      })
    );

    await this.auditOutbox.insert(
      this.db,
      buildSystemAuditEvent({
        eventType: 'system.email.webhooks.reprocessed.audit',
        tenantId: SYSTEM_SCOPE_TENANT_ID,
        actorId,
        requestId: trace.requestId,
        aggregateId: String(id),
        action: 'REPROCESS_EMAIL_WEBHOOK_EVENT',
        target: { entityType: 'email_webhook_event', entityId: String(id) },
        details: {
          processingStatus: result.processingStatus,
          attemptCount: result.attemptCount,
          reprocessed: result.reprocessed
        },
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );

    return new BaseResponseDto(result);
  }
}
