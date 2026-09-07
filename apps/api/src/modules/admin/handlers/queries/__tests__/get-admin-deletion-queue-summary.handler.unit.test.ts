import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { GetAdminDeletionQueueSummaryQuery } from '../../../queries';
import { GetAdminDeletionQueueSummaryHandler } from '../get-admin-deletion-queue-summary.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminDeletionQueueSummaryHandler', () => {
  let handler: GetAdminDeletionQueueSummaryHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            soft_deleted_total: 6,
            soft_deleted_users_total: 4,
            soft_deleted_organizations_total: 2,
            eligible_for_purge_total: 2,
            eligible_users_total: 1,
            eligible_organizations_total: 1,
            due_within_7_days_total: 2,
            bucket_0_7_total: 1,
            bucket_8_30_total: 2,
            bucket_31_60_total: 1,
            bucket_61_90_total: 1,
            bucket_eligible_total: 2,
            oldest_deleted_at: new Date('2025-12-01T10:00:00.000Z'),
            next_purge_due_at: new Date('2026-03-20T02:00:00.000Z'),
            provider_tenant_cleanup_pending_total: 2,
            provider_user_cleanup_pending_total: 3,
            oldest_pending_days: 105
          }
        ]
      })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminDeletionQueueSummaryHandler,
        {
          provide: MAIN_DB,
          useValue: db
        },
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
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        }
      ]
    }).compile();

    handler = module.get(GetAdminDeletionQueueSummaryHandler);
  });

  it('returns summary metrics, age buckets, highlights, and audit metadata', async () => {
    const result = await handler.execute(
      new GetAdminDeletionQueueSummaryQuery({
        actorId: 'actor-retention-1',
        tenantId: 0,
        requestId: 'req-retention-1',
        correlationId: 'corr-retention-1',
        causationId: 'cause-retention-1'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.deletion.queue.summary.viewed.audit',
        correlationId: 'corr-retention-1',
        causationId: 'cause-retention-1',
        payload: expect.objectContaining({
          requestId: 'req-retention-1',
          actorId: 'actor-retention-1'
        })
      })
    );
    expect(result.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'soft_deleted_total', value: 6 }),
        expect.objectContaining({ key: 'soft_deleted_users_total', value: 4 }),
        expect.objectContaining({ key: 'soft_deleted_organizations_total', value: 2 })
      ])
    );
    expect(result.ageBuckets).toEqual([
      { key: '0_7_days', label: '0-7d', value: 1 },
      { key: '8_30_days', label: '8-30d', value: 2 },
      { key: '31_60_days', label: '31-60d', value: 1 },
      { key: '61_90_days', label: '61-90d', value: 1 },
      { key: 'eligible', label: 'Eligible now', value: 2 }
    ]);
    expect(result.highlights).toEqual({
      oldestDeletedAt: '2025-12-01T10:00:00.000Z',
      nextPurgeDueAt: '2026-03-20T02:00:00.000Z',
      providerTenantCleanupPendingTotal: 2,
      providerUserCleanupPendingTotal: 3
    });
  });
});
