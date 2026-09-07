import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { sql } from 'drizzle-orm';

import {
  buildAdminEmailFilters,
  buildAdminEmailInventorySql,
  buildAdminEmailOrderBy
} from './admin-emails-report';
import { AdminEmailsOverviewDto, type AdminEmailItemDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminEmailsOverviewQuery } from '../../queries';

import type { IEmailMessageMetadata } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminEmailsOverviewQuery)
export class GetAdminEmailsOverviewHandler implements IQueryHandler<
  GetAdminEmailsOverviewQuery,
  AdminEmailsOverviewDto
> {
  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminEmailsOverviewQuery = new GetAdminEmailsOverviewQuery()
  ): Promise<AdminEmailsOverviewDto> {
    const searchPattern = query.search ? `%${query.search.toLowerCase()}%` : undefined;
    const inventorySql = buildAdminEmailInventorySql();
    const filters = buildAdminEmailFilters(query, searchPattern);
    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
    const orderBy = buildAdminEmailOrderBy(query);
    const offset = (query.page - 1) * query.pageSize;

    const [aggregateResult, pagedResult] = await Promise.all([
      this.db.execute(sql`
        with email_inventory as (${inventorySql})
        select
          count(*)::int as total_count,
          count(*) filter (where email_inventory.message_status = 'pending')::int as pending_count,
          count(*) filter (where email_inventory.message_status = 'accepted')::int as accepted_count,
          count(*) filter (where email_inventory.message_status = 'delivered')::int as delivered_count,
          count(*) filter (
            where email_inventory.message_status in ('failed', 'bounced', 'complained')
          )::int as failed_delivery_count,
          count(*) filter (
            where email_inventory.webhook_attention_state = 'attention'
          )::int as webhook_attention_count
        from email_inventory
        ${whereClause}
      `),
      this.db.execute(sql`
        with email_inventory as (${inventorySql})
        select
          email_inventory.*,
          count(*) over()::int as total_count
        from email_inventory
        ${whereClause}
        order by ${orderBy}
        limit ${query.pageSize}
        offset ${offset}
      `)
    ]);

    const aggregate = (aggregateResult.rows[0] ?? {}) as Record<string, unknown>;
    const total = this.toInt(aggregate['total_count']);
    const summary = {
      total,
      pending: this.toInt(aggregate['pending_count']),
      accepted: this.toInt(aggregate['accepted_count']),
      delivered: this.toInt(aggregate['delivered_count']),
      failedOrBouncedOrComplained: this.toInt(aggregate['failed_delivery_count']),
      webhookAttention: this.toInt(aggregate['webhook_attention_count'])
    };
    const items = pagedResult.rows.map((row) => this.mapRow(row as EmailInventoryRow));

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.emails.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin',
        action: 'VIEW_ADMIN_EMAILS',
        target: { entityType: 'admin' },
        details: {
          page: query.page,
          pageSize: query.pageSize,
          resultCount: items.length,
          totalCount: total,
          searchApplied: Boolean(query.search),
          organizationIdFilterApplied: query.organizationId !== undefined,
          messageStatus: query.messageStatus,
          providerFilterApplied: Boolean(query.provider),
          providerStatusFilterApplied: Boolean(query.providerStatus),
          normalizedProviderStatusFilterApplied: Boolean(query.normalizedProviderStatus),
          referenceTypeFilterApplied: Boolean(query.referenceType),
          referenceIdFilterApplied: Boolean(query.referenceId),
          webhookAttentionState: query.webhookAttentionState,
          dateFromApplied: Boolean(query.dateFrom),
          dateToApplied: Boolean(query.dateTo),
          sortBy: query.sortBy,
          sortOrder: query.sortOrder
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return {
      generatedAt: new Date().toISOString(),
      metrics: [
        {
          key: 'emails_total',
          label: 'Tracked emails',
          value: summary.total,
          summary: `${summary.delivered} delivered`
        },
        {
          key: 'emails_pending',
          label: 'Pending',
          value: summary.pending,
          summary: 'Waiting for provider or webhook progress'
        },
        {
          key: 'emails_accepted',
          label: 'Accepted',
          value: summary.accepted,
          summary: 'Accepted by the provider'
        },
        {
          key: 'emails_failed_delivery',
          label: 'Failed delivery',
          value: summary.failedOrBouncedOrComplained,
          summary: 'Failed, bounced, or complained'
        },
        {
          key: 'emails_webhook_attention',
          label: 'Webhook attention',
          value: summary.webhookAttention,
          summary:
            summary.webhookAttention > 0
              ? 'Has failed or unmatched webhook events'
              : 'No webhook attention needed'
        }
      ],
      summary,
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
        hasNext: query.page * query.pageSize < total,
        hasPrevious: query.page > 1
      }
    };
  }

  private mapRow(row: EmailInventoryRow): AdminEmailItemDto {
    return {
      emailMessageId: this.toInt(row.email_message_id),
      publicId: row.public_id,
      organizationId: this.toInt(row.organization_id),
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
      failedWebhookCount: this.toInt(row.failed_webhook_count),
      unmatchedWebhookCount: this.toInt(row.unmatched_webhook_count),
      latestWebhookProcessingStatus: row.latest_webhook_processing_status ?? undefined,
      webhookAttentionState: row.webhook_attention_state,
      correlationId: row.correlation_id ?? undefined,
      safeMetadataSummary: this.toMetadataSummary(row.metadata)
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

  private toInt(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private toOptionalInt(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    return this.toInt(value);
  }

  private toOptionalIsoString(value: Date | string | null): string | undefined {
    if (value === null) {
      return undefined;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string') {
      return new Date(value).toISOString();
    }

    return undefined;
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
