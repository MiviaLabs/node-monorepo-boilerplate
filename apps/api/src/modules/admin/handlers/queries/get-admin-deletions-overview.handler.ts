import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { sql, type NodePgDatabase } from '@package/db-core';

import {
  buildDeletionQueueFilters,
  buildDeletionQueueOrderBy,
  buildDeletionQueueSql,
  getDeletionRetentionConfig,
  toInt
} from './admin-deletions-report';
import { AdminDeletionsOverviewDto, type AdminDeletionQueueItemDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminDeletionsOverviewQuery } from '../../queries';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminDeletionsOverviewQuery)
export class GetAdminDeletionsOverviewHandler implements IQueryHandler<
  GetAdminDeletionsOverviewQuery,
  AdminDeletionsOverviewDto
> {
  private readonly logger = new Logger(GetAdminDeletionsOverviewHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    private readonly config: ConfigService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminDeletionsOverviewQuery = new GetAdminDeletionsOverviewQuery()
  ): Promise<AdminDeletionsOverviewDto> {
    const retention = getDeletionRetentionConfig(this.config);
    this.logger.debug(
      `Fetching deletion queue page=${query.page} pageSize=${query.pageSize} entityType=${query.entityType}`
    );

    const deletionQueueSql = buildDeletionQueueSql(retention.retentionDays);
    const searchPattern = query.search ? `%${query.search.toLowerCase()}%` : undefined;
    const filters = buildDeletionQueueFilters(query, searchPattern);
    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
    const orderBy = buildDeletionQueueOrderBy(query);
    const offset = (query.page - 1) * query.pageSize;

    const [aggregateResult, pagedResult] = await Promise.all([
      this.db.execute(sql`
        with deletion_queue as (${deletionQueueSql})
        select
          count(*)::int as total_count,
          count(*) filter (where entity_type = 'user')::int as users_total,
          count(*) filter (where entity_type = 'organization')::int as organizations_total,
          count(*) filter (where scheduled_purge_at <= now())::int as eligible_total,
          count(*) filter (where scheduled_purge_at < now())::int as overdue_total,
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
          count(*) filter (where scheduled_purge_at < now())::int as bucket_overdue_total
        from deletion_queue
        ${whereClause}
      `),
      this.db.execute(sql`
        with deletion_queue as (${deletionQueueSql})
        select
          *,
          count(*) over()::int as total_count,
          floor(extract(epoch from (scheduled_purge_at - now())) / 86400)::int as days_until_purge,
          (scheduled_purge_at <= now()) as is_eligible_for_purge,
          (scheduled_purge_at < now()) as is_overdue
        from deletion_queue
        ${whereClause}
        order by ${orderBy}
        limit ${query.pageSize}
        offset ${offset}
      `)
    ]);

    const aggregate = (aggregateResult.rows[0] ?? {}) as Record<string, unknown>;
    const total = toInt(aggregate['total_count']);
    const items = (pagedResult.rows as unknown as DeletionQueueRow[]).map((row) =>
      this.mapRow(row)
    );

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.deletions.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin-deletions',
        action: 'VIEW_ADMIN_DELETIONS',
        target: {
          entityType: 'admin'
        },
        details: {
          page: query.page,
          pageSize: query.pageSize,
          resultCount: items.length,
          totalCount: total,
          searchApplied: Boolean(query.search),
          entityType: query.entityType,
          purgeState: query.purgeState,
          providerState: query.providerState,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder
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
          key: 'deletion_queue_total',
          label: 'Waiting total',
          value: total,
          summary: `${toInt(aggregate['eligible_total'])} eligible now`
        },
        {
          key: 'deletion_queue_users_total',
          label: 'Users',
          value: toInt(aggregate['users_total']),
          summary: 'Soft-deleted accounts'
        },
        {
          key: 'deletion_queue_organizations_total',
          label: 'Organizations',
          value: toInt(aggregate['organizations_total']),
          summary: 'Soft-deleted organizations'
        },
        {
          key: 'deletion_queue_due_within_7_days_total',
          label: 'Due within 7 days',
          value: toInt(aggregate['due_within_7_days_total']),
          summary: 'Upcoming purge window'
        },
        {
          key: 'deletion_queue_overdue_total',
          label: 'Overdue',
          value: toInt(aggregate['overdue_total']),
          summary: 'Past purge due date'
        }
      ],
      summary: {
        totalPending: total,
        pendingUsers: toInt(aggregate['users_total']),
        pendingOrganizations: toInt(aggregate['organizations_total']),
        dueWithin7Days: toInt(aggregate['due_within_7_days_total']),
        overdueCount: toInt(aggregate['overdue_total']),
        retentionDays: retention.retentionDays
      },
      ageBuckets: [
        { key: '0_7_days', label: '0-7 days', value: toInt(aggregate['bucket_0_7_total']) },
        { key: '8_30_days', label: '8-30 days', value: toInt(aggregate['bucket_8_30_total']) },
        { key: '31_60_days', label: '31-60 days', value: toInt(aggregate['bucket_31_60_total']) },
        { key: '61_90_days', label: '61-90 days', value: toInt(aggregate['bucket_61_90_total']) },
        { key: 'overdue', label: 'Overdue', value: toInt(aggregate['bucket_overdue_total']) }
      ],
      items,
      pagination: this.buildPagination(query.page, query.pageSize, total)
    };
  }

  private mapRow(row: DeletionQueueRow): AdminDeletionQueueItemDto {
    return {
      entityType: row.entity_type,
      entityId: toInt(row.entity_id),
      organizationId:
        row.organization_id === null || row.organization_id === undefined
          ? undefined
          : toInt(row.organization_id),
      displayLabel: row.display_name,
      secondaryLabel:
        row.entity_type === 'user' ? (row.organization_name ?? undefined) : 'Organization record',
      deletedAt: this.toIsoString(row.deleted_at),
      purgeDueAt: this.toIsoString(row.scheduled_purge_at),
      isOverdue: Boolean(row.is_overdue),
      daysUntilPurge: toInt(row.days_until_purge),
      providerCleanupState: row.provider_cleanup_planned
        ? 'pending'
        : row.has_provider_identity || row.has_provider_tenant
          ? 'unknown'
          : 'not_applicable',
      providerContext: row.provider_cleanup_planned
        ? row.entity_type === 'organization'
          ? 'Provider tenant will be deleted during purge'
          : 'Provider user will be deleted during purge'
        : row.has_provider_tenant || row.has_provider_identity
          ? 'Provider cleanup requires manual verification'
          : 'No provider tenant linked',
      detailHref:
        row.entity_type === 'user' ? `/users/${row.entity_id}` : `/tenants/${row.organization_id}`
    };
  }

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return new Date(value).toISOString();
  }

  private buildPagination(
    page: number,
    pageSize: number,
    total: number
  ): {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  } {
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1 && totalPages > 0
    };
  }
}

type DeletionQueueEntityType = AdminDeletionQueueItemDto['entityType'];

type DeletionQueueRow = {
  entity_type: DeletionQueueEntityType;
  entity_id: number;
  organization_id: number | null;
  tenant_id: number | null;
  display_name: string;
  organization_name: string | null;
  deleted_at: Date | string;
  scheduled_purge_at: Date | string;
  has_provider_identity: boolean;
  has_provider_tenant: boolean;
  provider_cleanup_planned: boolean;
  days_until_purge: number;
  is_overdue: boolean;
};
