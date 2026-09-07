import { ConfigService } from '@nestjs/config';
import { QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import { GetAdminStatisticsOverviewHandler } from '../get-admin-statistics-overview.handler';

import { MAIN_DB, EVENT_STORE_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminStatisticsOverviewHandler', () => {
  let handler: GetAdminStatisticsOverviewHandler;
  let queryBus: { execute: jest.Mock };
  let mainDb: { execute: jest.Mock };
  let eventsDb: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    queryBus = {
      execute: jest.fn().mockResolvedValue({
        timestamp: '2026-03-13T12:00:00.000Z',
        tenants: { total: 12, active: 10, suspended: 2 },
        users: { total: 140, active: 133, inactive: 7 },
        requests: { total: 0, perMinute: 0 }
      })
    };

    mainDb = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              invitations_total: 18,
              invitations_pending: 4,
              invitations_accepted: 10,
              invitations_expired: 3,
              invitations_cancelled: 1
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { label: 'Mar 07', created_count: 1, accepted_count: 0 },
            { label: 'Mar 08', created_count: 2, accepted_count: 1 },
            { label: 'Mar 09', created_count: 0, accepted_count: 0 },
            { label: 'Mar 10', created_count: 3, accepted_count: 2 },
            { label: 'Mar 11', created_count: 1, accepted_count: 1 },
            { label: 'Mar 12', created_count: 2, accepted_count: 1 },
            { label: 'Mar 13', created_count: 1, accepted_count: 2 }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              total_pending: 12,
              pending_users: 8,
              pending_organizations: 4,
              due_within_7_days: 5,
              overdue_count: 1
            }
          ]
        })
    };

    eventsDb = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              pending_events: 6,
              processing_events: 1,
              published_events: 48,
              failed_events: 5,
              retryable_events: 4,
              dead_letter_events: 2
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { label: 'Mar 07', published_count: 7, retry_count: 0, dead_letter_count: 0 },
            { label: 'Mar 08', published_count: 6, retry_count: 1, dead_letter_count: 0 },
            { label: 'Mar 09', published_count: 8, retry_count: 2, dead_letter_count: 0 },
            { label: 'Mar 10', published_count: 0, retry_count: 1, dead_letter_count: 1 },
            { label: 'Mar 11', published_count: 9, retry_count: 0, dead_letter_count: 0 },
            { label: 'Mar 12', published_count: 10, retry_count: 3, dead_letter_count: 1 },
            { label: 'Mar 13', published_count: 8, retry_count: 2, dead_letter_count: 0 }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              oldest_pending_age_minutes: 245,
              next_retry_at: '2026-03-13T12:30:00.000Z'
            }
          ]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetAdminStatisticsOverviewHandler,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: string) => {
              const values: Record<string, string> = {
                SOFT_DELETE_RETENTION_DAYS: '90',
                SOFT_DELETE_PURGE_CRON: '0 2 * * *',
                SOFT_DELETE_PURGE_BATCH_SIZE: '100',
                SOFT_DELETE_PURGE_DRY_RUN: 'false'
              };

              return values[key] ?? fallback;
            })
          }
        },
        { provide: QueryBus, useValue: queryBus },
        { provide: MAIN_DB, useValue: mainDb },
        { provide: EVENT_STORE_DB, useValue: eventsDb },
        { provide: AuditOutboxPublisher, useValue: auditOutbox }
      ]
    }).compile();

    handler = moduleRef.get(GetAdminStatisticsOverviewHandler);
  });

  it('composes live metrics, DB-backed event series, delivery-state rollups, and summary rows for the statistics page', async () => {
    const result = await handler.execute({
      tenantId: 0,
      actorId: 'actor-statistics-1',
      requestId: 'req-statistics-1',
      correlationId: 'corr-statistics-1',
      causationId: 'cause-statistics-1'
    } as never);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 0,
        actorId: 'actor-statistics-1',
        requestId: 'req-statistics-1',
        correlationId: 'corr-statistics-1',
        causationId: 'cause-statistics-1',
        emitAuditEvent: false
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'admin.statistics.viewed.audit',
        correlationId: 'corr-statistics-1',
        causationId: 'cause-statistics-1',
        payload: expect.objectContaining({
          requestId: 'req-statistics-1',
          actorId: 'actor-statistics-1'
        })
      })
    );
    expect(JSON.stringify(auditOutbox.insert.mock.calls[0]?.[1]?.payload)).not.toContain('Mar 07');
    expect(mainDb.execute).toHaveBeenCalledTimes(3);
    expect(eventsDb.execute).toHaveBeenCalledTimes(3);
    expect(result.generatedAt).toBe('2026-03-13T12:00:00.000Z');
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'tenants_total', value: 12 }),
        expect.objectContaining({ key: 'users_total', value: 140 }),
        expect.objectContaining({ key: 'invitations_pending', value: 4 }),
        expect.objectContaining({ key: 'dead_letter_events', value: 2 }),
        expect.objectContaining({ key: 'published_events', value: 48 })
      ])
    );
    expect(result.eventDeliverySeries).toHaveLength(7);
    expect(result.eventDeliverySeries[3]).toEqual({
      label: 'Mar 10',
      published: 0,
      retries: 1,
      deadLetters: 1
    });
    expect(result.volumeBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'active_tenants', value: 10 }),
        expect.objectContaining({ key: 'active_users', value: 133 }),
        expect.objectContaining({ key: 'pending_invitations', value: 4 }),
        expect.objectContaining({ key: 'retryable_events', value: 4 })
      ])
    );
    expect(result.deliveryStateRollup).toEqual([
      { status: 'Published', value: 48, fill: 'hsl(var(--chart-2))' },
      { status: 'Pending', value: 6, fill: 'hsl(var(--chart-4))' },
      { status: 'Failed', value: 5, fill: 'hsl(var(--chart-5))' },
      { status: 'Processing', value: 1, fill: 'hsl(var(--chart-1))' }
    ]);
    expect(result.summaryRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: 'Invitations',
          total: 18,
          detail: '4 pending, 10 accepted, 4 inactive'
        }),
        expect.objectContaining({
          group: 'Event delivery',
          total: 60,
          detail: '48 published, 4 retryable, 2 dead-letter, 6 pending'
        })
      ])
    );
    expect(result.deletionSummary).toEqual({
      totalPending: 12,
      pendingUsers: 8,
      pendingOrganizations: 4,
      dueWithin7Days: 5,
      overdueCount: 1,
      retentionDays: 90
    });
    expect(result.outboxSummary).toEqual({
      pending: 6,
      processing: 1,
      published: 48,
      failed: 5,
      retryable: 4,
      deadLettered: 2,
      highlights: {
        oldestPendingAgeMinutes: 245,
        nextRetryAt: '2026-03-13T12:30:00.000Z',
        retryableNow: 4
      }
    });
  });
});
