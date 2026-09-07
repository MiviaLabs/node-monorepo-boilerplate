import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { OutboxStatus, outbox } from '@package/db-outbox';
import { sql } from 'drizzle-orm';

import { AdminOutboxSummaryDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminOutboxSummaryQuery } from '../../queries';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB, EVENT_STORE_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminOutboxSummaryQuery)
export class GetAdminOutboxSummaryHandler implements IQueryHandler<
  GetAdminOutboxSummaryQuery,
  AdminOutboxSummaryDto
> {
  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly mainDb: NodePgDatabase,
    @Inject(EVENT_STORE_DB) private readonly eventsDb: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminOutboxSummaryQuery = new GetAdminOutboxSummaryQuery()
  ): Promise<AdminOutboxSummaryDto> {
    const result = await this.eventsDb.execute(sql`
      select
        count(*) filter (where ${outbox.status} = ${OutboxStatus.PENDING})::int as pending_events,
        count(*) filter (where ${outbox.status} = ${OutboxStatus.PROCESSING})::int as processing_events,
        count(*) filter (where ${outbox.status} = ${OutboxStatus.PUBLISHED})::int as published_events,
        count(*) filter (where ${outbox.status} = ${OutboxStatus.FAILED})::int as failed_events,
        count(*) filter (
          where ${outbox.status} = ${OutboxStatus.FAILED}
            and ${outbox.nextRetryAt} is not null
            and ${outbox.nextRetryAt} <= now()
        )::int as retryable_events,
        count(*) filter (where ${outbox.deadLetteredAt} is not null)::int as dead_letter_events,
        coalesce(
          floor(
            extract(epoch from (now() - min(${outbox.createdAt}) filter (
              where ${outbox.status} in (${OutboxStatus.PENDING}, ${OutboxStatus.PROCESSING}, ${OutboxStatus.FAILED})
            ))) / 60
          ),
          0
        )::int as oldest_pending_age_minutes,
        min(${outbox.nextRetryAt}) filter (
          where ${outbox.status} = ${OutboxStatus.FAILED}
            and ${outbox.nextRetryAt} is not null
        ) as next_retry_at
      from ${outbox}
    `);

    const row = (result.rows[0] ?? {}) as Record<string, unknown>;
    const pending = Number(row['pending_events'] ?? 0);
    const processing = Number(row['processing_events'] ?? 0);
    const published = Number(row['published_events'] ?? 0);
    const failed = Number(row['failed_events'] ?? 0);
    const retryable = Number(row['retryable_events'] ?? 0);
    const deadLettered = Number(row['dead_letter_events'] ?? 0);

    await this.auditOutbox.insert(
      this.mainDb,
      buildAdminAuditEvent({
        eventType: 'admin.outbox.summary.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin-outbox',
        action: 'VIEW_ADMIN_OUTBOX_SUMMARY',
        target: {
          entityType: 'admin'
        },
        details: {
          pending,
          processing,
          published,
          failed,
          retryable,
          deadLettered
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return {
      generatedAt: new Date().toISOString(),
      metrics: [
        { key: 'outbox_pending', label: 'Pending', value: pending, summary: 'Queued for delivery' },
        {
          key: 'outbox_processing',
          label: 'Processing',
          value: processing,
          summary: 'Currently claimed by workers'
        },
        {
          key: 'outbox_retryable',
          label: 'Retryable now',
          value: retryable,
          summary: retryable > 0 ? 'Ready for retry' : 'No immediate retries'
        },
        {
          key: 'outbox_dead_lettered',
          label: 'Dead-lettered',
          value: deadLettered,
          summary: deadLettered > 0 ? 'Needs operator review' : 'No dead-letter backlog'
        }
      ],
      deliveryStateRollup: [
        { status: 'Pending', value: pending, fill: 'hsl(var(--chart-2))' },
        { status: 'Processing', value: processing, fill: 'hsl(var(--chart-3))' },
        { status: 'Published', value: published, fill: 'hsl(var(--chart-1))' },
        { status: 'Failed', value: failed, fill: 'hsl(var(--chart-4))' }
      ],
      highlights: {
        oldestPendingAgeMinutes: Number(row['oldest_pending_age_minutes'] ?? 0),
        nextRetryAt:
          row['next_retry_at'] instanceof Date
            ? row['next_retry_at'].toISOString()
            : typeof row['next_retry_at'] === 'string'
              ? new Date(row['next_retry_at']).toISOString()
              : undefined,
        retryableNow: retryable
      }
    };
  }
}
