import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { sql } from 'drizzle-orm';

import {
  buildAdminEmailFilters,
  buildAdminEmailInventorySql
} from './admin-emails-report';
import { AdminEmailSummaryDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminEmailSummaryQuery } from '../../queries';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminEmailSummaryQuery)
export class GetAdminEmailSummaryHandler implements IQueryHandler<
  GetAdminEmailSummaryQuery,
  AdminEmailSummaryDto
> {
  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminEmailSummaryQuery = new GetAdminEmailSummaryQuery()
  ): Promise<AdminEmailSummaryDto> {
    const searchPattern = query.search ? `%${query.search.toLowerCase()}%` : undefined;
    const inventorySql = buildAdminEmailInventorySql();
    const filters = buildAdminEmailFilters(query, searchPattern);
    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;

    const result = await this.db.execute(sql`
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
    `);

    const row = (result.rows[0] ?? {}) as Record<string, unknown>;
    const summary = {
      total: this.toInt(row['total_count']),
      pending: this.toInt(row['pending_count']),
      accepted: this.toInt(row['accepted_count']),
      delivered: this.toInt(row['delivered_count']),
      failedOrBouncedOrComplained: this.toInt(row['failed_delivery_count']),
      webhookAttention: this.toInt(row['webhook_attention_count'])
    };

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.emails.summary.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin',
        action: 'VIEW_ADMIN_EMAIL_SUMMARY',
        target: { entityType: 'admin' },
        details: {
          totalCount: summary.total,
          pendingCount: summary.pending,
          webhookAttentionCount: summary.webhookAttention,
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
          dateToApplied: Boolean(query.dateTo)
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
      summary
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
}
