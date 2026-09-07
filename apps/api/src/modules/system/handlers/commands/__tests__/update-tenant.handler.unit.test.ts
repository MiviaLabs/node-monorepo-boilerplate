import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { TenantResolutionService } from '../../../../../common/services/tenant-resolution.service';
import { UpdateTenantCommand } from '../../../commands/update-tenant.command';
import { TenantRepository } from '../../../repositories/tenant.repository';
import { UpdateTenantHandler } from '../update-tenant.handler';

import type { TestingModule } from '@nestjs/testing';

describe('UpdateTenantHandler', () => {
  let handler: UpdateTenantHandler;
  let tenantRepo: { findByIdOrThrow: jest.Mock };
  let outboxRepo: { insert: jest.Mock };
  let auditOutbox: { insert: jest.Mock };
  let tenantResolutionService: { invalidateTenantCache: jest.Mock };
  let db: {
    select: jest.Mock;
    transaction: jest.Mock;
  };
  let tx: {
    update: jest.Mock;
  };

  const mockTenant = {
    id: 1,
    type: 'organization' as const,
    status: 'active' as const,
    settings: {},
    publicId: 'tenant_pub_123',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z')
  };

  beforeEach(async () => {
    tx = {
      update: jest.fn()
    };

    db = {
      select: jest.fn(),
      transaction: jest.fn().mockImplementation(async (callback: (value: typeof tx) => unknown) => {
        return callback(tx);
      })
    };

    tenantRepo = {
      findByIdOrThrow: jest.fn().mockResolvedValue(mockTenant)
    };
    outboxRepo = {
      insert: jest.fn().mockResolvedValue(undefined)
    };
    auditOutbox = {
      insert: jest.fn().mockResolvedValue(undefined)
    };
    tenantResolutionService = {
      invalidateTenantCache: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateTenantHandler,
        {
          provide: TenantRepository,
          useValue: tenantRepo
        },
        {
          provide: OutboxRepository,
          useValue: outboxRepo
        },
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: TenantResolutionService,
          useValue: tenantResolutionService
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get(UpdateTenantHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws VAL_002 when targetTenantId is not a positive integer', async () => {
    const command = new UpdateTenantCommand({
      tenantId: 1,
      actorId: '5',
      targetTenantId: 'invalid',
      name: 'Updated Org'
    });

    await expect(handler.execute(command)).rejects.toMatchObject({
      code: 'VAL_002'
    });
  });

  it('throws VAL_002 when a different tenant already owns the requested slug', async () => {
    db.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ slug: 'acme-ops' }])
          })
        })
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 999 }])
          })
        })
      });

    const command = new UpdateTenantCommand({
      tenantId: 1,
      actorId: '5',
      targetTenantId: '2',
      slug: 'existing-slug'
    });

    await expect(handler.execute(command)).rejects.toMatchObject({
      code: 'VAL_002'
    });
  });

  it('updates tenant status, publishes events, and returns the canonical tenant record', async () => {
    tx.update.mockReturnValueOnce({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ ...mockTenant, status: 'suspended' }])
        })
      })
    });

    db.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ slug: 'acme-ops' }])
          })
        })
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                {
                  id: 1,
                  name: 'Acme Operations',
                  slug: 'acme-ops',
                  status: 'suspended',
                  createdAt: new Date('2024-01-01T00:00:00.000Z'),
                  updatedAt: new Date('2024-02-01T00:00:00.000Z')
                }
              ])
            })
          })
        })
      });

    const result = await handler.execute(
      new UpdateTenantCommand({
        tenantId: 1,
        actorId: '5',
        targetTenantId: '1',
        status: 'suspended',
        requestId: 'req-update-1',
        correlationId: 'corr-update-1',
        causationId: 'cause-update-1'
      })
    );

    expect(db.transaction).toHaveBeenCalled();
    expect(outboxRepo.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'tenant.updated',
        aggregateId: '1',
        payload: expect.objectContaining({
          changes: expect.objectContaining({
            status: 'suspended'
          })
        })
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'system.tenant.updated.audit',
        correlationId: 'corr-update-1',
        causationId: 'cause-update-1',
        payload: expect.objectContaining({
          requestId: 'req-update-1',
          details: expect.objectContaining({
            updatedFields: ['status']
          })
        })
      })
    );
    expect(result).toEqual({
      id: 1,
      name: 'Acme Operations',
      slug: 'acme-ops',
      status: 'suspended',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-02-01T00:00:00.000Z')
    });
    expect(tenantResolutionService.invalidateTenantCache).toHaveBeenCalledWith(1, {
      previousSlug: 'acme-ops'
    });
  });

  it('returns canonical organization fields after a name-only update', async () => {
    tx.update.mockReturnValueOnce({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 7,
              tenantId: 1,
              name: 'Updated Name',
              slug: 'acme-ops'
            }
          ])
        })
      })
    });

    db.select
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ slug: 'acme-ops' }])
          })
        })
      })
      .mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([
                {
                  id: 1,
                  name: 'Updated Name',
                  slug: 'acme-ops',
                  status: 'active',
                  createdAt: new Date('2024-01-01T00:00:00.000Z'),
                  updatedAt: new Date('2024-03-01T00:00:00.000Z')
                }
              ])
            })
          })
        })
      });

    const result = await handler.execute(
      new UpdateTenantCommand({
        tenantId: 1,
        actorId: '5',
        targetTenantId: '1',
        name: 'Updated Name'
      })
    );

    expect(result.name).toBe('Updated Name');
    expect(result.slug).toBe('acme-ops');
    expect(result.updatedAt).toEqual(new Date('2024-03-01T00:00:00.000Z'));
    expect(tenantResolutionService.invalidateTenantCache).toHaveBeenCalledWith(1, {
      previousSlug: 'acme-ops'
    });
  });
});
