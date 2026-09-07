/**
 * GetDefaultAddressHandler Unit Tests
 *
 * Tests the GetDefaultAddressHandler CQRS query handler.
 * Mocks the UserAddressRepository to isolate handler logic.
 */

import { Test } from '@nestjs/testing';
import { AddressType } from '@package/constants';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { AuditOutboxPublisher } from '../../../../../common/events/audit-outbox.publisher';
import { AddressResponseDto } from '../../../dto';
import { GetDefaultAddressHandler } from '../../../handlers/queries/get-default-address.handler';
import { GetDefaultAddressQuery } from '../../../queries/get-default-address.query';
import { UserAddressRepository } from '../../../repositories/user-address.repository';

import type { DecryptedUserAddress } from '../../../repositories/user-address.repository';
import type { TestingModule } from '@nestjs/testing';
import type { UserAddress } from '@package/db-core';

describe('GetDefaultAddressHandler', () => {
  let handler: GetDefaultAddressHandler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let repository: any;

  const mockAddress: UserAddress = {
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
    isVerified: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: new Date('2099-12-31T00:00:00.000Z')
  };

  const mockDecryptedAddress: DecryptedUserAddress = {
    ...mockAddress,
    decrypted: {
      street: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'United States'
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetDefaultAddressHandler,
        {
          provide: UserAddressRepository,
          useValue: {
            findDefaultByUser: jest.fn(),
            findWithVault: jest.fn()
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

    handler = module.get<GetDefaultAddressHandler>(GetDefaultAddressHandler);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = module.get<UserAddressRepository>(UserAddressRepository) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return null when no default address found', async () => {
      // Arrange
      const query = new GetDefaultAddressQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findDefaultByUser.mockResolvedValue(null);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toBeNull();
      expect(repository.findDefaultByUser).toHaveBeenCalledWith(123, 1);
      expect(repository.findWithVault).not.toHaveBeenCalled();
    });

    it('should fetch with encrypted-store when default address exists', async () => {
      // Arrange
      const query = new GetDefaultAddressQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findDefaultByUser.mockResolvedValue(mockAddress);
      repository.findWithVault.mockResolvedValue(mockDecryptedAddress);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toBeInstanceOf(AddressResponseDto);
      expect(result?.id).toBe(1);
      expect(result?.organizationId).toBe(123);
      expect(result?.userId).toBe(1);
      expect(result?.addressType).toBe(AddressType.Primary);
      expect(result?.isDefault).toBe(true);
      expect(result?.components).toBeDefined();
      expect(result?.components?.street).toBe('123 Main St');
      expect(result?.components?.city).toBe('Springfield');
      expect(repository.findDefaultByUser).toHaveBeenCalledWith(123, 1);
      expect(repository.findWithVault).toHaveBeenCalledWith(123, 1, 1);
    });

    it('should enforce tenant scoping', async () => {
      // Arrange
      const query = new GetDefaultAddressQuery({
        tenantId: 456,
        userId: 2,
        actorId: 2
      });
      repository.findDefaultByUser.mockResolvedValue(mockAddress);
      repository.findWithVault.mockResolvedValue(mockDecryptedAddress);

      // Act
      await handler.execute(query);

      // Assert
      expect(repository.findDefaultByUser).toHaveBeenCalledWith(456, 2);
      expect(repository.findWithVault).toHaveBeenCalledWith(456, mockAddress.id, 2);
      expect(repository.findDefaultByUser).toHaveBeenCalledTimes(1);
    });

    it('should return address without decryption when encrypted-store fetch returns null', async () => {
      // Arrange
      const query = new GetDefaultAddressQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findDefaultByUser.mockResolvedValue(mockAddress);
      repository.findWithVault.mockResolvedValue(null);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toBeInstanceOf(AddressResponseDto);
      expect(result?.id).toBe(1);
      expect(result?.components).toBeUndefined();
      expect(repository.findWithVault).toHaveBeenCalledWith(123, 1, 1);
    });

    it('should not expose PII in errors', async () => {
      // Arrange
      const query = new GetDefaultAddressQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      const error = new Error('Database connection failed');
      repository.findDefaultByUser.mockRejectedValue(error);

      // Act & Assert
      await expect(handler.execute(query)).rejects.toThrow('Database connection failed');
      expect(repository.findDefaultByUser).toHaveBeenCalledWith(123, 1);
    });

    it('should pass actorId to encrypted-store fetch for audit logging', async () => {
      // Arrange
      const query = new GetDefaultAddressQuery({
        tenantId: 123,
        userId: 1,
        actorId: 999
      });
      repository.findDefaultByUser.mockResolvedValue(mockAddress);
      repository.findWithVault.mockResolvedValue(mockDecryptedAddress);

      // Act
      await handler.execute(query);

      // Assert
      expect(repository.findWithVault).toHaveBeenCalledWith(123, mockAddress.id, 999);
    });

    it('should handle address without encrypted-store IDs', async () => {
      // Arrange
      const addressWithoutEncryptedStore: UserAddress = {
        ...mockAddress,
        streetEncryptedStoreId: null,
        cityEncryptedStoreId: null,
        stateEncryptedStoreId: null,
        postalCodeEncryptedStoreId: null,
        countryEncryptedStoreId: null
      };
      const query = new GetDefaultAddressQuery({
        tenantId: 123,
        userId: 1,
        actorId: 1
      });
      repository.findDefaultByUser.mockResolvedValue(addressWithoutEncryptedStore);
      repository.findWithVault.mockResolvedValue(addressWithoutEncryptedStore);

      // Act
      const result = await handler.execute(query);

      // Assert
      expect(result).toBeInstanceOf(AddressResponseDto);
      expect(result?.id).toBe(1);
      expect(repository.findWithVault).toHaveBeenCalledWith(123, addressWithoutEncryptedStore.id, 1);
    });
  });
});
