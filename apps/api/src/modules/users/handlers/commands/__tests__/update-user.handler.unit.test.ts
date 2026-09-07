/**
 * Unit tests for UpdateUserHandler
 *
 * Tests the command handler that updates users using the outbox pattern.
 * Verifies that user updates and outbox event insertion occur atomically.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { UpdateUserCommand } from '../../../commands/update-user.command';
import { UserResponseDto } from '../../../dto';
import { UpdateUserHandler } from '../../../handlers/commands/update-user.handler';
import { UserRepository } from '../../../repositories/user.repository';

import type { TestingModule } from '@nestjs/testing';
import type { User } from '@package/db-core';

describe('UpdateUserHandler', () => {
  let handler: UpdateUserHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repository: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let outboxRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTransaction: any;

  const mockUser: User = {
    id: 123,
    organizationId: 456,
    emailHash: 'abc123hash',
    emailEncrypted: 'encrypted-email-mock',
    firstNameEncrypted: 'encrypted-first-name-mock',
    lastNameEncrypted: 'encrypted-last-name-mock',
    displayName: 'Test User',
    phoneNumberEncrypted: null,
    isActive: true,
    isVerified: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T12:00:00.000Z'),
    lastSignInAt: null,
    deletedAt: new Date('2099-12-31T00:00:00.000Z'),
    photoUrl: null,
    avatarFileId: null,
    encryptionKeyVersion: 'primary-encryption-key/1'
  };

  beforeEach(async () => {
    mockTransaction = jest.fn((callback: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              returning: jest.fn(async () => [mockUser])
            }))
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
        UpdateUserHandler,
        {
          provide: UserRepository,
          useValue: {
            updateWithTransaction: jest.fn(() => Promise.resolve(mockUser))
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

    handler = module.get<UpdateUserHandler>(UpdateUserHandler);
    repository = module.get<UserRepository>(UserRepository);
    outboxRepo = module.get<OutboxRepository>(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should update user within transaction', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      const result = await handler.execute(command);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result.id).toBe(123);
    });

    it('should insert outbox record within same transaction', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789,
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const insertCall = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0];

      expect(insertCall?.[0]).toBeDefined();

      const outboxData = insertCall?.[1] as
        | {
            eventType: string;
            aggregateId: string;
            aggregateVersion: string;
            tenantId: string;
            correlationId: string;
            causationId: string;
            schemaVersion: string;
          }
        | undefined;

      expect(outboxData?.eventType).toBe('user.updated');
      expect(outboxData?.aggregateId).toBe('123');
      expect(outboxData?.aggregateVersion).toBe('2');
      expect(outboxData?.tenantId).toBe('1');
      expect(outboxData?.correlationId).toBe('corr-123');
      expect(outboxData?.causationId).toBe('cause-123');
      expect(outboxData?.schemaVersion).toBe('1.0');
    });

    it('should include all required fields in outbox record', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]?.[1] as {
        eventId: string;
        eventType: string;
        aggregateId: string;
        payload: {
          tenantId: string;
          userId: string;
          changes: Record<string, unknown>;
          updatedBy: string;
          timestamp: string;
        };
        schemaVersion: string;
      };

      expect(outboxData.eventId).toBeDefined();
      expect(typeof outboxData.eventId).toBe('string');
      expect(outboxData.eventType).toBe('user.updated');
      expect(outboxData.aggregateId).toBe('123');
      expect(outboxData.schemaVersion).toBe('1.0');

      expect(outboxData.payload.tenantId).toBe('1');
      expect(outboxData.payload.userId).toBe('123');
      expect(outboxData.payload.changes).toBeDefined();
      expect(typeof outboxData.payload.changes).toBe('object');
      expect(outboxData.payload.updatedBy).toBe('1');
      expect(outboxData.payload.timestamp).toBeDefined();
    });

    it('should return UserResponseDto with correct data', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      const result = await handler.execute(command);

      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.id).toBe(123);
      expect(result['organizationId']).toBe(456);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should ignore organizationId changes in the event payload', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { changes: Record<string, unknown> };
      };

      expect(outboxData.payload.changes).not.toHaveProperty('organizationId');
      expect(outboxData.payload.changes).toHaveProperty('updatedAt');
      expect(Object.keys(outboxData.payload.changes)).toHaveLength(1);
    });

    it('should ignore organizationId-only updates', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 999
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { changes: Record<string, unknown> };
      };

      expect(outboxData.payload.changes).not.toHaveProperty('organizationId');
      expect(outboxData.payload.changes['updatedAt']).toBeDefined();
    });

    it('should handle partial field updates (only isActive)', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        isActive: false
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { changes: Record<string, unknown> };
      };

      expect(outboxData.payload.changes['updatedAt']).toBeDefined();
      expect(outboxData.payload.changes).not.toHaveProperty('organizationId');
      expect(outboxData.payload.changes).toHaveProperty('isActive', false);
    });

    it('should handle partial field updates (only isVerified)', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        isVerified: true
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { changes: Record<string, unknown> };
      };

      expect(outboxData.payload.changes['updatedAt']).toBeDefined();
      expect(outboxData.payload.changes).not.toHaveProperty('organizationId');
      expect(outboxData.payload.changes).toHaveProperty('isVerified', true);
    });

    it('should handle multiple field updates', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789,
        isActive: false,
        isVerified: true
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { changes: Record<string, unknown> };
      };

      expect(outboxData.payload.changes['updatedAt']).toBeDefined();
      expect(outboxData.payload.changes).toHaveProperty('isActive', false);
      expect(outboxData.payload.changes).toHaveProperty('isVerified', true);
      expect(Object.keys(outboxData.payload.changes)).toHaveLength(3);
    });

    it('should pass tenantId as string to outbox', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        tenantId: string;
      };

      expect(outboxData.tenantId).toBe('1');
    });

    it('should include correlationId in outbox if provided', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789,
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
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789,
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
  });

  describe('transaction atomicity', () => {
    it('should rollback transaction if user update fails', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      repository.updateWithTransaction = jest.fn(() => Promise.reject(new Error('User not found')));

      await expect(handler.execute(command)).rejects.toThrow('User not found');

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should not insert outbox if user update fails', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      repository.updateWithTransaction = jest.fn(() =>
        Promise.reject(new Error('Failed to update user'))
      );

      try {
        await handler.execute(command);
      } catch {
        // Expected to fail
      }

      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should rollback if outbox insert fails', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      outboxRepo.insert = jest.fn(() => Promise.reject(new Error('Failed to insert outbox event')));

      await expect(handler.execute(command)).rejects.toThrow('Failed to insert outbox event');

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should ensure both user update and outbox commit atomically', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      const callOrder: string[] = [];

      repository.updateWithTransaction = jest.fn(async () => {
        callOrder.push('user-updated');
        return mockUser;
      });

      outboxRepo.insert = jest.fn(async () => {
        callOrder.push('outbox-inserted');
      });

      await handler.execute(command);

      expect(callOrder[0]).toBe('user-updated');
      expect(callOrder[1]).toBe('outbox-inserted');

      expect(repository.updateWithTransaction).toHaveBeenCalledTimes(1);
      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle missing correlationId', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
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
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
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
        const testUser = { ...mockUser, id: userId };
        repository.updateWithTransaction = jest.fn(() => Promise.resolve(testUser));

        const command = new UpdateUserCommand({
          tenantId: 1,
          actorId: 1,
          id: userId,
          organizationId: 789
        });

        const result = await handler.execute(command);

        expect(result.id).toBe(userId);
      }
    });

    it('should handle numeric tenantId conversion to string', async () => {
      const testCases = [
        { tenantId: 1, expected: '1' },
        { tenantId: 12345, expected: '12345' },
        { tenantId: 0, expected: '0' }
      ];

      for (const testCase of testCases) {
        outboxRepo.insert = jest.fn(() => Promise.resolve());

        const command = new UpdateUserCommand({
          tenantId: testCase.tenantId,
          actorId: 1,
          id: 123,
          organizationId: 789
        });

        await handler.execute(command);

        const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
          .calls[0]![1] as {
          tenantId: string;
        };
        expect(outboxData.tenantId).toBe(testCase.expected);
      }
    });

    it('should include timestamp in event payload', async () => {
      const beforeTime = new Date();

      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
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

    it('should include updatedBy in event payload as actorId', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 999,
        id: 123,
        organizationId: 789
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { updatedBy: string };
      };

      expect(outboxData.payload.updatedBy).toBe('999');
    });
  });

  describe('repository method verification', () => {
    it('should call updateWithTransaction with correct parameters', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      await handler.execute(command);

      expect(repository.updateWithTransaction).toHaveBeenCalledWith(
        1,
        expect.anything(),
        123,
        expect.not.objectContaining({
          organizationId: expect.anything()
        })
      );
    });

    it('should pass transaction object to repository method', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      let passedTx: unknown = null;
      repository.updateWithTransaction = jest.fn(async (tx) => {
        passedTx = tx;
        return mockUser;
      });

      await handler.execute(command);

      expect(repository.updateWithTransaction).toHaveBeenCalledTimes(1);
      expect(passedTx).toBeDefined();
    });

    it('should include updatedAt in update data', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789
      });

      await handler.execute(command);

      expect(repository.updateWithTransaction).toHaveBeenCalledWith(
        1,
        expect.anything(),
        123,
        expect.objectContaining({
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should keep tenant transfer data out of repository updates', async () => {
      const command = new UpdateUserCommand({
        tenantId: 1,
        actorId: 1,
        id: 123,
        organizationId: 789,
        isActive: false
      });

      await handler.execute(command);

      expect(repository.updateWithTransaction).toHaveBeenCalledWith(
        1,
        expect.anything(),
        123,
        expect.objectContaining({
          isActive: false,
          updatedAt: expect.any(Date)
        })
      );
      expect(repository.updateWithTransaction).toHaveBeenCalledWith(
        1,
        expect.anything(),
        123,
        expect.not.objectContaining({
          organizationId: expect.anything()
        })
      );
    });
  });
});
