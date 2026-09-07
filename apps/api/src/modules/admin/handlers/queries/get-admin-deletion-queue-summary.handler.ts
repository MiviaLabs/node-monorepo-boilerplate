import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { sql, type NodePgDatabase } from '@package/db-core';

import {
  buildDeletionQueueSql,
  getDeletionRetentionConfig,
  toInt
} from './admin-deletions-report';
import { AdminDeletionQueueSummaryDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminDeletionQueueSummaryQuery } from '../../queries';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminDeletionQueueSummaryQuery)
export class GetAdminDeletionQueueSummaryHandler implements IQueryHandler<
  GetAdminDeletionQueueSummaryQuery,
  AdminDeletionQueueSummaryDto
> {
  private readonly logger = new Logger(GetAdminDeletionQueueSummaryHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    private readonly config: ConfigService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminDeletionQueueSummaryQuery = new GetAdminDeletionQueueSummaryQuery()
  ): Promise<AdminDeletionQueueSummaryDto> {
    const retention = getDeletionRetentionConfig(this.config);
    this.logger.debug(`Fetching deletion queue summary retentionDays=${retention.retentionDays}`);

    const deletionQueueSql = buildDeletionQueueSql(retention.retentionDays);
    const aggregateResult = await this.db.execute(sql`
      with deletion_queue as (${deletionQueueSql})
      select
        count(*)::int as soft_deleted_total,
        count(*) filter (where entity_type = 'user')::int as soft_deleted_users_total,
        count(*) filter (where entity_type = 'organization')::int as soft_deleted_organizations_total,
        count(*) filter (where scheduled_purge_at <= now())::int as eligible_for_purge_total,
        count(*) filter (where entity_type = 'user' and scheduled_purge_at <= now())::int as eligible_users_total,
        count(*) filter (where entity_type = 'organization' and scheduled_purge_at <= now())::int as eligible_organizations_total,
        count(*) filter (
          where scheduled_purge_at > now()
            and scheduled_purge_at <= now() + interval '7 day'
        )::int as due_within_7_days_total,
        count(*) filter (
          where deleted_at >= now() - interval '7 day'
        )::int as bucket_0_7_total,
        count(*) filter (
          where deleted_at < now() - interval '7 day'
            and deleted_at >= now() - interval '30 day'
        )::int as bucket_8_30_total,
        count(*) filter (
          where deleted_at < now() - interval '30 day'
            and deleted_at >= now() - interval '60 day'
        )::int as bucket_31_60_total,
        count(*) filter (
          where deleted_at < now() - interval '60 day'
            and deleted_at >= now() - interval '90 day'
        )::int as bucket_61_90_total,
        count(*) filter (where scheduled_purge_at <= now())::int as bucket_eligible_total,
        min(deleted_at) as oldest_deleted_at,
        min(scheduled_purge_at) filter (where scheduled_purge_at > now()) as next_purge_due_at,
        count(*) filter (
          where entity_type = 'organization'
            and provider_cleanup_planned = true
        )::int as provider_tenant_cleanup_pending_total,
        count(*) filter (
          where entity_type = 'user'
            and provider_cleanup_planned = true
        )::int as provider_user_cleanup_pending_total,
        coalesce(
          floor(extract(epoch from (now() - min(deleted_at))) / 86400),
          0
        )::int as oldest_pending_days
      from deletion_queue
    `);

    const row = (aggregateResult.rows[0] ?? {}) as Record<string, unknown>;

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.deletion.queue.summary.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin-deletion-queue-summary',
        action: 'VIEW_ADMIN_DELETION_QUEUE_SUMMARY',
        target: {
          entityType: 'admin'
        },
        details: {
          retentionDays: retention.retentionDays,
          eligibleForPurgeTotal: toInt(row['eligible_for_purge_total']),
          softDeletedUsersTotal: toInt(row['soft_deleted_users_total']),
          softDeletedOrganizationsTotal: toInt(row['soft_deleted_organizations_total'])
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return {
      generatedAt: new Date().toISOString(),
      retentionDays: retention.retentionDays,
      purgeCron: retention.purgeCron,
      purgeBatchSize: retention.purgeBatchSize,
      dryRun: retention.dryRun,
      metrics: [
        {
          key: 'soft_deleted_total',
          label: 'Waiting for deletion',
          value: toInt(row['soft_deleted_total']),
          summary: `${toInt(row['eligible_for_purge_total'])} eligible for purge now`
        },
        {
          key: 'soft_deleted_users_total',
          label: 'Soft-deleted users',
          value: toInt(row['soft_deleted_users_total']),
          summary: `${toInt(row['eligible_users_total'])} eligible`
        },
        {
          key: 'soft_deleted_organizations_total',
          label: 'Soft-deleted organizations',
          value: toInt(row['soft_deleted_organizations_total']),
          summary: `${toInt(row['eligible_organizations_total'])} eligible`
        },
        {
          key: 'due_within_7_days_total',
          label: 'Due within 7 days',
          value: toInt(row['due_within_7_days_total']),
          summary: 'Upcoming purge window'
        },
        {
          key: 'oldest_pending_days',
          label: 'Oldest pending age',
          value: toInt(row['oldest_pending_days']),
          summary: 'Days since soft delete'
        }
      ],
      ageBuckets: [
        { key: '0_7_days', label: '0-7d', value: toInt(row['bucket_0_7_total']) },
        { key: '8_30_days', label: '8-30d', value: toInt(row['bucket_8_30_total']) },
        { key: '31_60_days', label: '31-60d', value: toInt(row['bucket_31_60_total']) },
        { key: '61_90_days', label: '61-90d', value: toInt(row['bucket_61_90_total']) },
        { key: 'eligible', label: 'Eligible now', value: toInt(row['bucket_eligible_total']) }
      ],
      highlights: {
        oldestDeletedAt:
          row['oldest_deleted_at'] instanceof Date
            ? row['oldest_deleted_at'].toISOString()
            : undefined,
        nextPurgeDueAt:
          row['next_purge_due_at'] instanceof Date
            ? row['next_purge_due_at'].toISOString()
            : undefined,
        providerTenantCleanupPendingTotal: toInt(row['provider_tenant_cleanup_pending_total']),
        providerUserCleanupPendingTotal: toInt(row['provider_user_cleanup_pending_total'])
      }
    };
  }
}
