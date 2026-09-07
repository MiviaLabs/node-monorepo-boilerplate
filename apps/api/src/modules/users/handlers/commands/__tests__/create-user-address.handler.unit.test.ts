/**
 * Unit tests for CreateUserAddressHandler
 *
 * Tests the command handler that creates user addresses with encrypted-store-backed PII storage.
 * Verifies transaction atomicity, authorization, validation, and PII protection.
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
import { CreateUserAddressCommand } from '../../../commands/create-user-address.command';
import { UserAddressEventSchemaVersion, UserAddressEventType } from '../../../events';
import { UserAddressRepository } from '../../../repositories/user-address.repository';
import { CreateUserAddressHandler } from '../create-user-address.handler';

import type { TestingModule } from '@nestjs/testing';
import type { UserAddress } from '@package/db-core';

describe('CreateUserAddressHandler', () => {
  let handler: CreateUserAddressHandler;
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
        insert: jest.fn(() => ({
          values: jest.fn(() => ({
            returning: jest.fn(async () => [mockAddress])
          }))
        })),
        update: jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              returning: jest.fn(async () => [mockAddress])
            }))
          }))
        })),
        execute: jest.fn(async () => ({ rows: [mockAddress] }))
      };
      return callback(mockTx);
    });

    db = {
      transaction: mockTransaction
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateUserAddressHandler,
        {
          provide: UserAddressRepository,
          useValue: {
            createWithVault: jest.fn(async () => mockAddress),
            setDefault: jest.fn(async () => mockAddress)
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

    handler = module.get<CreateUserAddressHandler>(CreateUserAddressHandler);
    repository = module.get(UserAddressRepository);
    outboxRepo = module.get(OutboxRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute - success cases', () => {
    it('should create address with encrypted-store storage', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94105',
          country: 'US'
        }
      });

      const result = await handler.execute(command);

      expect(repository.createWithVault).toHaveBeenCalledWith(
        123,
        456,
        expect.objectContaining({
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94105',
          country: 'US'
        }),
        456,
        expect.any(Object),
        expect.objectContaining({
          addressType: AddressType.Primary,
          label: null,
          countryCode: null
        })
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.userId).toBe(456);
      expect(result.organizationId).toBe(123);
    });

    it('should set default address when isDefault=true', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        isDefault: true,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      await handler.execute(command);

      expect(repository.setDefault).toHaveBeenCalledWith(123, 456, 1, expect.any(Object));
    });

    it('should serialize createdAt when setDefault returns string timestamp', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        isDefault: true,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      (repository.setDefault as jest.Mock).mockResolvedValueOnce({
        ...mockAddress,
        createdAt: '2024-01-01T00:00:00.000Z'
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as {
        payload: { createdAt: string };
      };
      expect(outboxData.payload.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should publish outbox event after creation', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Billing,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        },
        correlationId: 'corr-123',
        causationId: 'cause-123'
      });

      await handler.execute(command);

      expect(outboxRepo.insert).toHaveBeenCalledTimes(1);
      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;

      expect(outboxData.eventType).toBe(UserAddressEventType.USER_ADDRESS_CREATED);
      expect(outboxData.aggregateId).toBe('1');
      expect(outboxData.tenantId).toBe('123');
      expect(outboxData.correlationId).toBe('corr-123');
      expect(outboxData.causationId).toBe('cause-123');
      expect(outboxData.schemaVersion).toBe(UserAddressEventSchemaVersion.V1_0);
    });

    it('should return address response without PII', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Shipping,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
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

    it('should include encrypted-store field names in outbox event', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA'
        }
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as { encryptedStoreFields: string[] };

      // Should include field names, not values
      expect(payload.encryptedStoreFields).toContain('street');
      expect(payload.encryptedStoreFields).toContain('city');
      expect(payload.encryptedStoreFields).toContain('state');

      // Should NOT include actual PII values
      expect(payload.encryptedStoreFields).not.toContain('123 Main St');
      expect(payload.encryptedStoreFields).not.toContain('San Francisco');
      expect(payload.encryptedStoreFields).not.toContain('CA');
    });
  });

  describe('execute - authorization cases', () => {
    it('should allow user to create their own address', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      await expect(handler.execute(command)).resolves.toBeDefined();
    });

    it('should block user from creating address for different user (SEC-001)', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456, // Actor ID
        userId: 789, // Different user ID
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      await expect(handler.execute(command)).rejects.toThrow(ForbiddenException);
      await expect(handler.execute(command)).rejects.toThrow(
        'You can only create addresses for your own account'
      );

      // Verify no encrypted-store storage occurred
      expect(repository.createWithVault).not.toHaveBeenCalled();

      // Verify no outbox event was published
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('execute - validation cases', () => {
    it('should throw error when no components provided', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {}
      });

      await expect(handler.execute(command)).rejects.toThrow(
        Errors.validationvalidationFailedField001({ field: 'components' })
      );

      // Verify no database operations occurred
      expect(repository.createWithVault).not.toHaveBeenCalled();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should throw validation error when components empty', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '',
          city: '   ',
          state: ''
        }
      });

      await expect(handler.execute(command)).rejects.toThrow(
        Errors.validationvalidationFailedField001({ field: 'components' })
      );

      // Verify no database operations occurred
      expect(repository.createWithVault).not.toHaveBeenCalled();
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should accept command with only one valid component', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          city: 'San Francisco'
        }
      });

      await expect(handler.execute(command)).resolves.toBeDefined();
      expect(repository.createWithVault).toHaveBeenCalled();
    });
  });

  describe('execute - transaction error cases', () => {
    it('should rollback transaction on encrypted-store failure', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      (repository.createWithVault as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('encrypted-store service unavailable'))
      );

      await expect(handler.execute(command)).rejects.toThrow('encrypted-store service unavailable');

      // Verify transaction was attempted
      expect(mockTransaction).toHaveBeenCalledTimes(1);

      // Verify outbox was not inserted (transaction rolled back)
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should rollback transaction on database failure', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      // Simulate database error during address creation
      mockTransaction = jest.fn(() => Promise.reject(new Error('Database connection lost')));
      db.transaction = mockTransaction;

      await expect(handler.execute(command)).rejects.toThrow('Database connection lost');

      // Verify outbox was not inserted (transaction rolled back)
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      (repository.createWithVault as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Foreign key constraint violation'))
      );

      await expect(handler.execute(command)).rejects.toThrow('Foreign key constraint violation');

      // Verify outbox was not inserted
      expect(outboxRepo.insert).not.toHaveBeenCalled();
    });
  });

  describe('execute - transaction atomicity', () => {
    it('should execute encrypted-store storage and outbox insert in same transaction', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      const callOrder: string[] = [];

      (repository.createWithVault as jest.Mock).mockImplementation(async () => {
        callOrder.push('encrypted-store-storage');
        return mockAddress;
      });

      (outboxRepo.insert as jest.Mock).mockImplementation(async () => {
        callOrder.push('outbox-insert');
      });

      await handler.execute(command);

      // Verify both operations were called
      expect(repository.createWithVault).toHaveBeenCalled();
      expect(outboxRepo.insert).toHaveBeenCalled();

      // Verify order: encrypted-store storage before outbox
      expect(callOrder[0]).toBe('encrypted-store-storage');
      expect(callOrder[1]).toBe('outbox-insert');
    });

    it('should not insert outbox if encrypted-store storage fails', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      (repository.createWithVault as jest.Mock).mockImplementation(() =>
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

  describe('execute - edge cases', () => {
    it('should handle missing correlationId', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
        // No correlationId
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.correlationId).toBeUndefined();
    });

    it('should handle missing causationId', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        },
        correlationId: 'corr-123'
        // No causationId
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.causationId).toBeUndefined();
      expect(outboxData.correlationId).toBe('corr-123');
    });

    it('should handle default=false explicitly', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        isDefault: false,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      await handler.execute(command);

      // setDefault should not be called when isDefault is false
      expect(repository.setDefault).not.toHaveBeenCalled();
    });

    it('should convert numeric tenantId to string in outbox', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 12345,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          city: 'San Francisco'
        }
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      expect(outboxData.tenantId).toBe('12345');
      expect(typeof outboxData.tenantId).toBe('string');
    });

    it('should handle all address components', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          street2: 'Apt 4B',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94105',
          country: 'US'
        }
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as { encryptedStoreFields: string[] };

      expect(payload.encryptedStoreFields).toEqual([
        'street',
        'street2',
        'city',
        'state',
        'postalCode',
        'country'
      ]);
    });

    it('should filter out empty components from encrypted-store fields', async () => {
      const command = new CreateUserAddressCommand({
        tenantId: 123,
        actorId: 456,
        userId: 456,
        addressType: AddressType.Primary,
        components: {
          street: '123 Main St',
          street2: '',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '',
          country: 'US'
        }
      });

      await handler.execute(command);

      const outboxData = (outboxRepo.insert as jest.Mock).mock.calls[0]![1] as any;
      const payload = outboxData.payload as { encryptedStoreFields: string[] };

      // Should only include non-empty components
      expect(payload.encryptedStoreFields).toContain('street');
      expect(payload.encryptedStoreFields).toContain('city');
      expect(payload.encryptedStoreFields).toContain('state');
      expect(payload.encryptedStoreFields).toContain('country');

      // Should NOT include empty components
      expect(payload.encryptedStoreFields).not.toContain('street2');
      expect(payload.encryptedStoreFields).not.toContain('postalCode');
    });
  });
});
