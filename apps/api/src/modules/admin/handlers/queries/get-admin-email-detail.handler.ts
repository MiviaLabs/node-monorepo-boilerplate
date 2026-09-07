import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  emailProviderMessages,
  emailWebhookEvents,
  sql,
  type IEmailMessageMetadata
} from '@package/db-core';

import { buildAdminEmailInventorySql } from './admin-emails-report';
import { AdminEmailDetailDto, type AdminEmailItemDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminEmailDetailQuery } from '../../queries';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminEmailDetailQuery)
export class GetAdminEmailDetailHandler implements IQueryHandler<
  GetAdminEmailDetailQuery,
  AdminEmailDetailDto
> {
  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: GetAdminEmailDetailQuery): Promise<AdminEmailDetailDto> {
    const inventorySql = buildAdminEmailInventorySql();

    const [detailResult, providerAttemptsResult, webhookEventsResult] = await Promise.all([
      this.db.execute(sql`
        with email_inventory as (${inventorySql})
        select email_inventory.*
        from email_inventory
        where email_inventory.email_message_id = ${query.emailMessageId}
        limit 1
      `),
      this.db.execute(sql`
        select
          ${emailProviderMessages.id} as id,
          ${emailProviderMessages.provider} as provider,
          ${emailProviderMessages.attemptNumber} as attempt_number,
          ${emailProviderMessages.providerMessageId} as provider_message_id,
          ${emailProviderMessages.providerDeliveryId} as provider_delivery_id,
          ${emailProviderMessages.providerEventId} as provider_event_id,
          ${emailProviderMessages.providerStatus} as provider_status,
          ${emailProviderMessages.normalizedStatus} as normalized_provider_status,
          ${emailProviderMessages.correlationId} as correlation_id,
          ${emailProviderMessages.acceptedAt} as accepted_at,
          ${emailProviderMessages.lastWebhookOccurredAt} as last_webhook_occurred_at,
          ${emailProviderMessages.lastWebhookAt} as last_webhook_at,
          ${emailProviderMessages.createdAt} as created_at,
          ${emailProviderMessages.updatedAt} as updated_at
        from ${emailProviderMessages}
        where ${emailProviderMessages.emailMessageId} = ${query.emailMessageId}
        order by ${emailProviderMessages.attemptNumber} desc, ${emailProviderMessages.id} desc
      `),
      this.db.execute(sql`
        select
          ${emailWebhookEvents.id} as id,
          ${emailWebhookEvents.provider} as provider,
          ${emailWebhookEvents.providerEventType} as provider_event_type,
          ${emailWebhookEvents.normalizedEventType} as normalized_event_type,
          ${emailWebhookEvents.verificationStatus} as verification_status,
          ${emailWebhookEvents.processingStatus} as processing_status,
          ${emailWebhookEvents.providerMessageId} as provider_message_id,
          ${emailWebhookEvents.providerDeliveryId} as provider_delivery_id,
          ${emailWebhookEvents.providerEventId} as provider_event_id,
          ${emailWebhookEvents.emailProviderMessageId} as email_provider_message_id,
          ${emailWebhookEvents.attemptCount} as attempt_count,
          ${emailWebhookEvents.processingError} as processing_error,
          ${emailWebhookEvents.occurredAt} as occurred_at,
          ${emailWebhookEvents.receivedAt} as received_at,
          ${emailWebhookEvents.processedAt} as processed_at
        from ${emailWebhookEvents}
        where ${emailWebhookEvents.emailMessageId} = ${query.emailMessageId}
        order by ${emailWebhookEvents.receivedAt} desc, ${emailWebhookEvents.id} desc
      `)
    ]);

    const detailRow = detailResult.rows[0] as EmailInventoryRow | undefined;

    if (!detailRow) {
      throw new NotFoundException(`Email message ${query.emailMessageId} was not found`);
    }

    const item = this.mapInventoryRow(detailRow);
    const providerAttempts = (providerAttemptsResult.rows as ProviderAttemptRow[]).map((row) =>
      this.mapProviderAttempt(row)
    );
    const relatedWebhookEvents = (webhookEventsResult.rows as WebhookEventRow[]).map((row) =>
      this.mapWebhookEvent(row)
    );

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.email.detail.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: String(query.emailMessageId),
        action: 'VIEW_ADMIN_EMAIL_DETAIL',
        target: {
          entityType: 'email_message',
          entityId: String(query.emailMessageId)
        },
        details: {
          emailMessageId: query.emailMessageId,
          organizationId: item.organizationId,
          providerAttemptCount: providerAttempts.length,
          relatedWebhookEventCount: relatedWebhookEvents.length
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return {
      generatedAt: new Date().toISOString(),
      item,
      providerAttempts,
      relatedWebhookEvents
    };
  }

  private mapInventoryRow(row: EmailInventoryRow): AdminEmailItemDto {
    return {
      emailMessageId: this.toInt(row.email_message_id, 'email_message_id'),
      publicId: row.public_id,
      organizationId: this.toInt(row.organization_id, 'organization_id'),
      organizationName: row.organization_name,
      referenceType: row.reference_type ?? undefined,
      referenceId: row.reference_id ?? undefined,
      subject: row.subject ?? undefined,
      messageStatus: row.message_status,
      provider: row.provider ?? undefined,
      attemptNumber: this.toOptionalInt(row.attempt_number),
      providerMessageId: row.provider_message_id ?? undefined,
      providerDeliveryId: row.provider_delivery_id ?? undefined,
      providerEventId: row.provider_event_id ?? undefined,
      providerStatus: row.provider_status ?? undefined,
      normalizedProviderStatus: row.normalized_provider_status ?? undefined,
      acceptedAt: this.toOptionalIsoString(row.accepted_at),
      deliveredAt: this.toOptionalIsoString(row.delivered_at),
      failedAt: this.toOptionalIsoString(row.failed_at),
      lastWebhookOccurredAt: this.toOptionalIsoString(row.last_webhook_occurred_at),
      lastWebhookAt: this.toOptionalIsoString(row.last_webhook_at),
      failedWebhookCount: this.toInt(row.failed_webhook_count, 'failed_webhook_count'),
      unmatchedWebhookCount: this.toInt(row.unmatched_webhook_count, 'unmatched_webhook_count'),
      latestWebhookProcessingStatus: row.latest_webhook_processing_status ?? undefined,
      webhookAttentionState: row.webhook_attention_state,
      correlationId: row.correlation_id ?? undefined,
      safeMetadataSummary: this.toMetadataSummary(row.metadata)
    };
  }

  private mapProviderAttempt(
    row: ProviderAttemptRow
  ): AdminEmailDetailDto['providerAttempts'][number] {
    return {
      id: this.toInt(row.id, 'provider_attempt.id'),
      provider: row.provider,
      attemptNumber: this.toInt(row.attempt_number, 'provider_attempt.attempt_number'),
      providerMessageId: row.provider_message_id ?? undefined,
      providerDeliveryId: row.provider_delivery_id ?? undefined,
      providerEventId: row.provider_event_id ?? undefined,
      providerStatus: row.provider_status ?? undefined,
      normalizedProviderStatus: row.normalized_provider_status ?? undefined,
      correlationId: row.correlation_id ?? undefined,
      acceptedAt: this.toOptionalIsoString(row.accepted_at),
      lastWebhookOccurredAt: this.toOptionalIsoString(row.last_webhook_occurred_at),
      lastWebhookAt: this.toOptionalIsoString(row.last_webhook_at),
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at)
    };
  }

  private mapWebhookEvent(
    row: WebhookEventRow
  ): AdminEmailDetailDto['relatedWebhookEvents'][number] {
    return {
      id: this.toInt(row.id, 'webhook_event.id'),
      provider: row.provider,
      providerEventType: row.provider_event_type,
      normalizedEventType: row.normalized_event_type,
      verificationStatus: row.verification_status,
      processingStatus: row.processing_status,
      providerMessageId: row.provider_message_id ?? undefined,
      providerDeliveryId: row.provider_delivery_id ?? undefined,
      providerEventId: row.provider_event_id ?? undefined,
      emailProviderMessageId: this.toOptionalInt(row.email_provider_message_id),
      attemptCount: this.toInt(row.attempt_count, 'webhook_event.attempt_count'),
      processingError: row.processing_error ?? undefined,
      occurredAt: this.toOptionalIsoString(row.occurred_at),
      receivedAt: this.toIsoString(row.received_at),
      processedAt: this.toOptionalIsoString(row.processed_at)
    };
  }

  private toMetadataSummary(
    metadata: IEmailMessageMetadata | null
  ): AdminEmailItemDto['safeMetadataSummary'] {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }

    const tagCount = Array.isArray(metadata.tags) ? metadata.tags.length : undefined;
    const headerKeys =
      metadata.headers && typeof metadata.headers === 'object'
        ? Object.keys(metadata.headers).slice(0, 10)
        : undefined;
    const providerHintKeys =
      metadata.providerHints && typeof metadata.providerHints === 'object'
        ? Object.keys(metadata.providerHints).slice(0, 10)
        : undefined;

    if (!metadata.templateKey && !tagCount && !headerKeys?.length && !providerHintKeys?.length) {
      return undefined;
    }

    return {
      templateKey: metadata.templateKey,
      tagCount,
      headerKeys: headerKeys?.length ? headerKeys : undefined,
      providerHintKeys: providerHintKeys?.length ? providerHintKeys : undefined
    };
  }

  private toInt(value: unknown, fieldName: string): number {
    if (value === null || value === undefined || value === '') {
      throw new Error(`Missing required numeric field: ${fieldName}`);
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid numeric field ${fieldName}`);
    }

    return parsed;
  }

  private toOptionalInt(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    return parsed;
  }

  private toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toOptionalIsoString(value: Date | string | null): string | undefined {
    if (value === null) {
      return undefined;
    }

    return this.toIsoString(value);
  }
}

type EmailInventoryRow = {
  email_message_id: unknown;
  public_id: string;
  organization_id: unknown;
  organization_name: string;
  reference_type: string | null;
  reference_id: string | null;
  subject: string | null;
  message_status: string;
  provider: string | null;
  attempt_number: unknown;
  provider_message_id: string | null;
  provider_delivery_id: string | null;
  provider_event_id: string | null;
  provider_status: string | null;
  normalized_provider_status: string | null;
  accepted_at: Date | string | null;
  delivered_at: Date | string | null;
  failed_at: Date | string | null;
  last_webhook_occurred_at: Date | string | null;
  last_webhook_at: Date | string | null;
  failed_webhook_count: unknown;
  unmatched_webhook_count: unknown;
  latest_webhook_processing_status: string | null;
  webhook_attention_state: AdminEmailItemDto['webhookAttentionState'];
  correlation_id: string | null;
  metadata: IEmailMessageMetadata | null;
};

type ProviderAttemptRow = {
  id: unknown;
  provider: string;
  attempt_number: unknown;
  provider_message_id: string | null;
  provider_delivery_id: string | null;
  provider_event_id: string | null;
  provider_status: string | null;
  normalized_provider_status: string | null;
  correlation_id: string | null;
  accepted_at: Date | string | null;
  last_webhook_occurred_at: Date | string | null;
  last_webhook_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type WebhookEventRow = {
  id: unknown;
  provider: string;
  provider_event_type: string;
  normalized_event_type: string;
  verification_status: string;
  processing_status: string;
  provider_message_id: string | null;
  provider_delivery_id: string | null;
  provider_event_id: string | null;
  email_provider_message_id: unknown;
  attempt_count: unknown;
  processing_error: string | null;
  occurred_at: Date | string | null;
  received_at: Date | string;
  processed_at: Date | string | null;
};
