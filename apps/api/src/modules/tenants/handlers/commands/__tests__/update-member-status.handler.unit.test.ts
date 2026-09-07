/**
 * Unit Tests for UpdateMemberStatusHandler
 *
 * Tests member status updates with transactional outbox pattern.
 * Status maps to isActive: active=true, non-active=false.
 */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { createMockUserTenant } from '../../../__tests__/fixtures/tenant.fixture';
import { UpdateMemberStatusCommand } from '../../../commands/update-member-status.command';
import { UpdateMemberStatusHandler } from '../update-member-status.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('UpdateMemberStatusHandler', () => {
  let handler: UpdateMemberStatusHandler;
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
        UpdateMemberStatusHandler,
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

    handler = module.get<UpdateMemberStatusHandler>(UpdateMemberStatusHandler);
    outboxRepo = module.get(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should throw VAL_002 if tenantId is not a positive integer', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: 'invalid',
        actorId: '5',
        memberId: '123',
        status: 'active'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if memberId is not a positive integer', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: 'invalid',
        status: 'active'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if tenantId is zero', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '0',
        actorId: '5',
        memberId: '123',
        status: 'active'
      });

      // Act & Assert
      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'VAL_002'
      });
    });

    it('should throw VAL_002 if memberId is negative', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '-1',
        status: 'active'
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
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '999',
        status: 'active'
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
    it('should throw AUTH_004 when trying to deactivate owner', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'inactive'
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

    it('should throw AUTH_004 when trying to suspend owner', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'suspended'
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

    it('should allow activating owner', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'active'
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
              limit: jest
                .fn()
                .mockResolvedValue([
                  { ...mockMembership, tenantId: 99, role: 'tenant_owner', isActive: false }
                ])
            })
          })
        });

      const updatedMembership = {
        ...mockMembership,
        tenantId: 99,
        role: 'tenant_owner',
        isActive: true
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
      expect(result.isActive).toBe(true);
      expect(result.status).toBe('active');
    });
  });

  describe('status mapping', () => {
    it('should map active status to isActive=true', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'active'
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
              limit: jest
                .fn()
                .mockResolvedValue([{ ...mockMembership, tenantId: 99, isActive: false }])
            })
          })
        });

      const updatedMembership = { ...mockMembership, tenantId: 99, isActive: true };
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
      expect(result.isActive).toBe(true);
    });

    it('should map inactive status to isActive=false', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'inactive'
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

      const updatedMembership = { ...mockMembership, isActive: false };
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
      expect(result.isActive).toBe(false);
      expect(result.status).toBe('inactive');
    });

    it('should map suspended status to isActive=false', async () => {
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'suspended'
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

      const updatedMembership = { ...mockMembership, tenantId: 99, isActive: false };
      (dbTransaction.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedMembership])
          })
        })
      });

      const result = await handler.execute(command);

      expect(result.isActive).toBe(false);
      expect(result.status).toBe('suspended');
    });

    it('should map pending status to isActive=false', async () => {
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'pending'
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

      const updatedMembership = { ...mockMembership, tenantId: 99, isActive: false };
      (dbTransaction.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedMembership])
          })
        })
      });

      const result = await handler.execute(command);

      expect(result.isActive).toBe(false);
      expect(result.status).toBe('pending');
    });
  });

  describe('success', () => {
    it('should update status and publish event', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'inactive'
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
        isActive: false,
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
      expect(result.isActive).toBe(false);
      expect(result.status).toBe('inactive');
      expect(result.memberId).toBe(123);
      expect(result.userId).toBe(123);
      expect(result.tenantId).toBe(99);

      // Verify event published
      expect(outboxRepo.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'tenant.member.status.updated',
          aggregateId: '123',
          payload: expect.objectContaining({
            tenantId: '1',
            userId: '123',
            previousStatus: 'active',
            newStatus: 'inactive',
            updatedBy: '5'
          })
        })
      );
    });

    it('should support correlation and causation IDs', async () => {
      // Arrange
      const command = new UpdateMemberStatusCommand({
        tenantId: '1',
        actorId: '5',
        memberId: '123',
        status: 'inactive',
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

      const updatedMembership = { ...mockMembership, tenantId: 99, isActive: false };
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
