import { Test } from '@nestjs/testing';

import { GetAdminOutboxSummaryQuery } from '../../../queries';
import { GetAdminOutboxSummaryHandler } from '../get-admin-outbox-summary.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB, EVENT_STORE_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminOutboxSummaryHandler', () => {
  let handler: GetAdminOutboxSummaryHandler;
  let mainDb: Record<string, never>;
  let eventsDb: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    mainDb = {};
    eventsDb = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            pending_events: 7,
            processing_events: 2,
            published_events: 34,
            failed_events: 5,
            retryable_events: 3,
            dead_letter_events: 1,
            oldest_pending_age_minutes: 185,
            next_retry_at: '2026-03-16T10:15:00.000Z'
          }
        ]
      })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminOutboxSummaryHandler,
        { provide: MAIN_DB, useValue: mainDb },
        { provide: EVENT_STORE_DB, useValue: eventsDb },
        { provide: AuditOutboxPublisher, useValue: auditOutbox }
      ]
    }).compile();

    handler = module.get(GetAdminOutboxSummaryHandler);
  });

  it('returns outbox summary metrics and audit metadata', async () => {
    const result = await handler.execute(
      new GetAdminOutboxSummaryQuery({
        actorId: 'actor-outbox-1',
        requestId: 'req-outbox-1',
        correlationId: 'corr-outbox-1',
        causationId: 'cause-outbox-1'
      })
    );

    expect(eventsDb.execute).toHaveBeenCalledTimes(1);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      mainDb,
      expect.objectContaining({
        eventType: 'admin.outbox.summary.viewed.audit',
        correlationId: 'corr-outbox-1',
        causationId: 'cause-outbox-1'
      })
    );
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'outbox_pending', value: 7 }),
        expect.objectContaining({ key: 'outbox_processing', value: 2 }),
        expect.objectContaining({ key: 'outbox_retryable', value: 3 }),
        expect.objectContaining({ key: 'outbox_dead_lettered', value: 1 })
      ])
    );
    expect(result.highlights).toEqual({
      oldestPendingAgeMinutes: 185,
      nextRetryAt: '2026-03-16T10:15:00.000Z',
      retryableNow: 3
    });
  });
});
