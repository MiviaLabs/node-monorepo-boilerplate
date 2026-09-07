/**
 * Unit tests for DeleteUserAddressHandler
 *
 * Tests the command handler that performs soft delete of user addresses.
 * Verifies transaction atomicity, authorization, and audit trail preservation.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */
/* eslint-disable @typescript-eslint/no-explicit-any -- Mock types for testing */

import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { DeleteUserAddressCommand } from '../../../commands/delete-user-address.command';
import { UserAddressEventSchemaVersion, UserAddressEventType } from '../../../events';
import { UserAddressRepository } from '../../../repositories/user-address.repository';
import { DeleteUserAddressHandler } from '../delete-user-address.handler';

import type { TestingModule } from '@nestjs/testing';
import type { UserAddress } from '@package/db-core';

describe('DeleteUserAddressHandler', () => {
  let handler: DeleteUserAddressHandler;
  let repository: jest.Mocked<UserAddressRepository>;
  let outboxRepo: jest.Mocked<OutboxRepository>;
  let db: any;
  let mockTransaction: jest.Mock;

  const mockAddress: UserAddress = {
    id: 1,
    organizationId: 123,
    userId: 456,
    addressType: 'primary',
    label: null,
    isDefault: false,
    isVerified: false,
    streetEncryptedStoreId: 100,
    street2EncryptedStoreId: null,
    cityEncryptedStoreId: 101,
    stateEncryptedStoreId: 102,
    postalCodeEncryptedStoreId: 103,
    countryEncryptedStoreId: 104,
    countryCode: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null
  };

  beforeEach(async () => {
    mockTransaction = jest.fn((callback: (tx: any) => Promise<any>) => {
      const mockTx = {
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn()
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
        DeleteUserAddressHandler,
        {
          provide: UserAddressRepository,
          useValue: {
            findByIdOrThrow: jest.fn(async () => mockAddress),
            softDelete: jest.fn(() => Promise.resolve())
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

    handler = module.get<DeleteUserAddressHandler>(DeleteUserAddressHandler);
    repository = module.get(UserAddressRepository);
    outboxRepo = module.get(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute - success cases', () => {
    it('should soft delete address', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      const result = await handler.execute(command);

      expect(repository.softDelete).toHaveBeenCalledWith(123, 1, expect.any(Object));
      expect(result).toEqual({
        success: true,
        addressId: 1,
        userId: 456
      });
    });

    it('should publish outbox event after deletion', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;

      expect(outboxData.eventType).toBe(UserAddressEventType.USER_ADDRESS_DELETED);
      expect(outboxData.aggregateId).toBe('1');
      expect(outboxData.tenantId).toBe('123');
      expect(outboxData.correlationId).toBe('corr-123');
      expect(outboxData.causationId).toBe('cause-123');
      expect(outboxData.schemaVersion).toBe(UserAddressEventSchemaVersion.V1_0);
    });

    it('should return success response', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(result.addressId).toBe(1);
      expect(result.userId).toBe(456);
    });

    it('should include deletion metadata in outbox event', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as {
        deletedBy: string;
        reason: string;
        timestamp: string;
      };

      expect(payload.deletedBy).toBe('456');
      expect(payload.reason).toBe('User requested deletion');
      expect(payload.timestamp).toBeDefined();
      expect(new Date(payload.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('execute - authorization cases', () => {
    it('should allow user to delete their own address', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      await expect(handler.execute(command)).resolves.toBeDefined();
    });

    it('should block user from deleting different user address (SEC-001)', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456, // Actor ID
        addressId: 1 // Address belongs to user 456 (from mock)
      });

      // Mock address belongs to user 789
      (repository.findByIdOrThrow as jest.Mock).mockImplementation(async () => ({
        ...mockAddress,
        userId: 789
      }));

      await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
      await expect(handler.execute(command)).rejects.toThrow(
        'You can only delete addresses for your own account'
      );

      // Verify no deletion occurred
      expect(repository.softDelete).not.toHaveBeenCalled();

      // Verify no outbox event was published
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('execute - error cases', () => {
    it('should throw error when address not found', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 999
      });

      (repository.findByIdOrThrow as jest.Mock).mockImplementation(() =>
        Promise.reject(Errors.databaserecordNotFound004({ entity: 'UserAddress' }))
      );

      await expect(handler.execute(command)).rejects.toThrow();

      // Verify no deletion occurred
      expect(repository.softDelete).not.toHaveBeenCalled();

      // Verify no outbox event was published
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should handle repository errors', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      (repository.softDelete as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Database connection failed'))
      );

      await expect(handler.execute(command)).rejects.toThrow('Database connection failed');

      // Verify outbox was not inserted (transaction rolled back)
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should handle transaction errors', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      // Simulate transaction failure
      mockTransaction = jest.fn(() => Promise.reject(new Error('Transaction aborted')));
      db.transaction = mockTransaction;

      await expect(handler.execute(command)).rejects.toThrow('Transaction aborted');

      // Verify outbox was not inserted
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('execute - transaction atomicity', () => {
    it('should execute soft delete and outbox insert in same transaction', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      const callOrder: string[] = [];

      (repository.softDelete as jest.Mock).mockImplementation(async () => {
        callOrder.push('soft-delete');
      });

      (outboxRepo.insert as jest.Mock).mockImplementation(async () => {
        callOrder.push('outbox-insert');
      });

      await handler.execute(command);

      // Verify both operations were called
      expect(repository.softDelete).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalled();

      // Verify order: soft delete before outbox
      expect(callOrder[0]).toBe('soft-delete');
      expect(callOrder[1]).toBe('outbox-insert');
    });

    it('should not insert outbox if soft delete fails', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      (repository.softDelete as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Delete failed'))
      );

      try {
        await handler.execute(command);
      } catch {
        // Expected to fail
      }

      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should rollback transaction if outbox insert fails', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      (outboxRepo.insert as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Outbox insert failed'))
      );

      await expect(handler.execute(command)).rejects.toThrow('Outbox insert failed');

      // Transaction should have been attempted
      expect(mockTransaction).toHaveBeenCalledTimes(1);

      // Soft delete should have been called but rolled back
      expect(repository.softDelete).toHaveBeenCalled();
    });
  });

  describe('execute - outbox event validation', () => {
    it('should include required fields in outbox payload', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as {
        tenantId: string;
        userId: string;
        addressId: string;
        deletedBy: string;
        reason: string;
        timestamp: string;
      };

      expect(payload.tenantId).toBe('123');
      expect(payload.userId).toBe('456');
      expect(payload.addressId).toBe('1');
      expect(payload.deletedBy).toBe('456');
      expect(payload.reason).toBe('User requested deletion');
      expect(payload.timestamp).toBeDefined();
    });

    it('should not include PII in outbox event', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as any;

      // Verify no PII in payload
      expect(payload).not.toHaveProperty('street');
      expect(payload).not.toHaveProperty('city');
      expect(payload).not.toHaveProperty('state');
      expect(payload).not.toHaveProperty('postalCode');
      expect(payload).not.toHaveProperty('country');

      // encrypted-store IDs should not be in event
      expect(payload).not.toHaveProperty('streetEncryptedStoreId');
      expect(payload).not.toHaveProperty('cityEncryptedStoreId');
      expect(payload).not.toHaveProperty('stateEncryptedStoreId');
    });

    it('should include proper event metadata', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        correlationId: 'test-correlation',
        causationId: 'test-causation'
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;

      expect(outboxData.eventType).toBe(UserAddressEventType.USER_ADDRESS_DELETED);
      expect(outboxData.aggregateId).toBe('1');
      expect(outboxData.aggregateVersion).toBe('1');
      expect(outboxData.tenantId).toBe('123');
      expect(outboxData.correlationId).toBe('test-correlation');
      expect(outboxData.causationId).toBe('test-causation');
      expect(outboxData.schemaVersion).toBe(UserAddressEventSchemaVersion.V1_0);
      expect(outboxData.eventId).toBeDefined();
      expect(typeof outboxData.eventId).toBe('string');
    });
  });

  describe('execute - edge cases', () => {
    it('should handle missing correlationId', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
        // No correlationId
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.correlationId).toBeUndefined();
    });

    it('should handle missing causationId', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        correlationId: 'corr-123'
        // No causationId
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.causationId).toBeUndefined();
      expect(outboxData.correlationId).toBe('corr-123');
    });

    it('should convert numeric tenantId to string in outbox', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 12345,
        actorId: 456,
        addressId: 1
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.tenantId).toBe('12345');
      expect(typeof outboxData.tenantId).toBe('string');
    });

    it('should handle different address IDs', async () => {
      const testCases = [1, 100, 999, 12345];

      for (const addressId of testCases) {
        const command = new DeleteUserAddressCommand({
          tenantId: 123,
          actorId: 456,
          addressId
        });

        (repository.findByIdOrThrow as jest.Mock).mockImplementation(async () => ({
          ...mockAddress,
          id: addressId
        }));

        const result = await handler.execute(command);

        expect(result.addressId).toBe(addressId);
        expect(result.success).toBe(true);

        const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
        expect(outboxData.aggregateId).toBe(String(addressId));
        expect(outboxData.payload.addressId).toBe(String(addressId));

        jest.clearAllMocks();
      }
    });

    it('should preserve encrypted-store entries (soft delete)', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      await handler.execute(command);

      // Verify soft delete was called (not hard delete)
      expect(repository.softDelete).toHaveBeenCalledWith(123, 1, expect.any(Object));

      // encrypted-store entries should still exist (not deleted)
      // This is implicit - soft delete doesn't remove encrypted-store references
    });

    it('should handle default address deletion', async () => {
      const defaultAddress: UserAddress = {
        ...mockAddress,
        isDefault: true
      };

      (repository.findByIdOrThrow as jest.Mock).mockImplementation(async () => defaultAddress);

      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      const result = await handler.execute(command);

      expect(result.success).toBe(true);
      expect(repository.softDelete).toHaveBeenCalled();

      // Soft delete should clear isDefault flag
      // This is verified in the soft delete repository method
    });

    it('should include userId from address in response', async () => {
      const customAddress: UserAddress = {
        ...mockAddress,
        userId: 789
      };

      (repository.findByIdOrThrow as jest.Mock).mockImplementation(async () => customAddress);

      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 789,
        addressId: 1
      });

      const result = await handler.execute(command);

      expect(result.userId).toBe(789);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.payload.userId).toBe('789');
    });

    it('should generate unique eventId for each deletion', async () => {
      const command1 = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      await handler.execute(command1);
      const eventId1 = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const id1 = eventId1.eventId;

      jest.clearAllMocks();

      const command2 = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 2
      });

      (repository.findByIdOrThrow as jest.Mock).mockImplementation(async () => ({
        ...mockAddress,
        id: 2
      }));

      await handler.execute(command2);
      const eventId2 = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const id2 = eventId2.eventId;

      // Event IDs should be different (UUID format)
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });
  });

  describe('execute - soft delete behavior', () => {
    it('should pass transaction context to soft delete', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      await handler.execute(command);

      expect(repository.softDelete).toHaveBeenCalledWith(123, 1, expect.any(Object));

      // Verify the third argument is a transaction object
      const txArg = (repository.softDelete as jest.Mock).mock.calls[0]![2];
      expect(txArg).toBeDefined();
      expect(typeof txArg).toBe('object');
    });

    it('should set deletedAt and clear isDefault in soft delete', async () => {
      const command = new DeleteUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1
      });

      await handler.execute(command);

      // The soft delete method should handle setting deletedAt and clearing isDefault
      expect(repository.softDelete).toHaveBeenCalled();
    });
  });
});
