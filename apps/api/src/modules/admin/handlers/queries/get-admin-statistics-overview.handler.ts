import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { OutboxStatus, outbox } from '@package/db-outbox';
import { sql, invitations, type NodePgDatabase as MainNodePgDatabase } from '@package/db-core';
import { sql as drizzleSql } from 'drizzle-orm';

import { buildDeletionQueueSql, getDeletionRetentionConfig } from './admin-deletions-report';
import { AdminStatisticsOverviewDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminStatisticsOverviewQuery } from '../../queries';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB, EVENT_STORE_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { GetMetricsQuery } from '@/modules/system/queries/get-metrics.query';

@QueryHandler(GetAdminStatisticsOverviewQuery)
export class GetAdminStatisticsOverviewHandler implements IQueryHandler<
  GetAdminStatisticsOverviewQuery,
  AdminStatisticsOverviewDto
> {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly auditOutbox: AuditOutboxPublisher,
    private readonly config: ConfigService,
    @Inject(MAIN_DB) private readonly mainDb: MainNodePgDatabase,
    @Inject(EVENT_STORE_DB) private readonly eventsDb: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminStatisticsOverviewQuery = new GetAdminStatisticsOverviewQuery()
  ): Promise<AdminStatisticsOverviewDto> {
    const deletionRetention = getDeletionRetentionConfig(this.config);
    const metricsPromise = this.queryBus.execute(
      new GetMetricsQuery({
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        correlationId: query.correlationId,
        causationId: query.causationId,
        emitAuditEvent: false
      })
    ) as Promise<SystemMetricsResult>;
    const invitationAggregatePromise = this.mainDb.execute(sql`
      select
        count(*)::int as invitations_total,
        count(*) filter (where ${invitations.status} = 'pending')::int as invitations_pending,
        count(*) filter (where ${invitations.status} = 'accepted')::int as invitations_accepted,
        count(*) filter (where ${invitations.status} = 'expired')::int as invitations_expired,
        count(*) filter (where ${invitations.status} = 'cancelled')::int as invitations_cancelled
      from ${invitations}
    `);
    const invitationSeriesPromise = this.mainDb.execute(sql`
      with days as (
        select generate_series(current_date - interval '6 days', current_date, interval '1 day')::date as day
      ),
      created_counts as (
        select ${invitations.createdAt}::date as day, count(*)::int as created_count
        from ${invitations}
        where ${invitations.createdAt} >= current_date - interval '6 days'
        group by ${invitations.createdAt}::date
      ),
      accepted_counts as (
        select ${invitations.acceptedAt}::date as day, count(*)::int as accepted_count
        from ${invitations}
        where ${invitations.acceptedAt} is not null
          and ${invitations.acceptedAt} >= current_date - interval '6 days'
        group by ${invitations.acceptedAt}::date
      )
      select
        to_char(days.day, 'Mon DD') as label,
        coalesce(created_counts.created_count, 0)::int as created_count,
        coalesce(accepted_counts.accepted_count, 0)::int as accepted_count
      from days
      left join created_counts on created_counts.day = days.day
      left join accepted_counts on accepted_counts.day = days.day
      order by days.day asc
    `);
    const outboxAggregatePromise = this.eventsDb.execute(sql`
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
        count(*) filter (where ${outbox.deadLetteredAt} is not null)::int as dead_letter_events
      from ${outbox}
    `);
    const outboxSeriesPromise = this.eventsDb.execute(sql`
      with days as (
        select generate_series(current_date - interval '6 days', current_date, interval '1 day')::date as day
      ),
      published_counts as (
        select ${outbox.publishedAt}::date as day, count(*)::int as published_count
        from ${outbox}
        where ${outbox.publishedAt} is not null
          and ${outbox.publishedAt} >= current_date - interval '6 days'
        group by ${outbox.publishedAt}::date
      ),
      retry_counts as (
        select ${outbox.lastRetryAt}::date as day, count(*)::int as retry_count
        from ${outbox}
        where ${outbox.lastRetryAt} is not null
          and ${outbox.lastRetryAt} >= current_date - interval '6 days'
        group by ${outbox.lastRetryAt}::date
      ),
      dead_letter_counts as (
        select ${outbox.deadLetteredAt}::date as day, count(*)::int as dead_letter_count
        from ${outbox}
        where ${outbox.deadLetteredAt} is not null
          and ${outbox.deadLetteredAt} >= current_date - interval '6 days'
        group by ${outbox.deadLetteredAt}::date
      )
      select
        to_char(days.day, 'Mon DD') as label,
        coalesce(published_counts.published_count, 0)::int as published_count,
        coalesce(retry_counts.retry_count, 0)::int as retry_count,
        coalesce(dead_letter_counts.dead_letter_count, 0)::int as dead_letter_count
      from days
      left join published_counts on published_counts.day = days.day
      left join retry_counts on retry_counts.day = days.day
      left join dead_letter_counts on dead_letter_counts.day = days.day
      order by days.day asc
    `);
    const deletionSummaryPromise = this.mainDb.execute(sql`
      with deletion_queue as (${buildDeletionQueueSql(deletionRetention.retentionDays)})
      select
        count(*)::int as total_pending,
        count(*) filter (where entity_type = 'user')::int as pending_users,
        count(*) filter (where entity_type = 'organization')::int as pending_organizations,
        count(*) filter (
          where scheduled_purge_at > now()
            and scheduled_purge_at <= now() + interval '7 day'
        )::int as due_within_7_days,
        count(*) filter (where scheduled_purge_at < now())::int as overdue_count
      from deletion_queue
    `);
    const outboxHighlightsPromise = this.eventsDb.execute(drizzleSql`
      select
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

    const [
      systemMetrics,
      invitationAggregateResult,
      invitationSeriesResult,
      outboxAggregateResult,
      outboxSeriesResult,
      deletionSummaryResult,
      outboxHighlightsResult
    ] = await Promise.all([
      metricsPromise,
      invitationAggregatePromise,
      invitationSeriesPromise,
      outboxAggregatePromise,
      outboxSeriesPromise,
      deletionSummaryPromise,
      outboxHighlightsPromise
    ]);

    const invitationAggregate = (invitationAggregateResult.rows[0] ?? {}) as Record<
      string,
      unknown
    >;
    const outboxAggregate = (outboxAggregateResult.rows[0] ?? {}) as Record<string, unknown>;
    const deletionSummary = (deletionSummaryResult.rows[0] ?? {}) as Record<string, unknown>;
    const outboxHighlights = (outboxHighlightsResult.rows[0] ?? {}) as Record<string, unknown>;
    const invitationSeriesRows = invitationSeriesResult.rows as unknown as StatisticsSeriesRow[];
    const outboxSeriesRows = outboxSeriesResult.rows as unknown as StatisticsSeriesRow[];
    const generatedAt = systemMetrics.timestamp;
    const invitationsPending = this.toInt(invitationAggregate['invitations_pending']);
    const deadLetterEvents = this.toInt(outboxAggregate['dead_letter_events']);
    const retryableEvents = this.toInt(outboxAggregate['retryable_events']);
    const publishedEvents = this.toInt(outboxAggregate['published_events']);
    const totalOutboxEvents =
      this.toInt(outboxAggregate['pending_events']) +
      this.toInt(outboxAggregate['processing_events']) +
      publishedEvents +
      this.toInt(outboxAggregate['failed_events']);

    await this.auditOutbox.insert(
      this.mainDb,
      buildAdminAuditEvent({
        eventType: 'admin.statistics.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin',
        action: 'VIEW_ADMIN_STATISTICS',
        target: {
          entityType: 'admin'
        },
        details: {
          includesTenantCounts: true,
          includesUserCounts: true,
          includesInvitationAggregates: true,
          includesOutboxAggregates: true,
          eventDeliverySeriesPoints: outboxSeriesRows.length,
          invitationSeriesPoints: invitationSeriesRows.length,
          pendingInvitationCount: invitationsPending,
          deadLetterEventCount: deadLetterEvents,
          retryableEventCount: retryableEvents
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return {
      generatedAt,
      metrics: [
        {
          key: 'tenants_total',
          label: 'Tenants',
          value: systemMetrics.tenants.total,
          summary: `${systemMetrics.tenants.active} active tenants`
        },
        {
          key: 'users_total',
          label: 'Users',
          value: systemMetrics.users.total,
          summary: `${systemMetrics.users.active} active users`
        },
        {
          key: 'invitations_pending',
          label: 'Pending invitations',
          value: invitationsPending,
          summary: invitationsPending > 0 ? 'Awaiting acceptance' : 'No pending invitations'
        },
        {
          key: 'dead_letter_events',
          label: 'Dead-letter events',
          value: deadLetterEvents,
          summary: deadLetterEvents > 0 ? 'Require replay review' : 'No dead-letter backlog'
        },
        {
          key: 'published_events',
          label: 'Published events',
          value: publishedEvents,
          summary:
            publishedEvents > 0 ? 'Persisted successful deliveries' : 'No published deliveries yet'
        }
      ],
      eventDeliverySeries: outboxSeriesRows.map((row) => ({
        label: row.label,
        published: this.toInt(row.published_count),
        retries: this.toInt(row.retry_count),
        deadLetters: this.toInt(row.dead_letter_count)
      })),
      volumeBreakdown: [
        {
          key: 'active_tenants',
          label: 'Active tenants',
          value: systemMetrics.tenants.active
        },
        {
          key: 'suspended_tenants',
          label: 'Suspended tenants',
          value: systemMetrics.tenants.suspended
        },
        {
          key: 'active_users',
          label: 'Active users',
          value: systemMetrics.users.active
        },
        {
          key: 'inactive_users',
          label: 'Inactive users',
          value: systemMetrics.users.inactive
        },
        {
          key: 'pending_invitations',
          label: 'Pending invitations',
          value: invitationsPending
        },
        {
          key: 'retryable_events',
          label: 'Retryable events',
          value: retryableEvents
        }
      ],
      deliveryStateRollup: [
        {
          status: 'Published',
          value: this.toInt(outboxAggregate['published_events']),
          fill: 'hsl(var(--chart-2))'
        },
        {
          status: 'Pending',
          value: this.toInt(outboxAggregate['pending_events']),
          fill: 'hsl(var(--chart-4))'
        },
        {
          status: 'Failed',
          value: this.toInt(outboxAggregate['failed_events']),
          fill: 'hsl(var(--chart-5))'
        },
        {
          status: 'Processing',
          value: this.toInt(outboxAggregate['processing_events']),
          fill: 'hsl(var(--chart-1))'
        }
      ].filter((item) => item.value > 0),
      summaryRows: [
        {
          group: 'Tenants',
          total: systemMetrics.tenants.total,
          detail: `${systemMetrics.tenants.active} active, ${systemMetrics.tenants.suspended} suspended`,
          source: 'Main DB tenants table'
        },
        {
          group: 'Users',
          total: systemMetrics.users.total,
          detail: `${systemMetrics.users.active} active, ${systemMetrics.users.inactive} inactive`,
          source: 'Main DB users table'
        },
        {
          group: 'Invitations',
          total: this.toInt(invitationAggregate['invitations_total']),
          detail: `${invitationsPending} pending, ${this.toInt(invitationAggregate['invitations_accepted'])} accepted, ${this.toInt(invitationAggregate['invitations_expired']) + this.toInt(invitationAggregate['invitations_cancelled'])} inactive`,
          source: 'Main DB invitations table'
        },
        {
          group: 'Event delivery',
          total: totalOutboxEvents,
          detail: `${publishedEvents} published, ${retryableEvents} retryable, ${deadLetterEvents} dead-letter, ${this.toInt(
            outboxAggregate['pending_events']
          )} pending`,
          source: 'Events DB outbox table'
        },
        {
          group: 'Invitation activity',
          total: invitationSeriesRows.reduce((sum, row) => sum + this.toInt(row.created_count), 0),
          detail: `${invitationSeriesRows.reduce((sum, row) => sum + this.toInt(row.accepted_count), 0)} accepted over the same window`,
          source: 'Main DB invitations.created_at and invitations.accepted_at'
        }
      ],
      deletionSummary: {
        totalPending: this.toInt(deletionSummary['total_pending']),
        pendingUsers: this.toInt(deletionSummary['pending_users']),
        pendingOrganizations: this.toInt(deletionSummary['pending_organizations']),
        dueWithin7Days: this.toInt(deletionSummary['due_within_7_days']),
        overdueCount: this.toInt(deletionSummary['overdue_count']),
        retentionDays: deletionRetention.retentionDays
      },
      outboxSummary: {
        pending: this.toInt(outboxAggregate['pending_events']),
        processing: this.toInt(outboxAggregate['processing_events']),
        published: publishedEvents,
        failed: this.toInt(outboxAggregate['failed_events']),
        retryable: retryableEvents,
        deadLettered: deadLetterEvents,
        highlights: {
          oldestPendingAgeMinutes: this.toInt(outboxHighlights['oldest_pending_age_minutes']),
          nextRetryAt:
            outboxHighlights['next_retry_at'] instanceof Date
              ? outboxHighlights['next_retry_at'].toISOString()
              : typeof outboxHighlights['next_retry_at'] === 'string'
                ? new Date(outboxHighlights['next_retry_at']).toISOString()
                : undefined,
          retryableNow: retryableEvents
        }
      }
    };
  }

  private toInt(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }
}

interface SystemMetricsResult {
  timestamp: string;
  tenants: { total: number; active: number; suspended: number };
  users: { total: number; active: number; inactive: number };
}

interface StatisticsSeriesRow {
  label: string;
  created_count?: number;
  accepted_count?: number;
  published_count?: number;
  retry_count?: number;
  dead_letter_count?: number;
}
