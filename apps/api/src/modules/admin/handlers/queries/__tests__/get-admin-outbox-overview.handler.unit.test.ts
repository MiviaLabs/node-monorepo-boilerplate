import { Test } from '@nestjs/testing';

import { GetAdminOutboxOverviewQuery } from '../../../queries';
import { GetAdminOutboxOverviewHandler } from '../get-admin-outbox-overview.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB, EVENT_STORE_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminOutboxOverviewHandler', () => {
  let handler: GetAdminOutboxOverviewHandler;
  let mainDb: Record<string, never>;
  let eventsDb: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    mainDb = {};
    eventsDb = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              total_count: 2,
              pending_count: 1,
              processing_count: 0,
              published_count: 0,
              failed_count: 1,
              retryable_count: 1,
              dead_lettered_count: 1
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              event_id: 'evt-1',
              event_type: 'user.registered',
              aggregate_id: 'user-1',
              tenant_id: 'tenant-1',
              status: 'failed',
              retry_count: 2,
              next_retry_at: '2026-03-16T10:30:00.000Z',
              last_retry_at: '2026-03-16T10:20:00.000Z',
              published_at: null,
              dead_lettered_at: '2026-03-16T10:40:00.000Z',
              dead_letter_reason: 'max_retries',
              error_message: 'Kafka publish timeout\n    at Example (/srv/app.js:1:1)',
              payload: { userId: 'user-1' },
              correlation_id: 'corr-1',
              causation_id: 'cause-1',
              created_at: '2026-03-16T10:00:00.000Z',
              age_seconds: 1800,
              is_retryable: true,
              is_dead_lettered: true,
              total_count: 2
            },
            {
              event_id: 'evt-2',
              event_type: 'tenant.created',
              aggregate_id: 'tenant-2',
              tenant_id: 'tenant-2',
              status: 'pending',
              retry_count: 0,
              next_retry_at: null,
              last_retry_at: null,
              published_at: null,
              dead_lettered_at: null,
              dead_letter_reason: null,
              error_message: null,
              payload: { tenantId: 'tenant-2' },
              correlation_id: null,
              causation_id: null,
              created_at: '2026-03-16T09:50:00.000Z',
              age_seconds: 2400,
              is_retryable: false,
              is_dead_lettered: false,
              total_count: 2
            }
          ]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminOutboxOverviewHandler,
        { provide: MAIN_DB, useValue: mainDb },
        { provide: EVENT_STORE_DB, useValue: eventsDb },
        { provide: AuditOutboxPublisher, useValue: auditOutbox }
      ]
    }).compile();

    handler = module.get(GetAdminOutboxOverviewHandler);
  });

  it('maps paginated outbox rows, summary counts, and audit metadata', async () => {
    const result = await handler.execute(
      new GetAdminOutboxOverviewQuery({
        actorId: 'actor-outbox-2',
        requestId: 'req-outbox-2',
        correlationId: 'corr-outbox-2',
        causationId: 'cause-outbox-2',
        status: 'all',
        retryState: 'all',
        deadLetterState: 'all'
      })
    );

    expect(eventsDb.execute).toHaveBeenCalledTimes(2);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      mainDb,
      expect.objectContaining({
        eventType: 'admin.outbox.viewed.audit',
        correlationId: 'corr-outbox-2',
        causationId: 'cause-outbox-2'
      })
    );
    expect(result.summary).toEqual({
      total: 2,
      pending: 1,
      processing: 0,
      published: 0,
      failed: 1,
      retryable: 1,
      deadLettered: 1
    });
    expect(result.items[0]).toEqual({
      eventId: 'evt-1',
      eventType: 'user.registered',
      aggregateId: 'user-1',
      tenantId: 'tenant-1',
      status: 'failed',
      retryCount: 2,
      isRetryable: true,
      isDeadLettered: true,
      ageSeconds: 1800,
      createdAt: '2026-03-16T10:00:00.000Z',
      publishedAt: undefined,
      lastRetryAt: '2026-03-16T10:20:00.000Z',
      nextRetryAt: '2026-03-16T10:30:00.000Z',
      deadLetteredAt: '2026-03-16T10:40:00.000Z',
      deadLetterReason: 'max_retries',
      errorSummary: 'Kafka publish timeout',
      payloadKeys: ['userId'],
      payloadSizeBytes: 19,
      correlationId: 'corr-1',
      causationId: 'cause-1'
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false
    });
  });
});
