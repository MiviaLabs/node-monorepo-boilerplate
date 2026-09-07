/**
 * Unit Tests for UpdateMemberRoleHandler
 *
 * Tests member role updates with transactional outbox pattern.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { createMockUserTenant } from '../../../__tests__/fixtures/tenant.fixture';
import { UpdateMemberRoleCommand } from '../../../commands/update-member-role.command';
import { UpdateMemberRoleHandler } from '../update-member-role.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('UpdateMemberRoleHandler', () => {
  let handler: UpdateMemberRoleHandler;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: jest.Mocked<NodePgDatabase>;
  let dbTransaction: jest.Mocked<NodePgDatabase>;

  const mockMembership = createMockUserTenant();
  const mockOrganization = { id: 1, tenantId: 99 };

  beforeEach(async () => {
    // Mock transaction
    dbTransaction = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
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

    const mockOutboxRepo = {
      insert: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateMemberRoleHandler,
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

    handler = module.get<UpdateMemberRoleHandler>(UpdateMemberRoleHandler);
    outboxRepo = module.get(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should throw VAL_002 if tenantId is not a positive integer', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: 'invalid',
        actorId: '5',
        memberId: '123',
        role: 'tenant_admin'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if memberId is not a positive integer', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: '1',
        actorId: '5',
        memberId: 'invalid',
        role: 'tenant_admin'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if tenantId is zero', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: '0',
        actorId: '5',
        memberId: '123',
        role: 'tenant_admin'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if memberId is negative', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '-1',
        role: 'tenant_admin'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });
  });

  describe('not found', () => {
    it('should throw DB_004 if membership not found', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '999',
        role: 'tenant_admin'
      });

      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockOrganization])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'DB_004'
      });
    });
  });

  describe('permission', () => {
    it('should throw AUTH_004 when trying to change owner role', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        role: 'tenant_admin'
      });

      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockOrganization])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockMembership, role: 'tenant_owner' }])
            })
          })
        });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'AUTH_004'
      });
    });

    it('should allow changing owner to owner (no-op)', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        role: 'tenant_owner'
      });

      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockOrganization])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockMembership, role: 'tenant_owner' }])
            })
          })
        });

      const updatedMembership = { ...mockMembership, role: 'tenant_owner' };
      (dbTransaction.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedMembership])
          })
        })
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.role).toBe('tenant_owner');
    });
  });

  describe('success', () => {
    it('should update role and publish event', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        role: 'tenant_admin'
      });

      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockOrganization])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockMembership, tenantId: 99 }])
            })
          })
        });

      const updatedMembership = {
        ...mockMembership,
        tenantId: 99,
        role: 'tenant_admin',
        updatedAt: new Date()
      };

      (dbTransaction.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedMembership])
          })
        })
      });

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.role).toBe('tenant_admin');
      expect(result.memberId).toBe('123');
      expect(result.userId).toBe(123);
      expect(result.tenantId).toBe(99);

      // Verify event published
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.role.updated',
          aggregateId: '123',
          payload: expect.objectContaining({
            tenantId: '1',
            userId: '123',
            previousRole: 'tenant_user',
            newRole: 'tenant_admin',
            updatedBy: '5'
          })
        })
      );
    });

    it('should support correlation and causation IDs', async () => {
      // Arrange
      const command = new UpdateMemberRoleCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        role: 'tenant_admin',
        correlationId: 'corr-123',
        causationId: 'cause-456'
      });

      (db.select as jest.Mock)
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockOrganization])
            })
          })
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockMembership, tenantId: 99 }])
            })
          })
        });

      const updatedMembership = { ...mockMembership, tenantId: 99, role: 'tenant_admin' };
      (dbTransaction.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedMembership])
          })
        })
      });

      // Act
      await handler.execute(command);

      // Assert
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          correlationId: 'corr-123',
          causationId: 'cause-456'
        })
      );
    });
  });
});
