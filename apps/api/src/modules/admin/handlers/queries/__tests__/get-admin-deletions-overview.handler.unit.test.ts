import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { GetAdminDeletionsOverviewQuery } from '../../../queries';
import { GetAdminDeletionsOverviewHandler } from '../get-admin-deletions-overview.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('GetAdminDeletionsOverviewHandler', () => {
  let handler: GetAdminDeletionsOverviewHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              total_count: 2,
              users_total: 1,
              organizations_total: 1,
              eligible_total: 1,
              overdue_total: 1,
              due_within_7_days_total: 1,
              bucket_0_7_total: 0,
              bucket_8_30_total: 1,
              bucket_31_60_total: 0,
              bucket_61_90_total: 0,
              bucket_overdue_total: 1
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            {
              entity_type: 'user',
              entity_id: 123,
              organization_id: 10,
              tenant_id: 20,
              display_name: 'Ariana Moore',
              organization_name: 'Acme Ops',
              deleted_at: '2026-03-01T10:00:00.000Z',
              scheduled_purge_at: '2026-05-30T10:00:00.000Z',
              has_provider_identity: true,
              has_provider_tenant: true,
              provider_cleanup_planned: true,
              days_until_purge: 75,
              is_overdue: false
            },
            {
              entity_type: 'organization',
              entity_id: 456,
              organization_id: 456,
              tenant_id: 33,
              display_name: 'Northwind Labs',
              organization_name: null,
              deleted_at: new Date('2025-11-01T10:00:00.000Z'),
              scheduled_purge_at: new Date('2026-01-30T10:00:00.000Z'),
              has_provider_identity: false,
              has_provider_tenant: false,
              provider_cleanup_planned: false,
              days_until_purge: -14,
              is_overdue: true
            }
          ]
        })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAdminDeletionsOverviewHandler,
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

    handler = module.get(GetAdminDeletionsOverviewHandler);
  });

  it('maps the queue rows, summary cards, age buckets, pagination, and audit details', async () => {
    const result = await handler.execute(
      new GetAdminDeletionsOverviewQuery({
        actorId: 'actor-retention-2',
        tenantId: 0,
        requestId: 'req-retention-2',
        correlationId: 'corr-retention-2',
        causationId: 'cause-retention-2',
        entityType: 'all',
        purgeState: 'all',
        providerState: 'all'
      })
    );

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'admin.deletions.viewed.audit',
        correlationId: 'corr-retention-2',
        causationId: 'cause-retention-2',
        payload: expect.objectContaining({
          requestId: 'req-retention-2',
          actorId: 'actor-retention-2',
          details: expect.objectContaining({
            resultCount: 2,
            totalCount: 2,
            entityType: 'all'
          })
        })
      })
    );
    expect(result.summary).toEqual({
      totalPending: 2,
      pendingUsers: 1,
      pendingOrganizations: 1,
      dueWithin7Days: 1,
      overdueCount: 1,
      retentionDays: 90
    });
    expect(result.ageBuckets).toEqual([
      { key: '0_7_days', label: '0-7 days', value: 0 },
      { key: '8_30_days', label: '8-30 days', value: 1 },
      { key: '31_60_days', label: '31-60 days', value: 0 },
      { key: '61_90_days', label: '61-90 days', value: 0 },
      { key: 'overdue', label: 'Overdue', value: 1 }
    ]);
    expect(result.items).toEqual([
      {
        entityType: 'user',
        entityId: 123,
        organizationId: 10,
        displayLabel: 'Ariana Moore',
        secondaryLabel: 'Acme Ops',
        deletedAt: '2026-03-01T10:00:00.000Z',
        purgeDueAt: '2026-05-30T10:00:00.000Z',
        daysUntilPurge: 75,
        isOverdue: false,
        providerCleanupState: 'pending',
        providerContext: 'Provider user will be deleted during purge',
        detailHref: '/users/123'
      },
      {
        entityType: 'organization',
        entityId: 456,
        organizationId: 456,
        displayLabel: 'Northwind Labs',
        secondaryLabel: 'Organization record',
        deletedAt: '2025-11-01T10:00:00.000Z',
        purgeDueAt: '2026-01-30T10:00:00.000Z',
        daysUntilPurge: -14,
        isOverdue: true,
        providerCleanupState: 'not_applicable',
        providerContext: 'No provider tenant linked',
        detailHref: '/tenants/456'
      }
    ]);
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
