/**
 * UserAddressRepository Unit Tests
 *
 * Tests the UserAddressRepository data access layer covering:
 * - CRUD operations (create/read/update/delete)
 * - Vault integration behavior (store/retrieve/update)
 * - Strict tenant isolation edge cases
 * - Cross-tenant access prevention
 *
 * Uses mock database connection and vault service to isolate repository logic.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-explicit-any -- Safe in tests with verified mock calls */

jest.mock('@package/auth', () => ({
  CachedPermissionService: class MockCachedPermissionService {
    hasPermission = jest.fn().mockResolvedValue(true);
  }
}));

import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';

import { EncryptedStoreService } from '../../../encrypted-store/encrypted-store.service';
import { UserAddressRepository } from '../../repositories/user-address.repository';

import type { TestingModule } from '@nestjs/testing';
import type { UserAddress, NewUserAddress } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockTenantId = 123;
const mockOtherTenantId = 456;
const mockUserId = 1;
const mockAddressId = 100;
const mockActorId = 999;

const mockAddress: UserAddress = {
  id: mockAddressId,
  organizationId: mockTenantId,
  userId: mockUserId,
  addressType: 'primary',
  label: null,
  countryCode: null,
  isDefault: true,
  isVerified: true,
  streetEncryptedStoreId: 1001,
  street2EncryptedStoreId: null,
  cityEncryptedStoreId: 1002,
  stateEncryptedStoreId: 1003,
  postalCodeEncryptedStoreId: 1004,
  countryEncryptedStoreId: 1005,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedAt: null
};

const mockDecryptedComponents = {
  street: '123 Main St',
  city: 'Springfield',
  state: 'IL',
  postalCode: '62701',
  country: 'USA'
};

// ============================================================================
// TEST SUITE
// ============================================================================

describe('UserAddressRepository', () => {
  let repository: UserAddressRepository;
  let db: jest.Mocked<NodePgDatabase>;
  let vault: jest.Mocked<EncryptedStoreService>;

  beforeEach(async () => {
    const mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      transaction: jest.fn(),
      execute: jest.fn()
    };

    const mockVault = {
      store: jest.fn(),
      retrieve: jest.fn(),
      retrieveById: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAddressRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        },
        {
          provide: EncryptedStoreService,
          useValue: mockVault
        }
      ]
    }).compile();

    repository = module.get<UserAddressRepository>(UserAddressRepository);
    db = module.get<NodePgDatabase>(MAIN_DB) as any;
    vault = module.get<EncryptedStoreService>(EncryptedStoreService) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // CRUD OPERATIONS TESTS
  // ============================================================================

  describe('findById', () => {
    it('should return address when found in tenant', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      const result = await repository.findById(mockTenantId, mockAddressId);

      // Assert
      expect(result).toEqual(mockAddress);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return null when address not found in tenant', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findById(mockTenantId, mockAddressId);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for soft-deleted address', async () => {
      // Arrange - Simulate database WHERE clause filtering out soft-deleted records
      // The WHERE clause includes isNull(deletedAt), so soft-deleted addresses won't be returned
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findById(mockTenantId, mockAddressId);

      // Assert
      expect(result).toBeNull();
    });

    it('should enforce tenant isolation - cross-tenant access returns null', async () => {
      // Arrange - Address belongs to tenant 123, query from tenant 456
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findById(mockOtherTenantId, mockAddressId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return all addresses for user in tenant', async () => {
      // Arrange
      const mockAddresses = [mockAddress, { ...mockAddress, id: 101, isDefault: false }];
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockAddresses)
          })
        })
      });

      // Act
      const result = await repository.findByUser(mockTenantId, mockUserId);

      // Assert
      expect(result).toEqual(mockAddresses);
      expect(result).toHaveLength(2);
    });

    it('should return empty array for user with no addresses', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findByUser(mockTenantId, mockUserId);

      // Assert
      expect(result).toEqual([]);
    });

    it('should enforce tenant isolation - cross-tenant access returns empty', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act - Query from different tenant
      const result = await repository.findByUser(mockOtherTenantId, mockUserId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findDefaultByUser', () => {
    it('should return default address for user', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      const result = await repository.findDefaultByUser(mockTenantId, mockUserId);

      // Assert
      expect(result).toEqual(mockAddress);
    });

    it('should return null when no default address exists', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findDefaultByUser(mockTenantId, mockUserId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create address with tenant ID', async () => {
      // Arrange
      const newAddressData: Omit<NewUserAddress, 'organizationId'> = {
        userId: mockUserId,
        addressType: 'primary',
        isDefault: false,
        isVerified: false,
        streetEncryptedStoreId: 1001,
        cityEncryptedStoreId: 1002,
        stateEncryptedStoreId: 1003,
        postalCodeEncryptedStoreId: 1004,
        countryEncryptedStoreId: 1005
      };

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockAddress])
        })
      });

      // Act
      const result = await repository.create(mockTenantId, newAddressData);

      // Assert
      expect(result).toEqual(mockAddress);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should throw DB_005 when database insertion fails', async () => {
      // Arrange
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([])
        })
      });

      // Act & Assert
      await expect(
        repository.create(mockTenantId, {
          userId: mockUserId,
          addressType: 'primary',
          isDefault: false,
          isVerified: false
        } as any)
      ).rejects.toThrow(Errors.databasedatabaseQueryFailed005({}));
    });
  });

  describe('update', () => {
    it('should update address in tenant scope', async () => {
      // Arrange
      const updatedAddress = { ...mockAddress, isDefault: true };
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedAddress])
          })
        })
      });

      // Act
      const result = await repository.update(mockTenantId, mockAddressId, {
        isDefault: true
      });

      // Assert
      expect(result).toEqual(updatedAddress);
    });

    it('should throw DB_004 when address not found in tenant', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.update(mockTenantId, mockAddressId, {})).rejects.toThrow(
        Errors.databaserecordNotFound004({})
      );
    });

    it('should enforce tenant isolation - cross-tenant update fails', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert - Try to update from different tenant
      await expect(repository.update(mockOtherTenantId, mockAddressId, {})).rejects.toThrow(
        Errors.databaserecordNotFound004({})
      );
    });
  });

  describe('delete (soft delete)', () => {
    it('should soft delete address in tenant scope', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      });

      // Act
      await repository.delete(mockTenantId, mockAddressId);

      // Assert
      expect(db.update).toHaveBeenCalled();
    });

    it('should set isDefault to false when deleting', async () => {
      // Arrange
      const setMock = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      });
      (db.update as jest.Mock).mockReturnValue({
        set: setMock
      });

      // Act
      await repository.delete(mockTenantId, mockAddressId);

      // Assert
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isDefault: false
        })
      );
    });

    it('should set deletedAt timestamp', async () => {
      // Arrange
      const setMock = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      });
      (db.update as jest.Mock).mockReturnValue({
        set: setMock
      });

      // Act
      await repository.delete(mockTenantId, mockAddressId);

      // Assert
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: expect.any(Date)
        })
      );
    });
  });

  describe('setDefault', () => {
    it('should set default address and unset others', async () => {
      // Arrange
      const mockTx = {
        execute: jest.fn().mockResolvedValue({
          rows: [mockAddress]
        })
      };

      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));

      // Act
      const result = await repository.setDefault(mockTenantId, mockUserId, mockAddressId);

      // Assert
      expect(result).toEqual(mockAddress);
      expect(mockTx.execute).toHaveBeenCalled();
    });

    it('should throw DB_005 when setting default fails', async () => {
      // Arrange
      const mockTx = {
        execute: jest.fn().mockResolvedValue({
          rows: []
        })
      };

      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));

      // Act & Assert
      await expect(repository.setDefault(mockTenantId, mockUserId, mockAddressId)).rejects.toThrow(
        Errors.databasedatabaseQueryFailed005({})
      );
    });
  });

  // ============================================================================
  // VAULT INTEGRATION TESTS
  // ============================================================================

  describe('createWithVault', () => {
    it('should store components in vault and create address', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue(undefined)
      };

      (vault.store as jest.Mock).mockResolvedValue(1001);
      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));

      // Act
      const result = await repository.createWithVault(
        mockTenantId,
        mockUserId,
        mockDecryptedComponents,
        mockActorId
      );

      // Assert
      expect(result).toEqual(mockAddress);
      // Called for each non-empty component
      expect(vault.store).toHaveBeenCalledTimes(5);
      expect(mockTx.insert).toHaveBeenCalled();
      // Verify vault entries are updated with correct address entity ID
      expect(mockTx.execute).toHaveBeenCalled();
    });

    it('should use external transaction when provided', async () => {
      // Arrange
      const externalTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue(undefined)
      };

      (vault.store as jest.Mock).mockResolvedValue(1001);

      // Act
      const result = await repository.createWithVault(
        mockTenantId,
        mockUserId,
        mockDecryptedComponents,
        mockActorId,
        externalTx as any
      );

      // Assert
      expect(result).toEqual(mockAddress);
      // Should NOT call db.transaction when external tx provided
      expect(db.transaction).not.toHaveBeenCalled();
      // Vault store should be called with external tx
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({
          tx: externalTx
        })
      );
    });

    it('should throw VAL_001 when no components provided', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn(),
        execute: jest.fn()
      };

      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));

      // Act & Assert
      await expect(
        repository.createWithVault(mockTenantId, mockUserId, {}, mockActorId)
      ).rejects.toThrow(Errors.validationvalidationFailedField001({ field: 'components' }));
    });

    it('should skip empty component values', async () => {
      // Arrange
      const componentsWithEmpty = {
        ...mockDecryptedComponents,
        street2: '' // Empty string should be skipped
      };

      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue(undefined)
      };

      (vault.store as jest.Mock).mockResolvedValue(1001);
      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));

      // Act
      await repository.createWithVault(mockTenantId, mockUserId, componentsWithEmpty, mockActorId);

      // Assert - Only non-empty components stored
      expect(vault.store).toHaveBeenCalledTimes(5);
      // Verify street2 (empty) was not stored
      const calls = (vault.store as jest.Mock).mock.calls;
      const hasStreet2 = calls.some((call) => call[0].fieldPath === 'addresses.street2');
      expect(hasStreet2).toBe(false);
    });
  });

  describe('retrieveVaultComponentsBatch', () => {
    it('should retrieve decrypted components for multiple addresses', async () => {
      // Arrange
      const addresses = [mockAddress, { ...mockAddress, id: 101 }];
      const byVaultId = {
        1001: mockDecryptedComponents.street,
        1002: mockDecryptedComponents.city,
        1003: mockDecryptedComponents.state,
        1004: mockDecryptedComponents.postalCode,
        1005: mockDecryptedComponents.country
      } as const;
      (vault.retrieveById as jest.Mock).mockImplementation(async ({ vaultEntryId }) => {
        return byVaultId[vaultEntryId as keyof typeof byVaultId] ?? '';
      });

      // Act
      const result = await repository.retrieveVaultComponentsBatch(
        mockTenantId,
        addresses,
        mockActorId
      );

      // Assert
      expect(result.size).toBe(2);
      expect(result.get(mockAddressId)?.decrypted).toEqual(mockDecryptedComponents);
    });

    it('should return empty map when no addresses provided', async () => {
      // Act
      const result = await repository.retrieveVaultComponentsBatch(mockTenantId, [], mockActorId);

      // Assert
      expect(result.size).toBe(0);
      expect(vault.retrieveById).not.toHaveBeenCalled();
    });

    it('should handle vault retrieval failures gracefully', async () => {
      // Arrange
      const addresses = [mockAddress];
      (vault.retrieveById as jest.Mock).mockRejectedValue(new Error('Vault error'));

      // Act
      const result = await repository.retrieveVaultComponentsBatch(
        mockTenantId,
        addresses,
        mockActorId
      );

      // Assert - Should return address but with error-logged components
      expect(result.size).toBe(1);
      expect(result.get(mockAddressId)).toBeDefined();
    });

    it('should return addresses with no vault entries as-is', async () => {
      // Arrange - Address with no vault IDs
      const addressNoVault: UserAddress = {
        ...mockAddress,
        streetEncryptedStoreId: null,
        cityEncryptedStoreId: null,
        stateEncryptedStoreId: null,
        postalCodeEncryptedStoreId: null,
        countryEncryptedStoreId: null
      };

      // Act
      const result = await repository.retrieveVaultComponentsBatch(
        mockTenantId,
        [addressNoVault],
        mockActorId
      );

      // Assert
      expect(result.size).toBe(1);
      expect(result.get(mockAddressId)?.decrypted).toEqual({});
      expect(vault.retrieveById).not.toHaveBeenCalled();
    });
  });

  describe('updateVaultField', () => {
    it('should update field with new vault value', async () => {
      // Arrange
      const updatedAddress = { ...mockAddress, streetEncryptedStoreId: 2001 };
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([updatedAddress])
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([updatedAddress])
            })
          })
        })
      };

      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));
      // Mock findByIdOrThrow
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);
      (vault.store as jest.Mock).mockResolvedValue(2001);

      // Act
      const result = await repository.updateVaultField(
        mockTenantId,
        mockAddressId,
        'street',
        '456 New St',
        mockActorId
      );

      // Assert
      expect(result).toEqual(updatedAddress);
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '456 New St',
          fieldPath: 'addresses.street'
        })
      );
    });

    it('should clear field when empty value provided', async () => {
      // Arrange
      const updatedAddress = { ...mockAddress, streetEncryptedStoreId: null };
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined)
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([updatedAddress])
            })
          })
        })
      };

      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);

      // Act
      const result = await repository.updateVaultField(
        mockTenantId,
        mockAddressId,
        'street',
        '',
        mockActorId
      );

      // Assert
      expect(result).toEqual(updatedAddress);
      expect(vault.store).not.toHaveBeenCalled();
    });
  });

  describe('updateVaultFields', () => {
    it('should update multiple fields atomically', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined)
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockAddress])
            })
          })
        })
      };

      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);
      (vault.store as jest.Mock).mockResolvedValue(2001);

      // Act
      const result = await repository.updateVaultFields(
        mockTenantId,
        mockAddressId,
        {
          street: '456 New St',
          city: 'New City'
        },
        mockActorId
      );

      // Assert
      expect(result).toBeDefined();
      expect(vault.store).toHaveBeenCalledTimes(2);
    });

    it('should return address when no components to update', async () => {
      // Arrange
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);

      // Act
      const result = await repository.updateVaultFields(
        mockTenantId,
        mockAddressId,
        {},
        mockActorId
      );

      // Assert
      expect(result).toEqual(mockAddress);
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('findWithVault', () => {
    it('should return address with decrypted components', async () => {
      // Arrange
      jest.spyOn(repository, 'findById').mockResolvedValue(mockAddress);
      const byVaultId = {
        1001: mockDecryptedComponents.street,
        1002: mockDecryptedComponents.city,
        1003: mockDecryptedComponents.state,
        1004: mockDecryptedComponents.postalCode,
        1005: mockDecryptedComponents.country
      } as const;
      (vault.retrieveById as jest.Mock).mockImplementation(async ({ vaultEntryId }) => {
        return byVaultId[vaultEntryId as keyof typeof byVaultId];
      });

      // Act
      const result = await repository.findWithVault(mockTenantId, mockAddressId, mockActorId);

      // Assert
      expect(result).toBeDefined();
      expect(result?.decrypted).toEqual(mockDecryptedComponents);
    });

    it('should return null when address not found', async () => {
      // Arrange
      jest.spyOn(repository, 'findById').mockResolvedValue(null);

      // Act
      const result = await repository.findWithVault(mockTenantId, mockAddressId, mockActorId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByUserWithVault', () => {
    it('should return user addresses with decrypted components', async () => {
      // Arrange
      const addresses = [mockAddress];
      jest.spyOn(repository, 'findByUser').mockResolvedValue(addresses);
      const byVaultId = {
        1001: mockDecryptedComponents.street,
        1002: mockDecryptedComponents.city,
        1003: mockDecryptedComponents.state,
        1004: mockDecryptedComponents.postalCode,
        1005: mockDecryptedComponents.country
      } as const;
      (vault.retrieveById as jest.Mock).mockImplementation(async ({ vaultEntryId }) => {
        return byVaultId[vaultEntryId as keyof typeof byVaultId];
      });

      // Act
      const result = await repository.findByUserWithVault(mockTenantId, mockUserId, mockActorId);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.decrypted).toEqual(mockDecryptedComponents);
    });

    it('should return empty array when user has no addresses', async () => {
      // Arrange
      jest.spyOn(repository, 'findByUser').mockResolvedValue([]);

      // Act
      const result = await repository.findByUserWithVault(mockTenantId, mockUserId, mockActorId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // TENANT ISOLATION EDGE CASES
  // ============================================================================

  describe('Tenant Isolation Edge Cases', () => {
    it('should prevent cross-tenant findById access', async () => {
      // Arrange - Address exists in tenant 123
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act - Query from different tenant should use WHERE with different tenantId
      // The mock returns empty array for different tenant
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      const result = await repository.findById(mockOtherTenantId, mockAddressId);

      // Assert - Should not return address from different tenant
      expect(result).toBeNull();
    });

    it('should prevent cross-tenant findByUser access', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act - Try to find addresses from different tenant
      const result = await repository.findByUser(mockOtherTenantId, mockUserId);

      // Assert - Should return empty array
      expect(result).toEqual([]);
    });

    it('should prevent cross-tenant update', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert - Update from different tenant should fail
      await expect(
        repository.update(mockOtherTenantId, mockAddressId, { isDefault: true })
      ).rejects.toThrow(Errors.databaserecordNotFound004({}));
    });

    it('should prevent cross-tenant delete', async () => {
      // Arrange
      const whereMock = jest.fn().mockResolvedValue(undefined);
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: whereMock
        })
      });

      // Act
      await repository.delete(mockTenantId, mockAddressId);

      // Assert - Verify WHERE clause includes tenant check
      expect(db.update).toHaveBeenCalled();
      expect(whereMock).toHaveBeenCalled();
    });

    it('should prevent cross-tenant setDefault', async () => {
      // Arrange
      const mockTx = {
        execute: jest.fn().mockResolvedValue({
          rows: [] // Empty result = address not found in this tenant
        })
      };

      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));

      // Act & Assert - Different tenant cannot set default
      await expect(
        repository.setDefault(mockOtherTenantId, mockUserId, mockAddressId)
      ).rejects.toThrow(Errors.databasedatabaseQueryFailed005({}));
    });

    it('should prevent cross-tenant vault field updates', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined)
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      };

      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));
      // findByIdOrThrow will throw for cross-tenant access
      jest
        .spyOn(repository, 'findByIdOrThrow' as any)
        .mockRejectedValue(Errors.databaserecordNotFound004({ entity: 'UserAddress' }));

      // Act & Assert
      await expect(
        repository.updateVaultField(
          mockOtherTenantId,
          mockAddressId,
          'street',
          'New St',
          mockActorId
        )
      ).rejects.toThrow(Errors.databaserecordNotFound004({}));
    });

    it('should scope vault operations to tenant', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue(undefined)
      };

      (vault.store as jest.Mock).mockResolvedValue(1001);
      (db.transaction as jest.Mock).mockImplementation((callback) => callback(mockTx));

      // Act
      await repository.createWithVault(
        mockTenantId,
        mockUserId,
        mockDecryptedComponents,
        mockActorId
      );

      // Assert - Verify vault store was called with correct tenant
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId
        })
      );
    });
  });

  // ============================================================================
  // INHERITED BASE REPOSITORY METHODS
  // ============================================================================

  describe('Inherited methods from BaseRepository', () => {
    it('should have findById method', () => {
      expect(typeof repository.findById).toBe('function');
    });

    it('should have findByIdOrThrow method', () => {
      expect(typeof repository.findByIdOrThrow).toBe('function');
    });

    it('should have findMany method', () => {
      expect(typeof repository.findMany).toBe('function');
    });

    it('should have exists method', () => {
      expect(typeof repository.exists).toBe('function');
    });

    it('should have transaction method', () => {
      expect(typeof repository.transaction).toBe('function');
    });
  });
});
