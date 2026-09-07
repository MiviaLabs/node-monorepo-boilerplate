/**
 * Unit tests for DeleteUserHandler
 *
 * Tests the command handler that deletes users using the outbox pattern.
 * Verifies that user deletion and outbox event insertion occur atomically.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */

import { Test } from '@nestjs/testing';
import { RoleService } from '@package/auth';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { AuthRepository } from '../../../../auth/repositories/auth.repository';
import { DeleteUserCommand } from '../../../commands/delete-user.command';
import { DeletionType } from '../../../events';
import { DeleteUserHandler } from '../../../handlers/commands/delete-user.handler';

import type { TestingModule } from '@nestjs/testing';

describe('DeleteUserHandler', () => {
  let handler: DeleteUserHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authRepository: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let outboxRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let roleService: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTransaction: any;

  beforeEach(async () => {
    mockTransaction = jest.fn((callback: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        delete: jest.fn(() => ({
          where: jest.fn(() => ({
            returning: jest.fn(async () => [])
          }))
        }))
      };
      return callback(mockTx);
    });

    db = {
      transaction: mockTransaction
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteUserHandler,
        {
          provide: AuthRepository,
          useValue: {
            softDeleteWithTransaction: jest.fn(() => Promise.resolve())
          }
        },
        {
          provide: RoleService,
          useValue: {
            getSystemRoles: jest.fn(() => Promise.resolve([]))
          }
        },
        {
          provide: OutboxRepository,
          useValue: {
            insert: jest.fn(() => Promise.resolve())
          }
        },
        {
          provide: AuditOutboxPublisher,
          useValue: {
            insert: jest.fn(() => Promise.resolve())
          }
        },
        {
          provide: MAIN_DB,
          useValue: db
        }
      ]
    }).compile();

    handler = module.get<DeleteUserHandler>(DeleteUserHandler);
    authRepository = module.get<AuthRepository>(AuthRepository);
    roleService = module.get<RoleService>(RoleService);
    outboxRepo = module.get<OutboxRepository>(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should delete user within transaction', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      await handler.execute(command);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledTimes(1);
    });

    it('should block operators from deleting their own account', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 123,
        id: 123
      });

      await expect(handler.execute(command)).rejects.toThrow(
        'You cannot delete your own account from admin'
      );

      expect(roleService.getSystemRoles).not.toHaveBeenCalled();
      expect(authRepository.softDeleteWithTransaction).not.toHaveBeenCalled();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should block system_admin from deleting a system_owner', async () => {
      roleService.getSystemRoles = jest
        .fn()
        .mockResolvedValueOnce(['system_admin'])
        .mockResolvedValueOnce(['system_owner']);

      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 10,
        id: 123
      });

      await expect(handler.execute(command)).rejects.toThrow(
        'Only system owners can delete system owners'
      );

      expect(authRepository.softDeleteWithTransaction).not.toHaveBeenCalled();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should allow system_owner to delete a system_owner', async () => {
      roleService.getSystemRoles = jest
        .fn()
        .mockResolvedValueOnce(['system_owner'])
        .mockResolvedValueOnce(['system_owner']);

      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 10,
        id: 123
      });

      await handler.execute(command);

      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledTimes(1);
      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('should propagate DB_004 and skip outbox when user is missing or already deleted', async () => {
      authRepository.softDeleteWithTransaction = jest
        .fn()
        .mockRejectedValue(Errors.databaserecordNotFound004({ entity: 'User' }));

      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 10,
        id: 123
      });

      await expect(handler.execute(command)).rejects.toMatchObject({
        code: 'DB_004'
      });

      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should insert outbox record within same transaction', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const insertCall = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0];

      expect(insertCall?.[0]).toBeDefined();

      const outboxData = insertCall?.[1] as {
        eventType: string;
        aggregateId: string;
        aggregateVersion: string;
        tenantId: string;
        correlationId: string;
        causationId: string;
        schemaVersion: string;
      };
      expect(outboxData.eventType).toBe('user.deleted');
      expect(outboxData.aggregateId).toBe('123');
      expect(outboxData.aggregateVersion).toBe('3');
      expect(outboxData.tenantId).toBe('1');
      expect(outboxData.correlationId).toBe('corr-123');
      expect(outboxData.causationId).toBe('cause-123');
      expect(outboxData.schemaVersion).toBe('1.0');
    });

    it('should include all required fields in outbox record', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        eventId: string;
        eventType: string;
        aggregateId: string;
        payload: {
          tenantId: string;
          userId: string;
          deletionType: DeletionType;
          deletedBy: string;
          timestamp: string;
        };
        schemaVersion: string;
      };

      expect(outboxData.eventId).toBeDefined();
      expect(typeof outboxData.eventId).toBe('string');
      expect(outboxData.eventType).toBe('user.deleted');
      expect(outboxData.aggregateId).toBe('123');
      expect(outboxData.schemaVersion).toBe('1.0');

      expect(outboxData.payload.tenantId).toBe('1');
      expect(outboxData.payload.userId).toBe('123');
      expect(outboxData.payload.deletionType).toBe(DeletionType.Soft);
      expect(outboxData.payload.deletedBy).toBe('1');
      expect(outboxData.payload.timestamp).toBeDefined();
      expect(typeof outboxData.payload.timestamp).toBe('string');
    });

    it('should use DeletionType.Soft in event payload', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { deletionType: DeletionType };
      };

      expect(outboxData.payload.deletionType).toBe(DeletionType.Soft);
    });

    it('should pass tenantId as string to outbox', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        tenantId: string;
      };

      expect(outboxData.tenantId).toBe('1');
    });

    it('should pass actorId as deletedBy in event payload', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 456,
        id: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { deletedBy: string };
      };

      expect(outboxData.payload.deletedBy).toBe('456');
    });

    it('should include correlationId in outbox if provided', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        correlationId: 'correlation-abc-123'
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        correlationId: string;
      };
      expect(outboxData.correlationId).toBe('correlation-abc-123');
    });

    it('should include causationId in outbox if provided', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        causationId: 'causation-xyz-789'
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        causationId: string;
      };
      expect(outboxData.causationId).toBe('causation-xyz-789');
    });

    it('should convert numeric tenantId to string in event payload', async () => {
      const testCases = [
        { tenantId: 1, expected: '1' },
        { tenantId: 12345, expected: '12345' },
        { tenantId: 0, expected: '0' }
      ];

      for (const testCase of testCases) {
        outboxRepo.insert = jest.fn(() => Promise.resolve());

        const command = new DeleteUserCommand({
          tenantId: testCase.tenantId,
          actorId: 1,
          id: 123
        });

        await handler.execute(command);

        const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
          .calls[0]![1] as {
          payload: { tenantId: string };
        };
        expect(outboxData.payload.tenantId).toBe(testCase.expected);
      }
    });

    it('should convert numeric userId to string in event payload', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 999
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { userId: string };
      };

      expect(outboxData.payload.userId).toBe('999');
    });
  });

  describe('transaction atomicity', () => {
    it('should rollback transaction if user deletion fails', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      authRepository.softDeleteWithTransaction = jest.fn(() =>
        Promise.reject(new Error('User not found'))
      );

      await expect(handler.execute(command)).rejects.toThrow('User not found');

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should not insert outbox if user deletion fails', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      authRepository.softDeleteWithTransaction = jest.fn(() =>
        Promise.reject(new Error('Failed to delete user'))
      );

      try {
        await handler.execute(command);
      } catch {
        // Expected to fail
      }

      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should rollback if outbox insert fails', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      outboxRepo.insert = jest.fn(() => Promise.reject(new Error('Failed to insert outbox event')));

      await expect(handler.execute(command)).rejects.toThrow('Failed to insert outbox event');

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should ensure both user deletion and outbox commit atomically', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      const callOrder: string[] = [];

      authRepository.softDeleteWithTransaction = jest.fn(async () => {
        callOrder.push('user-deleted');
      });

      outboxRepo.insert = jest.fn(async () => {
        callOrder.push('outbox-inserted');
      });

      await handler.execute(command);

      expect(callOrder[0]).toBe('user-deleted');
      expect(callOrder[1]).toBe('outbox-inserted');

      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledTimes(1);
      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle missing correlationId', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        correlationId?: string;
      };
      expect(outboxData.correlationId).toBeUndefined();
    });

    it('should handle missing causationId', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        causationId?: string;
      };
      expect(outboxData.causationId).toBeUndefined();
    });

    it('should handle different user IDs', async () => {
      const testCases = [1, 123, 999, 10000];

      for (const userId of testCases) {
        outboxRepo.insert = jest.fn(() => Promise.resolve());

        const command = new DeleteUserCommand({
          tenantId: 1,
          actorId: 5000,
          id: userId
        });

        await handler.execute(command);

        const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
          .calls[0]![1] as {
          aggregateId: string;
          payload: { userId: string };
        };

        expect(outboxData.aggregateId).toBe(String(userId));
        expect(outboxData.payload.userId).toBe(String(userId));
      }
    });

    it('should include timestamp in event payload', async () => {
      const beforeTime = new Date();

      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      await handler.execute(command);

      const afterTime = new Date();

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { timestamp: string };
      };

      const timestamp = new Date(outboxData.payload.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('repository method verification', () => {
    it('should call softDeleteWithTransaction with correct parameters', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      await handler.execute(command);

      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledWith(
        '1',
        expect.anything(),
        123
      );
    });

    it('should pass transaction object to repository method', async () => {
      const command = new DeleteUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123
      });

      let passedTx: unknown = null;
      authRepository.softDeleteWithTransaction = jest.fn(async (_tenantId, tx) => {
        passedTx = tx;
      });

      await handler.execute(command);

      expect(authRepository.softDeleteWithTransaction).toHaveBeenCalledTimes(1);
      expect(passedTx).toBeDefined();
    });
  });
});
