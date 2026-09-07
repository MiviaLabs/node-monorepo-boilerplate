import { Inject, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { sql, tenants, users, type NodePgDatabase } from '@package/db-core';

import { SystemMetricsDto } from '../../dto';
import { buildSystemAuditEvent } from '../../events';
import { GetMetricsQuery } from '../../queries/get-metrics.query';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Handler for getting system metrics
 *
 * This handler:
 * 1. Collects live process metrics (memory, uptime)
 * 2. Queries the main database for tenant/user statistics
 * 3. Returns explicit runtime defaults for request stats until an observable reader exists
 * 4. Returns comprehensive metrics
 */
@QueryHandler(GetMetricsQuery)
export class GetMetricsHandler implements IQueryHandler<GetMetricsQuery, SystemMetricsDto> {
  private readonly logger = new Logger(GetMetricsHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(_query: GetMetricsQuery): Promise<SystemMetricsDto> {
    this.logger.debug('Fetching system metrics');

    const metricsRow = await this.getAggregateCounts();

    const metrics: SystemMetricsDto = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      tenants: {
        total: metricsRow.tenantsTotal,
        active: metricsRow.tenantsActive,
        suspended: metricsRow.tenantsSuspended
      },
      users: {
        total: metricsRow.usersTotal,
        active: metricsRow.usersActive,
        inactive: metricsRow.usersInactive
      },
      requests: {
        // The repo emits HTTP metrics, but there is no queryable in-process reader yet.
        total: 0,
        perMinute: 0
      }
    };

    if (_query.emitAuditEvent) {
      await this.auditOutbox.insert(
        this.db,
        buildSystemAuditEvent({
          eventType: 'system.metrics.viewed.audit',
          tenantId: _query.tenantId,
          actorId: _query.actorId,
          requestId: _query.requestId,
          aggregateId: 'system',
          action: 'VIEW_SYSTEM_METRICS',
          target: {
            entityType: 'system'
          },
          details: {
            includesRuntimeMetrics: true,
            includesTenantCounts: true,
            includesUserCounts: true
          },
          correlationId: _query.correlationId,
          causationId: _query.causationId
        })
      );
    }

    return metrics;
  }

  private async getAggregateCounts(): Promise<{
    tenantsTotal: number;
    tenantsActive: number;
    tenantsSuspended: number;
    usersTotal: number;
    usersActive: number;
    usersInactive: number;
  }> {
    const result = await this.db.execute(sql`
      select
        (select count(*)::int from ${tenants}) as tenants_total,
        (select count(*)::int from ${tenants} where ${tenants.status} = 'active') as tenants_active,
        (select count(*)::int from ${tenants} where ${tenants.status} = 'suspended') as tenants_suspended,
        (select count(*)::int from ${users} where ${users.deletedAt} is null) as users_total,
        (select count(*)::int from ${users} where ${users.deletedAt} is null and ${users.isActive} = true) as users_active,
        (select count(*)::int from ${users} where ${users.deletedAt} is null and ${users.isActive} = false) as users_inactive
    `);

    const row = (result.rows[0] ?? {}) as Record<string, unknown>;

    return {
      tenantsTotal: this.toInt(row['tenants_total']),
      tenantsActive: this.toInt(row['tenants_active']),
      tenantsSuspended: this.toInt(row['tenants_suspended']),
      usersTotal: this.toInt(row['users_total']),
      usersActive: this.toInt(row['users_active']),
      usersInactive: this.toInt(row['users_inactive'])
    };
  }

  private toInt(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }
}
