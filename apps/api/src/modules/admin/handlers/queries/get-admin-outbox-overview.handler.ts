import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { outbox } from '@package/db-outbox';
import { sql } from 'drizzle-orm';

import { buildOutboxFilters, buildOutboxOrderBy, toInt } from './admin-outbox-report';
import { AdminOutboxOverviewDto, type AdminOutboxItemDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminOutboxOverviewQuery } from '../../queries';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB, EVENT_STORE_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminOutboxOverviewQuery)
export class GetAdminOutboxOverviewHandler implements IQueryHandler<
  GetAdminOutboxOverviewQuery,
  AdminOutboxOverviewDto
> {
  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly mainDb: NodePgDatabase,
    @Inject(EVENT_STORE_DB) private readonly eventsDb: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminOutboxOverviewQuery = new GetAdminOutboxOverviewQuery()
  ): Promise<AdminOutboxOverviewDto> {
    const searchPattern = query.search ? `%${query.search.toLowerCase()}%` : undefined;
    const filters = buildOutboxFilters(query, searchPattern);
    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
    const orderBy = buildOutboxOrderBy(query);
    const offset = (query.page - 1) * query.pageSize;

    const [aggregateResult, pagedResult] = await Promise.all([
      this.eventsDb.execute(sql`
        select
          count(*)::int as total_count,
          count(*) filter (where ${outbox.status} = 'pending')::int as pending_count,
          count(*) filter (where ${outbox.status} = 'processing')::int as processing_count,
          count(*) filter (where ${outbox.status} = 'published')::int as published_count,
          count(*) filter (where ${outbox.status} = 'failed')::int as failed_count,
          count(*) filter (
            where ${outbox.status} = 'failed'
              and ${outbox.nextRetryAt} is not null
              and ${outbox.nextRetryAt} <= now()
          )::int as retryable_count,
          count(*) filter (where ${outbox.deadLetteredAt} is not null)::int as dead_lettered_count
        from ${outbox}
        ${whereClause}
      `),
      this.eventsDb.execute(sql`
        select
          ${outbox.eventId}::text as event_id,
          ${outbox.eventType} as event_type,
          ${outbox.aggregateId} as aggregate_id,
          ${outbox.tenantId} as tenant_id,
          ${outbox.status}::text as status,
          ${outbox.retryCount} as retry_count,
          ${outbox.nextRetryAt} as next_retry_at,
          ${outbox.lastRetryAt} as last_retry_at,
          ${outbox.publishedAt} as published_at,
          ${outbox.deadLetteredAt} as dead_lettered_at,
          ${outbox.deadLetterReason} as dead_letter_reason,
          ${outbox.errorMessage} as error_message,
          ${outbox.payload} as payload,
          ${outbox.correlationId}::text as correlation_id,
          ${outbox.causationId}::text as causation_id,
          ${outbox.createdAt} as created_at,
          floor(extract(epoch from (now() - ${outbox.createdAt})))::int as age_seconds,
          (${outbox.status} = 'failed' and ${outbox.nextRetryAt} is not null and ${outbox.nextRetryAt} <= now()) as is_retryable,
          (${outbox.deadLetteredAt} is not null) as is_dead_lettered,
          count(*) over()::int as total_count
        from ${outbox}
        ${whereClause}
        order by ${orderBy}
        limit ${query.pageSize}
        offset ${offset}
      `)
    ]);

    const aggregate = (aggregateResult.rows[0] ?? {}) as Record<string, unknown>;
    const total = toInt(aggregate['total_count']);
    const items = (pagedResult.rows as unknown as OutboxOverviewRow[]).map((row) =>
      this.mapRow(row)
    );

    await this.auditOutbox.insert(
      this.mainDb,
      buildAdminAuditEvent({
        eventType: 'admin.outbox.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin-outbox',
        action: 'VIEW_ADMIN_OUTBOX',
        target: {
          entityType: 'admin'
        },
        details: {
          page: query.page,
          pageSize: query.pageSize,
          resultCount: items.length,
          totalCount: total,
          searchApplied: Boolean(query.search),
          status: query.status,
          deadLetterState: query.deadLetterState,
          retryState: query.retryState,
          eventTypeFilterApplied: Boolean(query.eventType),
          aggregateIdFilterApplied: Boolean(query.aggregateId),
          tenantIdFilterApplied: Boolean(query.requestedTenantId),
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
          key: 'outbox_pending_total',
          label: 'Pending',
          value: toInt(aggregate['pending_count']),
          summary: 'Queued for delivery'
        },
        {
          key: 'outbox_processing_total',
          label: 'Processing',
          value: toInt(aggregate['processing_count']),
          summary: 'Claimed by workers'
        },
        {
          key: 'outbox_retryable_total',
          label: 'Retryable',
          value: toInt(aggregate['retryable_count']),
          summary: 'Ready for retry now'
        },
        {
          key: 'outbox_dead_lettered_total',
          label: 'Dead-lettered',
          value: toInt(aggregate['dead_lettered_count']),
          summary: 'Failed permanently'
        }
      ],
      summary: {
        total,
        pending: toInt(aggregate['pending_count']),
        processing: toInt(aggregate['processing_count']),
        published: toInt(aggregate['published_count']),
        failed: toInt(aggregate['failed_count']),
        retryable: toInt(aggregate['retryable_count']),
        deadLettered: toInt(aggregate['dead_lettered_count'])
      },
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

  private mapRow(row: OutboxOverviewRow): AdminOutboxItemDto {
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      aggregateId: row.aggregate_id,
      tenantId: row.tenant_id,
      status: row.status,
      retryCount: toInt(row.retry_count),
      isRetryable: Boolean(row.is_retryable),
      isDeadLettered: Boolean(row.is_dead_lettered),
      ageSeconds: toInt(row.age_seconds),
      createdAt: this.toIsoString(row.created_at),
      publishedAt: this.toOptionalIsoString(row.published_at),
      lastRetryAt: this.toOptionalIsoString(row.last_retry_at),
      nextRetryAt: this.toOptionalIsoString(row.next_retry_at),
      deadLetteredAt: this.toOptionalIsoString(row.dead_lettered_at),
      deadLetterReason: row.dead_letter_reason ?? undefined,
      errorSummary: this.toOptionalSanitizedError(row.error_message),
      payloadKeys: this.toPayloadKeys(row.payload),
      payloadSizeBytes: this.toPayloadSizeBytes(row.payload),
      correlationId: row.correlation_id ?? undefined,
      causationId: row.causation_id ?? undefined
    };
  }

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }

  private toOptionalIsoString(value: Date | string | null): string | undefined {
    if (value === null) {
      return undefined;
    }

    return this.toIsoString(value);
  }

  private toOptionalSanitizedError(value: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const withoutStackFrames = value.replace(
      /at [^(]+\(.*:[0-9]+:[0-9]+\)/g,
      'at [stack frame removed]'
    );
    const firstLine = withoutStackFrames.split('\n')[0]?.trim() ?? '';

    if (firstLine.length === 0) {
      return undefined;
    }

    return firstLine.length > 240 ? `${firstLine.slice(0, 240)}... (truncated)` : firstLine;
  }

  private toPayloadKeys(value: Record<string, unknown> | null): string[] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const keys = Object.keys(value).slice(0, 20);
    return keys.length > 0 ? keys : undefined;
  }

  private toPayloadSizeBytes(value: Record<string, unknown> | null): number | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  }
}

type OutboxOverviewRow = {
  event_id: string;
  event_type: string;
  aggregate_id: string;
  tenant_id: string;
  status: AdminOutboxItemDto['status'];
  retry_count: unknown;
  next_retry_at: Date | string | null;
  last_retry_at: Date | string | null;
  published_at: Date | string | null;
  dead_lettered_at: Date | string | null;
  dead_letter_reason: string | null;
  error_message: string | null;
  payload: Record<string, unknown> | null;
  correlation_id: string | null;
  causation_id: string | null;
  created_at: Date | string;
  age_seconds: unknown;
  is_retryable: unknown;
  is_dead_lettered: unknown;
};
