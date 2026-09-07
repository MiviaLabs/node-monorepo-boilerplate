/**
 * GetUserAddressesHandler Unit Tests
 *
 * Tests the GetUserAddressesHandler CQRS query handler.
 * Mocks the UserAddressRepository to isolate handler logic.
 */

import { Test } from '@nestjs/testing';
import { AddressType } from '@package/constants';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { AddressResponseDto } from '../../../dto';
import { GetUserAddressesHandler } from '../../../handlers/queries/get-user-addresses.handler';
import { GetUserAddressesQuery } from '../../../queries/get-user-addresses.query';
import { UserAddressRepository } from '../../../repositories/user-address.repository';

import type { DecryptedUserAddress } from '../../../repositories/user-address.repository';
import type { TestingModule } from '@nestjs/testing';
import type { UserAddress } from '@package/db-core';

describe('GetUserAddressesHandler', () => {
  let handler: GetUserAddressesHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repository: any;

  const mockAddress1: UserAddress = {
    id: 1,
    organizationId: 123,
    userId: 1,
    addressType: 'primary',
    label: 'Home',
    streetEncryptedStoreId: 100,
    street2EncryptedStoreId: null,
    cityEncryptedStoreId: 101,
    stateEncryptedStoreId: 102,
    postalCodeEncryptedStoreId: 103,
    countryEncryptedStoreId: 104,
    countryCode: 'US',
    isDefault: true,
    isVerified: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: new Date('2099-12-31T00:00:00.000Z')
  };

  const mockAddress2: UserAddress = {
    id: 2,
    organizationId: 123,
    userId: 1,
    addressType: 'billing',
    label: 'Work',
    streetEncryptedStoreId: 200,
    street2EncryptedStoreId: 201,
    cityEncryptedStoreId: 202,
    stateEncryptedStoreId: 203,
    postalCodeEncryptedStoreId: 204,
    countryEncryptedStoreId: 205,
    countryCode: 'US',
    isDefault: false,
    isVerified: false,
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
    deletedAt: new Date('2099-12-31T00:00:00.000Z')
  };

  const mockDecryptedAddress1: DecryptedUserAddress = {
    ...mockAddress1,
    decrypted: {
      street: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'United States'
    }
  };

  const mockDecryptedAddress2: DecryptedUserAddress = {
    ...mockAddress2,
    decrypted: {
      street: '456 Business Blvd',
      street2: 'Suite 100',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
      country: 'United States'
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetUserAddressesHandler,
        {
          provide: UserAddressRepository,
          useValue: {
            findByUserWithVault: jest.fn()
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
          useValue: {}
        }
      ]
    }).compile();

    handler = module.get<GetUserAddressesHandler>(GetUserAddressesHandler);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = module.get<UserAddressRepository>(UserAddressRepository) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return empty array when no addresses found', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findByUserWithVault.mockResolvedValue([]);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toEqual([]);
      expect(repository.findByUserWithVault).toHaveBeenCalledWith(123, 1, 1);
    });

    it('should return all addresses for user', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findByUserWithVault.mockResolvedValue([
        mockDecryptedAddress1,
        mockDecryptedAddress2
      ]);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(AddressResponseDto);
      expect(result[1]).toBeInstanceOf(AddressResponseDto);
      expect(result[0]?.id).toBe(1);
      expect(result[1]?.id).toBe(2);
      expect(result[0]?.isDefault).toBe(true);
      expect(result[1]?.isDefault).toBe(false);
      expect(repository.findByUserWithVault).toHaveBeenCalledWith(123, 1, 1);
    });

    it('should enforce tenant scoping', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 456,
        userId: 2,
        actorId: 2
      });
      repository.findByUserWithVault.mockResolvedValue([]);

      // Act
      await handler.execute(query);

      // Assert
      expect(repository.findByUserWithVault).toHaveBeenCalledWith(456, 2, 2);
      expect(repository.findByUserWithVault).toHaveBeenCalledTimes(1);
    });

    it('should decrypt addresses via encrypted-store', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findByUserWithVault.mockResolvedValue([mockDecryptedAddress1]);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.components).toBeDefined();
      expect(result[0]?.components?.street).toBe('123 Main St');
      expect(result[0]?.components?.city).toBe('Springfield');
      expect(result[0]?.components?.state).toBe('IL');
      expect(result[0]?.components?.postalCode).toBe('62701');
      expect(result[0]?.components?.country).toBe('United States');
    });

    it('should not expose PII in errors', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      const error = new Error('Database connection failed');
      repository.findByUserWithVault.mockRejectedValue(error);

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('Database connection failed');
      expect(repository.findByUserWithVault).toHaveBeenCalledWith(123, 1, 1);
    });

    it('should pass actorId to encrypted-store fetch for audit logging', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 999
      });
      repository.findByUserWithVault.mockResolvedValue([mockDecryptedAddress1]);

      // Act
      await handler.execute(query);

      // Assert
      expect(repository.findByUserWithVault).toHaveBeenCalledWith(123, 1, 999);
    });

    it('should handle multiple addresses with different types', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findByUserWithVault.mockResolvedValue([
        mockDecryptedAddress1,
        mockDecryptedAddress2
      ]);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]?.addressType).toBe(AddressType.Primary);
      expect(result[1]?.addressType).toBe(AddressType.Billing);
      expect(result[0]?.label).toBe('Home');
      expect(result[1]?.label).toBe('Work');
    });

    it('should handle addresses with street2 component', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findByUserWithVault.mockResolvedValue([mockDecryptedAddress2]);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.components?.street).toBe('456 Business Blvd');
      expect(result[0]?.components?.street2).toBe('Suite 100');
    });

    it('should preserve encrypted-store IDs in response', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findByUserWithVault.mockResolvedValue([mockDecryptedAddress1]);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result[0]?.streetEncryptedStoreId).toBe(100);
      expect(result[0]?.cityEncryptedStoreId).toBe(101);
      expect(result[0]?.stateEncryptedStoreId).toBe(102);
      expect(result[0]?.postalCodeEncryptedStoreId).toBe(103);
      expect(result[0]?.countryEncryptedStoreId).toBe(104);
    });

    it('should preserve isVerified and isDefault flags', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findByUserWithVault.mockResolvedValue([
        mockDecryptedAddress1,
        mockDecryptedAddress2
      ]);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result[0]?.isDefault).toBe(true);
      expect(result[0]?.isVerified).toBe(true);
      expect(result[1]?.isDefault).toBe(false);
      expect(result[1]?.isVerified).toBe(false);
    });

    it('should preserve country code in response', async () => {
      // Arrange
      const query = new GetUserAddressesQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findByUserWithVault.mockResolvedValue([mockDecryptedAddress1]);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result[0]?.countryCode).toBe('US');
    });
  });
});
