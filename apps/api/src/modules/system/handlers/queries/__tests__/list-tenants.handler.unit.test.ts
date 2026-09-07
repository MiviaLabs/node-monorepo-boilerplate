import { Test } from '@nestjs/testing';

import { ListTenantsQuery, TenantListStatus } from '../../../queries/list-tenants.query';
import { ListTenantsHandler } from '../list-tenants.handler';

import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('ListTenantsHandler', () => {
  let handler: ListTenantsHandler;
  let db: { execute: jest.Mock };
  let auditOutbox: { insert: jest.Mock };

  beforeEach(async () => {
    db = {
      execute: jest.fn().mockResolvedValue({
        rows: [
          {
            tenant_id: 21,
            tenant_name: 'Acme Platform',
            tenant_slug: 'acme',
            tenant_status: 'active',
            tenant_created_at: new Date('2026-03-10T10:00:00.000Z'),
            tenant_updated_at: new Date('2026-03-12T11:00:00.000Z')
          },
          {
            tenant_id: 22,
            tenant_name: 'Trial Workspace',
            tenant_slug: 'trial-workspace',
            tenant_status: 'trial',
            tenant_created_at: new Date('2026-03-11T10:00:00.000Z'),
            tenant_updated_at: new Date('2026-03-12T12:00:00.000Z')
          }
        ]
      })
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListTenantsHandler,
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<ListTenantsHandler>(ListTenantsHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns tenant rows from the real tenant inventory query', async () => {
    const result = await handler.execute(new ListTenantsQuery({ tenantId: 0 }));

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: 21,
        name: 'Acme Platform',
        slug: 'acme',
        status: 'active',
        createdAt: new Date('2026-03-10T10:00:00.000Z'),
        updatedAt: new Date('2026-03-12T11:00:00.000Z')
      },
      {
        id: 22,
        name: 'Trial Workspace',
        slug: 'trial-workspace',
        status: 'trial',
        createdAt: new Date('2026-03-11T10:00:00.000Z'),
        updatedAt: new Date('2026-03-12T12:00:00.000Z')
      }
    ]);
  });

  it('includes the requested status filter in audited metadata', async () => {
    const query = new ListTenantsQuery({
      tenantId: 0,
      actorId: 'actor-10',
      requestId: 'req-10',
      correlationId: 'corr-10',
      causationId: 'cause-10',
      status: TenantListStatus.Active
    });

    await handler.execute(query);

    expect(auditOutbox.insert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        eventType: 'system.tenants.listed.audit',
        correlationId: 'corr-10',
        causationId: 'cause-10',
        payload: expect.objectContaining({
          requestId: 'req-10',
          actorId: 'actor-10',
          details: expect.objectContaining({
            resultCount: 2,
            statusFilter: 'active'
          })
        })
      })
    );
  });
});
