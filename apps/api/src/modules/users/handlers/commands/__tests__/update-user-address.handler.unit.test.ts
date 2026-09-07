/**
 * Unit tests for UpdateUserAddressHandler
 *
 * Tests the command handler that updates user addresses with encrypted-store-backed PII storage.
 * Verifies transaction atomicity, authorization, partial updates, and PII protection.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */
/* eslint-disable @typescript-eslint/no-explicit-any -- Mock types for testing */

import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressType } from '@package/constants';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { UpdateUserAddressCommand } from '../../../commands/update-user-address.command';
import { UserAddressEventSchemaVersion, UserAddressEventType } from '../../../events';
import { UserAddressRepository } from '../../../repositories/user-address.repository';
import { UpdateUserAddressHandler } from '../update-user-address.handler';

import type { TestingModule } from '@nestjs/testing';
import type { UserAddress } from '@package/db-core';

describe('UpdateUserAddressHandler', () => {
  let handler: UpdateUserAddressHandler;
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

  const updatedAddress: UserAddress = {
    ...mockAddress,
    updatedAt: new Date('2024-01-02T00:00:00.000Z')
  };

  beforeEach(async () => {
    mockTransaction = jest.fn((callback: (tx: any) => Promise<any>) => {
      const mockTx = {
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              returning: jest.fn(async () => [updatedAddress])
            }))
          }))
        })),
        execute: jest.fn(async () => ({ rows: [updatedAddress] }))
      };
      return callback(mockTx);
    });

    db = {
      transaction: mockTransaction
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateUserAddressHandler,
        {
          provide: UserAddressRepository,
          useValue: {
            findByIdOrThrow: jest.fn(async () => mockAddress),
            updateVaultField: jest.fn(async () => updatedAddress),
            updateWithTransaction: jest.fn(async () => updatedAddress),
            setDefault: jest.fn(async () => updatedAddress)
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

    handler = module.get<UpdateUserAddressHandler>(UpdateUserAddressHandler);
    repository = module.get(UserAddressRepository);
    outboxRepo = module.get(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute - success cases', () => {
    it('should update address components in encrypted-store', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles',
          state: 'CA'
        }
      });

      const result = await handler.execute(command);

      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'city',
        'Los Angeles',
        456,
        expect.any(Object)
      );

      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'state',
        'CA',
        456,
        expect.any(Object)
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should update non-PII fields (type, default, verified)', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        addressType: AddressType.Billing,
        isDefault: true,
        isVerified: true
      });

      await handler.execute(command);

      expect(repository.updateWithTransaction).toHaveBeenCalledWith(
        123,
        expect.any(Object),
        1,
        expect.objectContaining({
          addressType: 'billing',
          isDefault: true,
          isVerified: true,
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should publish outbox event with changed fields', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles',
          state: 'CA'
        },
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;

      expect(outboxData.eventType).toBe(UserAddressEventType.USER_ADDRESS_UPDATED);
      expect(outboxData.aggregateId).toBe('1');
      expect(outboxData.tenantId).toBe('123');
      expect(outboxData.correlationId).toBe('corr-123');
      expect(outboxData.causationId).toBe('cause-123');
      expect(outboxData.schemaVersion).toBe(UserAddressEventSchemaVersion.V1_0);
    });

    it('should handle partial updates (only components or only non-PII)', async () => {
      // Test 1: Only PII components
      const command1 = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles'
        }
      });

      await handler.execute(command1);
      expect(repository.updateVaultField).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalled();

      jest.clearAllMocks();

      // Test 2: Only non-PII fields
      const command2 = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        isDefault: true
      });

      await handler.execute(command2);
      expect(repository.updateWithTransaction).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalled();
    });

    it('should handle default address flag change', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        isDefault: true
      });

      await handler.execute(command);

      expect(repository.setDefault).toHaveBeenCalledWith(123, 456, 1, expect.any(Object));
    });
  });

  describe('execute - authorization cases', () => {
    it('should allow user to update their own address', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles'
        }
      });

      await expect(handler.execute(command)).resolves.toBeDefined();
    });

    it('should block user from updating different user address (SEC-001)', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456, // Actor ID
        addressId: 1, // Address belongs to user 456 (from mock)
        components: {}
      });

      // Mock address belongs to user 789
      (repository.findByIdOrThrow as jest.Mock).mockImplementation(async () => ({
        ...mockAddress,
        userId: 789
      }));

      await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
      await expect(handler.execute(command)).rejects.toThrow(
        'You can only modify addresses for your own account'
      );

      // Verify no updates occurred
      expect(repository.updateVaultField).not.toHaveBeenCalled();
      expect(repository.updateWithTransaction).not.toHaveBeenCalled();

      // Verify no outbox event was published
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('execute - error cases', () => {
    it('should throw error when address not found', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 999,
        components: {
          city: 'Los Angeles'
        }
      });

      (repository.findByIdOrThrow as jest.Mock).mockImplementation(() =>
        Promise.reject(Errors.databaserecordNotFound004({ entity: 'UserAddress' }))
      );

      await expect(handler.execute(command)).rejects.toThrow();

      // Verify no updates occurred
      expect(repository.updateVaultField).not.toHaveBeenCalled();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should rollback transaction on encrypted-store failure', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles'
        }
      });

      (repository.updateVaultField as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('encrypted-store service unavailable'))
      );

      await expect(handler.execute(command)).rejects.toThrow('encrypted-store service unavailable');

      // Verify outbox was not inserted (transaction rolled back)
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        isDefault: true
      });

      (repository.updateWithTransaction as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Database constraint violation'))
      );

      await expect(handler.execute(command)).rejects.toThrow('Database constraint violation');

      // Verify outbox was not inserted
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('execute - transaction atomicity', () => {
    it('should execute encrypted-store updates and outbox insert in same transaction', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles',
          state: 'CA'
        }
      });

      const callOrder: string[] = [];

      (repository.updateVaultField as jest.Mock).mockImplementation(async () => {
        callOrder.push('encrypted-store-update');
        return updatedAddress;
      });

      (outboxRepo.insert as jest.Mock).mockImplementation(async () => {
        callOrder.push('outbox-insert');
      });

      await handler.execute(command);

      // Verify both operations were called
      expect(repository.updateVaultField).toHaveBeenCalledTimes(2); // city and state
      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);

      // Verify outbox was called after encrypted-store updates
      const encryptedStoreUpdateCalls = callOrder.filter((c) => c === 'encrypted-store-update');
      const outboxInsertCalls = callOrder.filter((c) => c === 'outbox-insert');
      expect(encryptedStoreUpdateCalls.length).toBe(2);
      expect(outboxInsertCalls.length).toBe(1);
    });

    it('should not insert outbox if encrypted-store update fails', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles'
        }
      });

      (repository.updateVaultField as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('encrypted-store error'))
      );

      try {
        await handler.execute(command);
      } catch {
        // Expected to fail
      }

      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('execute - outbox event validation', () => {
    it('should include only field names in changedFields (not values)', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001'
        }
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as { changedFields: string[] };

      // Should include field names
      expect(payload.changedFields).toContain('city');
      expect(payload.changedFields).toContain('state');
      expect(payload.changedFields).toContain('postalCode');

      // Should NOT include actual PII values
      expect(payload.changedFields).not.toContain('Los Angeles');
      expect(payload.changedFields).not.toContain('CA');
      expect(payload.changedFields).not.toContain('90001');
    });

    it('should include changedNonPiiFields with new values', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        addressType: AddressType.Billing,
        isDefault: true,
        isVerified: false
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as {
        changedNonPiiFields: {
          addressType?: string;
          isDefault?: boolean;
          isVerified?: boolean;
        };
      };

      expect(payload.changedNonPiiFields.addressType).toBe('billing');
      expect(payload.changedNonPiiFields.isDefault).toBe(true);
      expect(payload.changedNonPiiFields.isVerified).toBe(false);
    });

    it('should include updatedBy in outbox event', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles'
        }
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as { updatedBy: string };

      expect(payload.updatedBy).toBe('456');
    });
  });

  describe('execute - edge cases', () => {
    it('should handle empty components update', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        isDefault: true
      });

      await handler.execute(command);

      // Should not call updateVaultField for empty components
      expect(repository.updateVaultField).not.toHaveBeenCalled();

      // Should still update non-PII fields
      expect(repository.updateWithTransaction).toHaveBeenCalled();

      // Should still publish outbox event
      expect(outboxRepo.insert).toHaveBeenCalled();
    });

    it('should handle null values in components', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles',
          street2: null as any,
          postalCode: undefined as any
        }
      });

      await handler.execute(command);

      // Should only update non-null/undefined values
      expect(repository.updateVaultField).toHaveBeenCalledTimes(1);
      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'city',
        'Los Angeles',
        456,
        expect.any(Object)
      );
    });

    it('should handle only addressType update', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        addressType: AddressType.Shipping
      });

      await handler.execute(command);

      expect(repository.updateWithTransaction).toHaveBeenCalledWith(
        123,
        expect.any(Object),
        1,
        expect.objectContaining({
          addressType: 'shipping',
          updatedAt: expect.any(Date)
        })
      );

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as {
        changedFields: string[];
        changedNonPiiFields: { addressType?: string };
      };

      expect(payload.changedFields).toEqual([]);
      expect(payload.changedNonPiiFields.addressType).toBe('shipping');
    });

    it('should handle only isVerified update', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        isVerified: true
      });

      await handler.execute(command);

      expect(repository.updateWithTransaction).toHaveBeenCalledWith(
        123,
        expect.any(Object),
        1,
        expect.objectContaining({
          isVerified: true,
          updatedAt: expect.any(Date)
        })
      );

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as {
        changedFields: string[];
        changedNonPiiFields: { isVerified?: boolean };
      };

      expect(payload.changedFields).toEqual([]);
      expect(payload.changedNonPiiFields.isVerified).toBe(true);
    });

    it('should convert numeric tenantId to string in outbox', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 12345,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles'
        }
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.tenantId).toBe('12345');
      expect(typeof outboxData.tenantId).toBe('string');
    });

    it('should handle missing correlationId and causationId', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles'
        }
        // No correlationId or causationId
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.correlationId).toBeUndefined();
      expect(outboxData.causationId).toBeUndefined();
    });

    it('should handle isDefault=false explicitly', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {},
        isDefault: false
      });

      await handler.execute(command);

      // setDefault should not be called when isDefault is false
      expect(repository.setDefault).not.toHaveBeenCalled();

      // updateWithTransaction should still be called
      expect(repository.updateWithTransaction).toHaveBeenCalled();
    });

    it('should return address metadata without PII', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles'
        }
      });

      const result = await handler.execute(command);

      // Verify no PII in response
      expect(result).not.toHaveProperty('street');
      expect(result).not.toHaveProperty('city');
      expect(result).not.toHaveProperty('state');
      expect(result).not.toHaveProperty('postalCode');
      expect(result).not.toHaveProperty('country');

      // Verify metadata is present
      expect(result.id).toBeDefined();
      expect(result.userId).toBeDefined();
      expect(result.organizationId).toBeDefined();
      expect(result.addressType).toBeDefined();
      expect(result.isDefault).toBeDefined();
      expect(result.isVerified).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });
  });

  describe('execute - update encrypted-store field behavior', () => {
    it('should call updateVaultField for each component', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          street: '456 Oak Ave',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001',
          country: 'US'
        }
      });

      await handler.execute(command);

      expect(repository.updateVaultField).toHaveBeenCalledTimes(5);

      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'street',
        '456 Oak Ave',
        456,
        expect.any(Object)
      );
      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'city',
        'Los Angeles',
        456,
        expect.any(Object)
      );
      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'state',
        'CA',
        456,
        expect.any(Object)
      );
      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'postalCode',
        '90001',
        456,
        expect.any(Object)
      );
      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'country',
        'US',
        456,
        expect.any(Object)
      );
    });

    it('should skip undefined and null component values', async () => {
      const command = new UpdateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        addressId: 1,
        components: {
          city: 'Los Angeles',
          street2: undefined as any,
          postalCode: null as any
        }
      });

      await handler.execute(command);

      // Should only update non-null/undefined values
      expect(repository.updateVaultField).toHaveBeenCalledTimes(1);
      expect(repository.updateVaultField).toHaveBeenCalledWith(
        123,
        1,
        'city',
        'Los Angeles',
        456,
        expect.any(Object)
      );
    });
  });
});
