/**
 * Unit Tests for CreateTenantHandler
 *
 * Tests tenant creation with transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { CreateTenantCommand } from '../../../commands/create-tenant.command';
import { TenantRepository } from '../../../repositories/tenant.repository';
import { CreateTenantHandler } from '../create-tenant.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('CreateTenantHandler', () => {
  let handler: CreateTenantHandler;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;

  const mockTenant = {
    id: 1,
    type: 'organization' as const,
    status: 'active' as const,
    settings: {},
    publicId: 'abc123',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z')
  };

  const mockOrganization = {
    id: 100,
    tenantId: 1,
    ownerId: 5,
    name: 'Test Organization',
    slug: 'test-org',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null
  };

  beforeEach(async () => {
    // Mock transaction
    dbTransaction = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn()
    } as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockTenantRepo = {
      findByIdOrThrow: jest.fn()
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const mockAuditOutbox = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateTenantHandler,
        {
          provide: TenantRepository,
          useValue: mockTenantRepo
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: AuditOutboxPublisher,
          useValue: mockAuditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<CreateTenantHandler>(CreateTenantHandler);
    outboxRepo = module.get(OutboxRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  describe('validation', () => {
    it('should throw VAL_002 if actorId is not a positive integer', async () => {
      const command = new CreateTenantCommand({
        tenantId: 1,
        actorId: 'invalid',
        name: 'Test Org',
        slug: 'test-org'
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if slug already exists', async () => {
      const command = new CreateTenantCommand({
        tenantId: 1,
        actorId: '5',
        name: 'Test Org',
        slug: 'existing-org'
      });

      // Slug check now happens inside transaction
      (dbTransaction.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1 }])
          })
        })
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });
  });

  describe('success', () => {
    it('should create tenant, organization, owner membership and publish event', async () => {
      const command = new CreateTenantCommand({
        tenantId: 1,
        actorId: '5',
        name: 'Test Organization',
        slug: 'test-org',
        requestId: 'req-create-1',
        correlationId: 'corr-create-1',
        causationId: 'cause-create-1'
      });

      // Slug check now happens inside transaction
      (dbTransaction.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Mock transaction inserts
      const mockInsert = (
        _table: unknown
      ): { values: (_data: unknown) => { returning: jest.Mock } } => ({
        values: (_data: unknown) => ({
          returning: jest.fn().mockResolvedValue([mockTenant])
        })
      });

      (dbTransaction.insert as jest.Mock).mockImplementation((table: unknown) => {
        if (typeof table === 'object' && table !== null) {
          const tableName = Object.keys(table)[0] ?? 'unknown';
          return {
            values: jest.fn().mockReturnValue({
              returning: jest
                .fn()
                .mockResolvedValue(tableName === 'tenants' ? [mockTenant] : [mockOrganization])
            })
          };
        }
        return mockInsert(table);
      });

      const result = await handler.execute(command);

      // Verify transaction was called
      expect(db.transaction).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'tenant.created',
          aggregateId: expect.any(String),
          payload: expect.objectContaining({
            tenantName: 'Test Organization',
            tenantSlug: 'test-org',
            ownerId: '5'
          })
        })
      );
      expect(auditOutbox.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'system.tenant.created.audit',
          correlationId: 'corr-create-1',
          causationId: 'cause-create-1',
          payload: expect.objectContaining({
            requestId: 'req-create-1'
          })
        })
      );

      // Verify result exists
      expect(result).toBeDefined();
      expect(result.name).toBe('Test Organization');
      expect(result.slug).toBe('test-org');
    });
  });
});
