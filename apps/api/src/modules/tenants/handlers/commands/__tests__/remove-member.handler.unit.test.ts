/**
 * Unit Tests for RemoveMemberHandler
 *
 * Tests member removal with transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuthRepository } from '../../../../auth/repositories/auth.repository';
import { RemoveMemberCommand } from '../../../commands/remove-member.command';
import { UserTenantRepository } from '../../../repositories/user-tenant.repository';
import { RemoveMemberHandler } from '../remove-member.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('RemoveMemberHandler', () => {
  let handler: RemoveMemberHandler;
  let userTenantRepo: jest.Mocked<UserTenantRepository>;
  let authRepository: jest.Mocked<AuthRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;

  const mockMembership = {
    id: 1,
    userId: 10,
    tenantId: 1,
    role: 'tenant_user',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(async () => {
    // Mock transaction
    dbTransaction = {} as unknown as jest.Mocked<NodePgDatabase>;

    db = {
      select: jest.fn(),
      transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(dbTransaction);
      })
    } as unknown as jest.Mocked<NodePgDatabase>;

    const mockUserTenantRepo = {
      findByUserAndTenant: jest.fn(),
      findByUserAndTenantOrThrow: jest.fn(),
      deleteMembershipWithTransaction: jest.fn()
    };

    const mockAuthRepository = {
      softDeleteWithTransaction: jest.fn()
    };

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoveMemberHandler,
        {
          provide: UserTenantRepository,
          useValue: mockUserTenantRepo
        },
        {
          provide: AuthRepository,
          useValue: mockAuthRepository
        },
        {
          provide: OutboxRepository,
          useValue: mockOutboxRepo
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<RemoveMemberHandler>(RemoveMemberHandler);
    userTenantRepo = module.get(UserTenantRepository);
    authRepository = module.get(AuthRepository);
    outboxRepo = module.get(OutboxRepository);
  });

  describe('validation', () => {
    it('should throw VAL_002 if tenantId is not a positive integer', async () => {
      const command = new RemoveMemberCommand({
        tenantId: 'invalid',
        actorId: '5',
        memberId: '10'
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if memberId is not a positive integer', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '5',
        memberId: 'invalid'
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_001 if actor is removing themselves', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '10',
        memberId: '10'
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_001'
      });
    });

    it('should throw VAL_001 if trying to remove owner', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '10'
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1, tenantId: 101 }])
          })
        })
      });

      userTenantRepo.findByUserAndTenant.mockResolvedValue({
        ...mockMembership,
        role: 'tenant_owner'
      } as never);

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_001'
      });
    });
  });

  describe('success', () => {
    it('should remove member and publish event', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '10'
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1, tenantId: 101 }])
          })
        })
      });

      userTenantRepo.findByUserAndTenant.mockResolvedValue(mockMembership as never);

      await handler.execute(command);

      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledWith(
        '1',
        expect.anything(),
        10
      );

      // Verify event published
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.removed',
          aggregateId: '10',
          payload: expect.objectContaining({
            tenantId: '1',
            userId: '10',
            removedBy: '5',
            reason: 'Removed by tenant admin'
          })
        })
      );
    });

    it('should allow removal of tenant_admin', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '10'
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1, tenantId: 101 }])
          })
        })
      });

      userTenantRepo.findByUserAndTenant.mockResolvedValue({
        ...mockMembership,
        role: 'tenant_admin'
      } as never);

      await expect(handler.execute(command)).resolves.toBeUndefined();

      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalled();
    });

    it('should allow removal of tenant_user', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '10'
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1, tenantId: 101 }])
          })
        })
      });

      userTenantRepo.findByUserAndTenant.mockResolvedValue({
        ...mockMembership,
        role: 'tenant_user'
      } as never);

      await expect(handler.execute(command)).resolves.toBeUndefined();
    });

    it('should soft-delete the organization user when removing a member', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '10'
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1, tenantId: 101, ownerId: 99 }])
          })
        })
      });

      userTenantRepo.findByUserAndTenant.mockResolvedValue(mockMembership as never);

      await handler.execute(command);

      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledWith(
        '1',
        expect.anything(),
        10
      );
    });

    it('should soft-delete a direct organization member when no user_tenants row exists', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '10'
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1, tenantId: 101, ownerId: 99 }])
          })
        })
      });

      userTenantRepo.findByUserAndTenant.mockResolvedValue(null);

      await expect(handler.execute(command)).resolves.toBeUndefined();

      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledWith(
        '1',
        expect.anything(),
        10
      );
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.removed.audit',
          payload: expect.objectContaining({
            details: expect.objectContaining({
              removedRole: 'tenant_user'
            })
          })
        })
      );
    });

    it('should persist the membership removal audit event in the same transaction with propagated trace metadata', async () => {
      const command = new RemoveMemberCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '10',
        requestId: 'req-remove-member-1',
        correlationId: 'corr-remove-member-1',
        causationId: 'cause-remove-member-1'
      });
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ id: 1, tenantId: 101 }])
          })
        })
      });

      userTenantRepo.findByUserAndTenant.mockResolvedValue(mockMembership as never);

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(2);
      const calls = outboxRepo.insert.mock.calls as Array<[object, Record<string, unknown>]>;
      expect(calls[0]?.[0]).toBe(dbTransaction);
      expect(calls[1]?.[0]).toBe(dbTransaction);
      expect(calls[1]?.[1]).toMatchObject({
        eventType: 'tenant.member.removed.audit',
        correlationId: 'corr-remove-member-1',
        causationId: 'cause-remove-member-1',
        payload: expect.objectContaining({
          requestId: 'req-remove-member-1',
          actorId: '5',
          details: expect.objectContaining({
            removedRole: 'tenant_user'
          })
        })
      });
    });
  });
});
