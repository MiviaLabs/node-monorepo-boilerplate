import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { DeadLetterService } from '@package/events';

import { AdminHealthOverviewDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminHealthOverviewQuery } from '../../queries';

import type { NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { DatabaseHealthIndicator } from '@/modules/health/indicators/database-health-indicator';
import { EncryptionHealthIndicator } from '@/modules/health/indicators/encryption-health-indicator';
import { OutboxHealthIndicator } from '@/modules/health/indicators/outbox-health-indicator';
import { RedisHealthIndicator } from '@/modules/health/indicators/redis-health-indicator';
import { GetMetricsQuery } from '@/modules/system/queries/get-metrics.query';

@QueryHandler(GetAdminHealthOverviewQuery)
export class GetAdminHealthOverviewHandler implements IQueryHandler<
  GetAdminHealthOverviewQuery,
  AdminHealthOverviewDto
> {
  constructor(
    private readonly databaseHealthIndicator: DatabaseHealthIndicator,
    private readonly redisHealthIndicator: RedisHealthIndicator,
    private readonly encryptionHealthIndicator: EncryptionHealthIndicator,
    private readonly outboxHealthIndicator: OutboxHealthIndicator,
    private readonly queryBus: QueryBus,
    private readonly deadLetterService: DeadLetterService,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminHealthOverviewQuery = new GetAdminHealthOverviewQuery()
  ): Promise<AdminHealthOverviewDto> {
    const metricsPromise = this.queryBus.execute(
      new GetMetricsQuery({
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        correlationId: query.correlationId,
        causationId: query.causationId,
        emitAuditEvent: false
      })
    ) as Promise<GetMetricsResult>;
    const deadLetterEventsPromise = this.deadLetterService.getDeadLetteredEvents() as Promise<
      DeadLetterEvent[]
    >;
    const [database, redis, encryption, outbox, metrics, deadLetterEvents] = await Promise.all([
      this.databaseHealthIndicator.check() as Promise<HealthDetail>,
      this.redisHealthIndicator.check() as Promise<HealthDetail>,
      this.encryptionHealthIndicator.check() as Promise<HealthDetail>,
      this.outboxHealthIndicator.check() as Promise<HealthDetail>,
      metricsPromise,
      deadLetterEventsPromise
    ]);
    const generatedAt = metrics.timestamp;

    const details: Record<string, HealthDetail> = {
      database,
      redis,
      encryption,
      outbox
    };
    const outboxDetails = details['outbox']?.details;
    const deadLetterCount = deadLetterEvents.length;

    const services = this.buildServices(details, generatedAt);
    const metricsSummary = this.buildMetrics(metrics, deadLetterCount, outboxDetails);
    const incidents = this.buildIncidents(details, deadLetterEvents, generatedAt, outboxDetails);

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.health.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin',
        action: 'VIEW_ADMIN_HEALTH',
        target: {
          entityType: 'admin'
        },
        details: {
          includesHealthIndicators: true,
          includesSystemMetricsSummary: true,
          includesDeadLetterSummary: true,
          includesOutboxStatus: true,
          serviceCount: services.length,
          incidentCount: incidents.length,
          deadLetterCount,
          outboxFailedCount: this.toInt(outboxDetails?.['failedCount'])
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return {
      generatedAt,
      overallStatus: this.getOverallStatus(services, incidents),
      metrics: metricsSummary,
      services,
      incidents
    };
  }

  private buildServices(
    details: Record<string, HealthDetail>,
    checkedAt: string
  ): AdminHealthOverviewDto['services'] {
    const serviceLabels: Record<string, string> = {
      database: 'Database',
      redis: 'Redis',
      encryption: 'Encryption',
      outbox: 'Outbox'
    };

    return Object.entries(serviceLabels).map(([key, label]) => ({
      key,
      label,
      status: this.mapIndicatorStatus(details[key]?.status),
      summary: details[key]?.message,
      checkedAt
    }));
  }

  private buildMetrics(
    metrics: GetMetricsResult,
    deadLetterCount: number,
    outboxDetails?: Record<string, unknown>
  ): AdminHealthOverviewDto['metrics'] {
    const pendingCount = this.toInt(outboxDetails?.['pendingCount']);

    return [
      {
        key: 'tenants_total',
        label: 'Tenants',
        value: metrics.tenants.total,
        summary: `${metrics.tenants.active} active`
      },
      {
        key: 'users_total',
        label: 'Users',
        value: metrics.users.total,
        summary: `${metrics.users.active} active`
      },
      {
        key: 'outbox_pending',
        label: 'Outbox pending',
        value: pendingCount,
        summary: `${this.toInt(outboxDetails?.['failedCount'])} failed events`
      },
      {
        key: 'dead_letter_total',
        label: 'Dead-letter events',
        value: deadLetterCount,
        summary: deadLetterCount > 0 ? 'Needs review' : 'Clear'
      }
    ];
  }

  private buildIncidents(
    details: Record<string, HealthDetail>,
    deadLetterEvents: DeadLetterEvent[],
    generatedAt: string,
    outboxDetails?: Record<string, unknown>
  ): AdminHealthOverviewDto['incidents'] {
    const incidents: AdminHealthOverviewDto['incidents'] = [];
    const outboxFailures = this.toInt(outboxDetails?.['failedCount']);
    const outboxPending = this.toInt(outboxDetails?.['pendingCount']);

    if (outboxFailures > 0) {
      incidents.push({
        id: 'outbox-failures',
        kind: 'outbox_failures',
        priority: 'high',
        summary: `${outboxFailures} outbox event failures require operator review`,
        state: 'open',
        occurredAt: generatedAt
      });
    } else if (outboxPending > 0) {
      incidents.push({
        id: 'outbox-backlog',
        kind: 'outbox_backlog',
        priority: 'medium',
        summary: `${outboxPending} outbox events are still pending delivery`,
        state: 'monitoring',
        occurredAt: generatedAt
      });
    }

    if (deadLetterEvents.length > 0) {
      const latestDeadLetter =
        deadLetterEvents[deadLetterEvents.length - 1]?.deadLetteredAt?.toISOString() ?? generatedAt;
      incidents.push({
        id: 'dead-letter-open',
        kind: 'dead_letter_events',
        priority: 'high',
        summary: `${deadLetterEvents.length} dead-letter event${deadLetterEvents.length === 1 ? '' : 's'} require replay review`,
        state: 'open',
        occurredAt: latestDeadLetter
      });
    }

    for (const [key, detail] of Object.entries(details)) {
      const status = this.mapIndicatorStatus(detail?.status);
      if (status !== 'error') {
        continue;
      }

      incidents.push({
        id: `${key}-down`,
        kind: 'dependency_health',
        priority: 'high',
        summary: `${this.toTitleCase(key)} health check failed${detail?.message ? `: ${detail.message}` : ''}`,
        state: 'open',
        occurredAt: generatedAt
      });
    }

    return incidents;
  }

  private getOverallStatus(
    services: AdminHealthOverviewDto['services'],
    incidents: AdminHealthOverviewDto['incidents']
  ): AdminHealthOverviewDto['overallStatus'] {
    if (services.some((service) => service.status === 'error')) {
      return 'error';
    }

    if (
      incidents.length > 0 ||
      services.some((service) => service.status === 'degraded' || service.status === 'unknown')
    ) {
      return 'degraded';
    }

    return 'ok';
  }

  private mapIndicatorStatus(status?: string): AdminHealthOverviewDto['overallStatus'] {
    if (status === 'up') return 'ok';
    if (status === 'degraded') return 'degraded';
    if (status === 'down') return 'error';
    return 'unknown';
  }

  private toInt(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  private toTitleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

interface HealthDetail {
  status?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface GetMetricsResult {
  timestamp: string;
  tenants: { total: number; active: number; suspended: number };
  users: { total: number; active: number; inactive: number };
  requests: { total: number; perMinute: number };
}

interface DeadLetterEvent {
  eventId: string;
  eventType?: string;
  deadLetteredAt?: Date;
}
