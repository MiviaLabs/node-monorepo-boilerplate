/**
 * Unit Tests for DeleteTenantHandler
 *
 * Tests tenant deletion with transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { TenantResolutionService } from '../../../../../common/services/tenant-resolution.service';
import { AuthRepository } from '../../../../auth/repositories/auth.repository';
import { DeleteTenantCommand } from '../../../commands/delete-tenant.command';
import { TenantRepository } from '../../../repositories/tenant.repository';
import { DeleteTenantHandler } from '../delete-tenant.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('DeleteTenantHandler', () => {
  let handler: DeleteTenantHandler;
  let tenantRepo: jest.Mocked<TenantRepository>;
  let authRepository: jest.Mocked<AuthRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let auditOutbox: jest.Mocked<AuditOutboxPublisher>;
  let tenantResolutionService: { invalidateTenantCache: jest.Mock };
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

  beforeEach(async () => {
    // Mock transaction
    dbTransaction = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ organizationId: 7 }]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis()
    } as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockTenantRepo = {
      findByIdOrThrow: jest.fn().mockResolvedValue(mockTenant)
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const mockAuthRepository = {
      softDeleteAllByOrganization: jest.fn().mockResolvedValue(2)
    };

    const mockAuditOutbox = {
      insert: jest.fn()
    };
    tenantResolutionService = {
      invalidateTenantCache: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteTenantHandler,
        {
          provide: TenantRepository,
          useValue: mockTenantRepo
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: AuditOutboxPublisher,
          useValue: mockAuditOutbox
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

    handler = module.get<DeleteTenantHandler>(DeleteTenantHandler);
    tenantRepo = module.get(TenantRepository);
    authRepository = module.get(AuthRepository);
    outboxRepo = module.get(OutboxRepository);
    auditOutbox = module.get(AuditOutboxPublisher);
  });

  describe('validation', () => {
    it('should throw VAL_002 if targetTenantId is not a positive integer', async () => {
      const command = new DeleteTenantCommand({
        tenantId: 1,
        actorId: '5',
        targetTenantId: 'invalid'
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should reject deletion when tenant has more than 1 active member', async () => {
      const command = new DeleteTenantCommand({
        tenantId: 1,
        actorId: '5',
        targetTenantId: '1',
        requestId: 'req-delete-1',
        correlationId: 'corr-delete-1',
        causationId: 'cause-delete-1'
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue(mockTenant);

      // Mock db.select to return aggregate active-member count > 1
      (db.select as jest.Mock).mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ count: 2 }])
        })
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'BIZ_001'
      });
      expect(authRepository.softDeleteAllByOrganization).not.toHaveBeenCalled();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('should soft delete organization, users, tenant status, and publish event', async () => {
      const command = new DeleteTenantCommand({
        tenantId: 1,
        actorId: '5',
        targetTenantId: '1',
        requestId: 'req-delete-1',
        correlationId: 'corr-delete-1',
        causationId: 'cause-delete-1'
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue(mockTenant);

      // Mock db.select to return aggregate active-member count = 1 (only owner)
      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 1 }])
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ slug: 'acme-ops' }])
            })
          })
        });

      await handler.execute(command);

      // Verify transaction was called
      expect(db.transaction).toHaveBeenCalled();

      // Verify outbox event includes the aggregated member count value
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'tenant.deleted',
          aggregateId: '1',
          payload: expect.objectContaining({
            tenantId: '1',
            deletedBy: '5',
            memberCount: 1
          })
        })
      );
      expect(auditOutbox.insert).toHaveBeenCalledWith(
        dbTransaction,
        expect.objectContaining({
          eventType: 'system.tenant.deleted.audit',
          correlationId: 'corr-delete-1',
          causationId: 'cause-delete-1',
          payload: expect.objectContaining({
            requestId: 'req-delete-1',
            details: expect.objectContaining({
              activeMemberCount: 1
            })
          })
        })
      );
      expect(authRepository.softDeleteAllByOrganization).toHaveBeenCalledWith(
        '1',
        expect.anything()
      );
      expect(tenantResolutionService.invalidateTenantCache).toHaveBeenCalledWith(1, {
        previousSlug: 'acme-ops'
      });
    });

    it('should allow deletion if tenant has exactly 1 active member', async () => {
      const command = new DeleteTenantCommand({
        tenantId: 1,
        actorId: '5',
        targetTenantId: '1'
      });

      tenantRepo.findByIdOrThrow.mockResolvedValue(mockTenant);

      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([{ count: 1 }])
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ slug: 'acme-ops' }])
            })
          })
        });

      // Should not throw
      await expect(handler.execute(command)).resolves.toBeUndefined();
    });
  });
});
