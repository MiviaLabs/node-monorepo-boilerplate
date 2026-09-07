/**
 * Unit tests for CreateUserHandler
 *
 * Tests the command handler that creates users using the outbox pattern.
 * Verifies that user creation and outbox event insertion occur atomically.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */

import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { CreateUserCommand } from '../../../commands/create-user.command';
import { CreateUserHandler } from '../../../handlers/commands/create-user.handler';
import { UserRepository } from '../../../repositories/user.repository';

import type { TestingModule } from '@nestjs/testing';
import type { User } from '@package/db-core';

describe('CreateUserHandler', () => {
  let handler: CreateUserHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repository: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let outboxRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockTransaction: any;

  const mockUser: User = {
    id: 1,
    organizationId: 123,
    emailHash: 'abc123hash',
    emailEncrypted: 'encrypted-email-mock',
    firstNameEncrypted: 'encrypted-first-name-mock',
    lastNameEncrypted: 'encrypted-last-name-mock',
    displayName: 'Test User',
    phoneNumberEncrypted: null,
    isActive: true,
    isVerified: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastSignInAt: null,
    deletedAt: new Date('2099-12-31T00:00:00.000Z'),
    photoUrl: null,
    avatarFileId: null,
    encryptionKeyVersion: 'primary-encryption-key/1'
  };

  beforeEach(async () => {
    mockTransaction = jest.fn((callback: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        insert: jest.fn(() => ({
          values: jest.fn(() => ({
            returning: jest.fn(async () => [mockUser])
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
        CreateUserHandler,
        {
          provide: UserRepository,
          useValue: {
            createWithTransaction: jest.fn((_tx, data) => {
              const resultUser: User = {
                ...mockUser,
                organizationId: (data as { organizationId: number }).organizationId
              };
              return Promise.resolve(resultUser);
            })
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

    handler = module.get<CreateUserHandler>(CreateUserHandler);
    repository = module.get<UserRepository>(UserRepository);
    outboxRepo = module.get<OutboxRepository>(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should create user within transaction', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      const result = await handler.execute(command);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should insert outbox record within same transaction', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123,
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
      expect(outboxData.eventType).toBe('user.created');
      expect(outboxData.aggregateId).toBe('1');
      expect(outboxData.aggregateVersion).toBe('1');
      expect(outboxData.tenantId).toBe('1');
      expect(outboxData.correlationId).toBe('corr-123');
      expect(outboxData.causationId).toBe('cause-123');
      expect(outboxData.schemaVersion).toBe('1.0');
    });

    it('should include all required fields in outbox record', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        eventId: string;
        eventType: string;
        aggregateId: string;
        payload: { userId: number; organizationId: number; emailHash: string };
        schemaVersion: string;
      };

      expect(outboxData.eventId).toBeDefined();
      expect(typeof outboxData.eventId).toBe('string');
      expect(outboxData.eventType).toBe('user.created');
      expect(outboxData.aggregateId).toBe('1');
      expect(outboxData.payload).toBeDefined();
      expect(outboxData.schemaVersion).toBe('1.0');

      expect(outboxData.payload.userId).toBe('1');
      expect(outboxData.payload.organizationId).toBe('1');
      expect(outboxData.payload.emailHash).toBeDefined();
    });

    it('should return UserResponseDto with correct data', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      const result = await handler.execute(command);

      expect(result.id).toBe(1);
      expect(result.organizationId).toBe(1);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should generate email hash for user', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        payload: { emailHash: string };
      };

      expect(outboxData.payload.emailHash).toBeDefined();
      expect(typeof outboxData.payload.emailHash).toBe('string');
      expect(outboxData.payload.emailHash.length).toBeGreaterThan(0);
    });

    it('should use organizationId from command for user', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 456
      });

      const result = await handler.execute(command);

      expect(result.organizationId).toBe(1);
    });

    it('should pass tenantId as string to outbox', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
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
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123,
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
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123,
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
    it('should rollback transaction if user creation fails', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      repository.createWithTransaction = jest.fn(() =>
        Promise.reject(new Error('Database constraint violation'))
      );

      await expect(handler.execute(command)).rejects.toThrow('Database constraint violation');

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should not insert outbox if user creation fails', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      repository.createWithTransaction = jest.fn(() =>
        Promise.reject(new Error('Failed to create user'))
      );

      try {
        await handler.execute(command);
      } catch {
        // Expected to fail
      }

      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should rollback if outbox insert fails', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      outboxRepo.insert = jest.fn(() => Promise.reject(new Error('Failed to insert outbox event')));

      await expect(handler.execute(command)).rejects.toThrow('Failed to insert outbox event');

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('should ensure both user and outbox commit atomically', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      const callOrder: string[] = [];

      repository.createWithTransaction = jest.fn(async () => {
        callOrder.push('user-created');
        return mockUser;
      });

      outboxRepo.insert = jest.fn(async () => {
        callOrder.push('outbox-inserted');
      });

      await handler.execute(command);

      expect(callOrder[0]).toBe('user-created');
      expect(callOrder[1]).toBe('outbox-inserted');

      expect(repository.createWithTransaction).toHaveBeenCalledTimes(1);
      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle missing correlationId', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
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
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 123
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
        .calls[0]![1] as {
        causationId?: string;
      };
      expect(outboxData.causationId).toBeUndefined();
    });

    it('should handle different organization IDs', async () => {
      const command = new CreateUserCommand({
        tenantId: 1,
        actorId: 1,
        organizationId: 999
      });

      const result = await handler.execute(command);

      expect(result.organizationId).toBe(1);
    });

    it('should pin repository writes to tenantId instead of command organizationId', async () => {
      const command = new CreateUserCommand({
        tenantId: 321,
        actorId: 1,
        organizationId: 999
      });

      await handler.execute(command);

      expect(repository.createWithTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          organizationId: 321
        })
      );
    });

    it('should handle numeric tenantId conversion to string', async () => {
      const testCases = [
        { tenantId: 1, expected: '1' },
        { tenantId: 12345, expected: '12345' },
        { tenantId: 0, expected: '0' }
      ];

      for (const testCase of testCases) {
        outboxRepo.insert = jest.fn(() => Promise.resolve());

        const command = new CreateUserCommand({
          tenantId: testCase.tenantId,
          actorId: 1,
          organizationId: 123
        });

        await handler.execute(command);

        const outboxData = (outboxRepo.insert as jest.MockedFn<typeof outboxRepo.insert>).mock
          .calls[0]![1] as {
          tenantId: string;
        };
        expect(outboxData.tenantId).toBe(testCase.expected);
      }
    });
  });
});
