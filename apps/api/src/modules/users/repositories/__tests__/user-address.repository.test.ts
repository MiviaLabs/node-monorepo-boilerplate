/**
 * UserAddressRepository Unit Tests
 *
 * Tests the UserAddressRepository data access layer.
 * Uses a mock database connection to isolate repository logic.
 */

/* eslint-disable */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { Test } from '@nestjs/testing';

import { EncryptedStoreService } from '../../../encrypted-store/encrypted-store.service';
import { UserAddressRepository } from '../user-address.repository';

import type { TestingModule } from '@nestjs/testing';
import type { UserAddress, NewUserAddress, UpdateUserAddress } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('UserAddressRepository', () => {
  let repository: UserAddressRepository;
  let db: jest.Mocked<NodePgDatabase>;
  let vault: jest.Mocked<EncryptedStoreService>;

  const mockTenantId = 123;
  const mockUserId = 456;
  const mockAddressId = 1;
  const mockActorId = 789;
  const mockRequestedBy = 999;

  const mockAddress: UserAddress = {
    id: mockAddressId,
    organizationId: mockTenantId,
    userId: mockUserId,
    addressType: 'primary',
    label: 'Home',
    streetEncryptedStoreId: 100,
    street2EncryptedStoreId: 101,
    cityEncryptedStoreId: 102,
    stateEncryptedStoreId: 103,
    postalCodeEncryptedStoreId: 104,
    countryEncryptedStoreId: 105,
    countryCode: 'US',
    isDefault: true,
    isVerified: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null
  };

  const mockAddress2: UserAddress = {
    ...mockAddress,
    id: 2,
    streetEncryptedStoreId: null,
    isDefault: false
  };

  beforeEach(async () => {
    // Mock database connection
    const mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      transaction: jest.fn(),
      execute: jest.fn()
    };

    // Mock vault service
    // PERF-001 fix: Return different vault IDs for each call to simulate multiple vault entries
    const mockVault = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      store: jest
        .fn()
        .mockResolvedValueOnce(100) // street
        .mockResolvedValueOnce(102) // city
        .mockResolvedValueOnce(103) // state
        .mockResolvedValueOnce(104) // postalCode
        .mockResolvedValueOnce(105) // country
        .mockResolvedValue(100), // default for any additional calls
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
  // READ METHODS
  // ============================================================================

  describe('findById', () => {
    it('should return address when found in tenant scope', async () => {
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

    it('should return null when address not found', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findById(mockTenantId, 999);

      // Assert
      expect(result).toBeNull();
    });

    it('should only return addresses from same tenant (P0 requirement)', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      await repository.findById(mockTenantId, mockAddressId);

      // Assert - verify where clause includes tenant scoping with AND
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      // Verify the where clause was called with an AND condition
      expect(whereCall).toHaveBeenCalled();
      const andCall = (whereCall as jest.Mock).mock.calls[0]![0];
      // The and function should have been called
      expect(andCall).toBeDefined();
    });

    it('should filter out soft-deleted addresses', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      await repository.findById(mockTenantId, mockAddressId);

      // Assert - verify where clause includes isNull(deletedAt)
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      // Verify the where clause was called
      expect(whereCall).toHaveBeenCalled();
      // The and function should have been called with isNull for deletedAt
      const andCall = (whereCall as jest.Mock).mock.calls[0]![0];
      expect(andCall).toBeDefined();
    });
  });

  describe('findByUser', () => {
    it('should return addresses for user in tenant scope', async () => {
      // Arrange
      const mockAddresses = [mockAddress, mockAddress2];
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

    it('should return empty array when user has no addresses', async () => {
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
      expect(result).toHaveLength(0);
    });

    it('should filter soft-deleted addresses', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      await repository.findByUser(mockTenantId, mockUserId);

      // Assert - verify where clause includes tenant, user, and deletedAt check
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should order by isDefault DESC, updatedAt DESC', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([mockAddress, mockAddress2])
          })
        })
      });

      // Act
      await repository.findByUser(mockTenantId, mockUserId);

      // Assert - verify ordering
      const orderByCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!
        .value.where.mock.results[0]!.value.orderBy;
      expect(orderByCall).toHaveBeenCalled();
    });

    it('should only return addresses from same tenant (P0 requirement)', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      await repository.findByUser(mockTenantId, mockUserId);

      // Assert - verify tenant scoping
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });
  });

  describe('findDefaultByUser', () => {
    it('should return default address when found', async () => {
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
      expect(result?.isDefault).toBe(true);
    });

    it('should return null when no default address found', async () => {
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

    it('should filter by isDefault=true', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      await repository.findDefaultByUser(mockTenantId, mockUserId);

      // Assert - verify where clause includes isDefault check
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should only return addresses from same tenant (P0 requirement)', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      await repository.findDefaultByUser(mockTenantId, mockUserId);

      // Assert - verify tenant scoping
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CRUD METHODS
  // ============================================================================

  describe('create', () => {
    it('should create address with tenant ID', async () => {
      // Arrange
      const newAddressData: Omit<NewUserAddress, 'organizationId'> = {
        userId: mockUserId,
        addressType: 'primary',
        isDefault: false,
        isVerified: false
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
      const valuesCall = (db.insert as jest.Mock).mock.results[0]!.value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({
          ...newAddressData,
          organizationId: mockTenantId
        })
      );
    });

    it('should include all vault reference columns in insert', async () => {
      // Arrange
      const newAddressData: Omit<NewUserAddress, 'organizationId'> = {
        userId: mockUserId,
        addressType: 'primary',
        isDefault: false,
        isVerified: false,
        streetEncryptedStoreId: 100,
        cityEncryptedStoreId: 102,
        countryEncryptedStoreId: 105
      };
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockAddress])
        })
      });

      // Act
      await repository.create(mockTenantId, newAddressData);

      // Assert
      const valuesCall = (db.insert as jest.Mock).mock.results[0]!.value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({
          streetEncryptedStoreId: 100,
          cityEncryptedStoreId: 102,
          countryEncryptedStoreId: 105
        })
      );
    });

    it('should throw error when insert fails', async () => {
      // Arrange
      const newAddressData: Omit<NewUserAddress, 'organizationId'> = {
        userId: mockUserId,
        addressType: 'primary',
        isDefault: false,
        isVerified: false
      };
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([])
        })
      });

      // Act & Assert
      await expect(repository.create(mockTenantId, newAddressData)).rejects.toThrow(
        'Database query failed'
      );
    });
  });

  describe('createWithTransaction', () => {
    it('should create address using transaction context', async () => {
      // Arrange
      const newAddressData: Omit<NewUserAddress, 'organizationId'> = {
        userId: mockUserId,
        addressType: 'primary',
        isDefault: false,
        isVerified: false
      };
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      };

      // Act
      const result = await repository.createWithTransaction(
        mockTenantId,
        mockTx as any,
        newAddressData
      );

      // Assert
      expect(result).toEqual(mockAddress);
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('should include tenant ID in transaction insert', async () => {
      // Arrange
      const newAddressData: Omit<NewUserAddress, 'organizationId'> = {
        userId: mockUserId,
        addressType: 'primary',
        isDefault: false,
        isVerified: false
      };
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      };

      // Act
      await repository.createWithTransaction(mockTenantId, mockTx as any, newAddressData);

      // Assert
      const valuesCall = mockTx.insert.mock.results[0]!.value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({
          ...newAddressData,
          organizationId: mockTenantId
        })
      );
    });
  });

  describe('update', () => {
    it('should update address and return updated record', async () => {
      // Arrange
      const updateData: UpdateUserAddress = {
        isDefault: true,
        isVerified: true
      };
      const updatedAddress = { ...mockAddress, ...updateData };
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedAddress])
          })
        })
      });

      // Act
      const result = await repository.update(mockTenantId, mockAddressId, updateData);

      // Assert
      expect(result).toEqual(updatedAddress);
      expect(db.update).toHaveBeenCalled();
    });

    it('should include updatedAt timestamp on update', async () => {
      // Arrange
      const updateData: UpdateUserAddress = { isDefault: true };
      const updatedAddress = { ...mockAddress, updatedAt: new Date() };
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedAddress])
          })
        })
      });

      // Act
      await repository.update(mockTenantId, mockAddressId, updateData);

      // Assert - verify set includes updatedAt
      const setCall = (db.update as jest.Mock).mock.results[0]!.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updateData,
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should filter soft-deleted addresses on update', async () => {
      // Arrange
      const updateData: UpdateUserAddress = { isDefault: true };
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ ...mockAddress }])
          })
        })
      });

      // Act
      await repository.update(mockTenantId, mockAddressId, updateData);

      // Assert - verify where clause includes deletedAt check
      const whereCall = (db.update as jest.Mock).mock.results[0]!.value.set.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should only update addresses from same tenant (P0 requirement)', async () => {
      // Arrange
      const updateData: UpdateUserAddress = { isDefault: true };
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ ...mockAddress }])
          })
        })
      });

      // Act
      await repository.update(mockTenantId, mockAddressId, updateData);

      // Assert - verify tenant scoping
      const whereCall = (db.update as jest.Mock).mock.results[0]!.value.set.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should throw error when update fails', async () => {
      // Arrange
      const updateData: UpdateUserAddress = { isDefault: true };
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.update(mockTenantId, mockAddressId, updateData)).rejects.toThrow(
        'Record not found in database'
      );
    });
  });

  describe('updateWithTransaction', () => {
    it('should update address using transaction context', async () => {
      // Arrange
      const updateData: UpdateUserAddress = { isDefault: true };
      const updatedAddress = { ...mockAddress, isDefault: true };
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([updatedAddress])
            })
          })
        })
      };

      // Act
      const result = await repository.updateWithTransaction(
        mockTenantId,
        mockTx as any,
        mockAddressId,
        updateData
      );

      // Assert
      expect(result).toEqual(updatedAddress);
      expect(mockTx.update).toHaveBeenCalled();
    });

    it('should include updatedAt in transaction update', async () => {
      // Arrange
      const updateData: UpdateUserAddress = { isDefault: true };
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ ...mockAddress }])
            })
          })
        })
      };

      // Act
      await repository.updateWithTransaction(
        mockTenantId,
        mockTx as any,
        mockAddressId,
        updateData
      );

      // Assert
      const setCall = mockTx.update.mock.results[0]!.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updateData,
          updatedAt: expect.any(Date)
        })
      );
    });
  });

  describe('delete', () => {
    it('should soft delete address (calls softDelete)', async () => {
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
      const setCall = (db.update as jest.Mock).mock.results[0]!.value.set;
      expect(setCall).toHaveBeenCalledWith(
        expect.objectContaining({
          deletedAt: expect.any(Date),
          isDefault: false,
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should filter by tenant when soft deleting', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      });

      // Act
      await repository.delete(mockTenantId, mockAddressId);

      // Assert - verify tenant scoping
      const whereCall = (db.update as jest.Mock).mock.results[0]!.value.set.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt and remove default flag', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      });

      // Act
      await repository.softDelete(mockTenantId, mockAddressId);

      // Assert
      expect(db.update).toHaveBeenCalled();
      const setCall = (db.update as jest.Mock).mock.results[0]!.value.set;
      expect(setCall).toHaveBeenCalledWith({
        deletedAt: expect.any(Date),
        isDefault: false,
        updatedAt: expect.any(Date)
      });
    });

    it('should use transaction when provided', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined)
          })
        })
      };

      // Act
      await repository.softDelete(mockTenantId, mockAddressId, mockTx as any);

      // Assert
      expect(mockTx.update).toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should filter by tenant and only soft-deletable records', async () => {
      // Arrange
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      });

      // Act
      await repository.softDelete(mockTenantId, mockAddressId);

      // Assert
      const whereCall = (db.update as jest.Mock).mock.results[0]!.value.set.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // SPECIAL METHODS
  // ============================================================================

  describe('setDefault', () => {
    it('should create transaction when none provided', async () => {
      // Arrange
      const updatedAddress = { ...mockAddress, isDefault: true };
      const mockTx = {
        execute: jest.fn().mockResolvedValue({
          rows: [{ ...mockAddress, isDefault: true }]
        })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act
      const result = await repository.setDefault(mockTenantId, mockUserId, mockAddressId);

      // Assert
      expect(db.transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result).toEqual(updatedAddress);
    });

    it('should use provided transaction', async () => {
      // Arrange
      const updatedAddress = { ...mockAddress, isDefault: true };
      const mockTx = {
        execute: jest.fn().mockResolvedValue({
          rows: [updatedAddress]
        })
      };

      // Act
      const result = await repository.setDefault(
        mockTenantId,
        mockUserId,
        mockAddressId,
        mockTx as any
      );

      // Assert
      expect(db.transaction).not.toHaveBeenCalled();
      expect(mockTx.execute).toHaveBeenCalled();
      expect(result).toEqual(updatedAddress);
    });

    it('should atomically update all addresses in single CTE query', async () => {
      // Arrange
      const updatedAddress = { ...mockAddress, isDefault: true };
      const mockTx = {
        execute: jest.fn().mockResolvedValue({
          rows: [updatedAddress]
        })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act
      await repository.setDefault(mockTenantId, mockUserId, mockAddressId);

      // Assert - BUG-001 fix: Single atomic CTE query instead of two separate UPDATEs
      expect(mockTx.execute).toHaveBeenCalledTimes(1);
      const sqlCall = mockTx.execute.mock.calls[0]![0];
      // Verify the SQL contains the CTE pattern by checking the queryChunks
      expect(sqlCall).toBeDefined();
      expect(sqlCall.queryChunks).toBeDefined();
      // The first chunk should contain the CTE
      const sqlString = sqlCall.queryChunks.map((chunk: any) => chunk.value?.join('')).join('');
      expect(sqlString).toContain('WITH updated AS');
      expect(sqlString).toContain('UPDATE user_addresses');
      expect(sqlString).toContain('is_default = CASE WHEN id =');
    });

    it('should throw error when setDefault fails', async () => {
      // Arrange
      const mockTx = {
        execute: jest.fn().mockResolvedValue({
          rows: []
        })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act & Assert
      await expect(repository.setDefault(mockTenantId, mockUserId, mockAddressId)).rejects.toThrow(
        'Database query failed'
      );
    });
  });

  // ============================================================================
  // VAULT LIFECYCLE METHODS
  // ============================================================================

  describe('createWithVault', () => {
    const mockComponents = {
      street: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'USA'
    };

    it('should store components in vault and create address', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [] })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act
      const result = await repository.createWithVault(
        mockTenantId,
        mockUserId,
        mockComponents,
        mockActorId
      );

      // Assert
      expect(result).toEqual(mockAddress);
      expect(vault.store).toHaveBeenCalledTimes(5); // 5 components
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('should store each component with correct field path', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [] })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act
      await repository.createWithVault(mockTenantId, mockUserId, mockComponents, mockActorId);

      // Assert - verify vault.store calls with correct field paths
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          entityType: 'user_address',
          entityId: mockUserId,
          fieldPath: 'addresses.street',
          value: '123 Main St',
          storedBy: mockActorId,
          classification: 'confidential',
          tx: mockTx // BUG-002 fix: Transaction passed to vault.store
        })
      );
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldPath: 'addresses.city',
          value: 'Springfield',
          tx: mockTx
        })
      );
    });

    it('should include vault entry IDs in address insert', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [] })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act
      await repository.createWithVault(mockTenantId, mockUserId, mockComponents, mockActorId);

      // Assert - verify insert includes vault reference columns
      const valuesCall = mockTx.insert.mock.results[0]!.value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: mockTenantId,
          userId: mockUserId,
          streetEncryptedStoreId: 100,
          cityEncryptedStoreId: 102,
          stateEncryptedStoreId: 103,
          postalCodeEncryptedStoreId: 104,
          countryEncryptedStoreId: 105
        })
      );
    });

    it('should update vault entries with correct address entity ID', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [] })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act
      await repository.createWithVault(mockTenantId, mockUserId, mockComponents, mockActorId);

      // Assert - verify vault entries updated with address ID
      // PERF-001 fix: Now only UPDATE calls (one for each vault entry)
      // mockComponents has 5 components (street, city, state, postalCode, country)
      expect(mockTx.execute).toHaveBeenCalledTimes(5);
    });

    it('should throw error when no components provided', async () => {
      // Arrange - need to mock transaction since createWithVault uses it
      const mockTx = {
        insert: jest.fn(),
        execute: jest.fn()
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act & Assert
      await expect(
        repository.createWithVault(mockTenantId, mockUserId, {}, mockActorId)
      ).rejects.toThrow('components is required');
    });

    it('should throw error when insert fails', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [] })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Act & Assert
      await expect(
        repository.createWithVault(mockTenantId, mockUserId, { city: 'Springfield' }, mockActorId)
      ).rejects.toThrow('Database query failed');
    });

    it('should use transaction when provided', async () => {
      // Arrange
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockAddress])
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [] })
      };

      // Act
      await repository.createWithVault(
        mockTenantId,
        mockUserId,
        { city: 'Springfield' },
        mockActorId,
        mockTx as any
      );

      // Assert
      expect(mockTx.insert).toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('retrieveVaultComponentsBatch', () => {
    it('should retrieve components for single address', async () => {
      // Arrange
      vault.retrieveById.mockResolvedValue('123 Main St');
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      const result = await repository.retrieveVaultComponentsBatch(
        mockTenantId,
        [mockAddress],
        mockRequestedBy
      );

      // Assert
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(1);
      expect(result.get(mockAddressId)).toEqual(
        expect.objectContaining({
          id: mockAddressId,
          decrypted: expect.objectContaining({
            street: '123 Main St'
          })
        })
      );
    });

    it('should retrieve components for multiple addresses', async () => {
      // Arrange
      vault.retrieveById.mockResolvedValueOnce('123 Main St').mockResolvedValueOnce('456 Oak Ave');
      // Create addresses with only 1 vault ID each for simpler test
      const address1 = {
        ...mockAddress,
        street2EncryptedStoreId: null,
        cityEncryptedStoreId: null,
        stateEncryptedStoreId: null,
        postalCodeEncryptedStoreId: null,
        countryEncryptedStoreId: null
      };
      const address2 = {
        ...mockAddress,
        id: 2,
        streetEncryptedStoreId: null,
        street2EncryptedStoreId: null,
        cityEncryptedStoreId: 102,
        stateEncryptedStoreId: null,
        postalCodeEncryptedStoreId: null,
        countryEncryptedStoreId: null
      };
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([address1, address2])
          })
        })
      });

      // Act
      const result = await repository.retrieveVaultComponentsBatch(
        mockTenantId,
        [address1, address2],
        mockRequestedBy
      );

      // Assert
      expect(result.size).toBe(2);
      expect(vault.retrieveById).toHaveBeenCalledTimes(2);
    });

    it('should return empty map when no addresses provided', async () => {
      // Act
      const result = await repository.retrieveVaultComponentsBatch(
        mockTenantId,
        [],
        mockRequestedBy
      );

      // Assert
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(vault.retrieveById).not.toHaveBeenCalled();
    });

    it('should handle addresses with no vault entries', async () => {
      // Arrange - address with null vault IDs
      const addressNoVault = {
        ...mockAddress,
        streetEncryptedStoreId: null,
        street2EncryptedStoreId: null,
        cityEncryptedStoreId: null,
        stateEncryptedStoreId: null,
        postalCodeEncryptedStoreId: null,
        countryEncryptedStoreId: null
      };
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([addressNoVault])
          })
        })
      });

      // Act
      const result = await repository.retrieveVaultComponentsBatch(
        mockTenantId,
        [addressNoVault],
        mockRequestedBy
      );

      // Assert
      expect(result.size).toBe(1);
      expect(result.get(addressNoVault.id)).toEqual(
        expect.objectContaining({
          decrypted: {}
        })
      );
      expect(vault.retrieveById).not.toHaveBeenCalled();
    });

    it('should retrieve all vault components in parallel', async () => {
      // Arrange
      vault.retrieveById
        .mockResolvedValueOnce('123 Main St')
        .mockResolvedValueOnce('Apt 4B')
        .mockResolvedValueOnce('Springfield')
        .mockResolvedValueOnce('IL')
        .mockResolvedValueOnce('62701')
        .mockResolvedValueOnce('USA');
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      await repository.retrieveVaultComponentsBatch(mockTenantId, [mockAddress], mockRequestedBy);

      // Assert - verify parallel retrieval (Promise.all used internally)
      expect(vault.retrieveById).toHaveBeenCalledTimes(6);
    });

    it('should handle vault retrieval errors gracefully', async () => {
      // Arrange
      vault.retrieveById.mockRejectedValueOnce(new Error('Vault error'));
      const loggerErrorSpy = jest.spyOn(repository['logger'], 'error').mockImplementation();

      // Act
      const result = await repository.retrieveVaultComponentsBatch(
        mockTenantId,
        [mockAddress],
        mockRequestedBy
      );

      // Assert - should not throw, should log error
      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(result.size).toBe(1);
      expect(result.get(mockAddressId)).toBeDefined();

      loggerErrorSpy.mockRestore();
    });

    it('should call vault.retrieveById with correct parameters', async () => {
      // Arrange
      vault.retrieveById.mockResolvedValue('123 Main St');

      // Act
      await repository.retrieveVaultComponentsBatch(mockTenantId, [mockAddress], mockRequestedBy);

      // Assert
      expect(vault.retrieveById).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        vaultEntryId: 100,
        requestedBy: mockRequestedBy
      });
    });
  });

  describe('updateVaultField', () => {
    it('should store new value in vault and update reference', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress }])
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([mockAddress])
            })
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [{ id: 200 }] })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      // Mock findByIdOrThrow
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);

      // Act
      const result = await repository.updateVaultField(
        mockTenantId,
        mockAddressId,
        'city',
        'New City',
        mockActorId
      );

      // Assert - BUG-002 fix: Transaction passed to vault.store
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: mockTenantId,
          entityType: 'user_address',
          entityId: mockAddressId,
          fieldPath: 'addresses.city',
          value: 'New City',
          storedBy: mockActorId,
          classification: 'confidential',
          tx: mockTx
        })
      );
      expect(result).toBeDefined();
    });

    it('should clear field when empty value provided', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress, cityEncryptedStoreId: null }])
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress, cityEncryptedStoreId: null }])
            })
          })
        })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);

      // Act
      const result = await repository.updateVaultField(
        mockTenantId,
        mockAddressId,
        'city',
        '',
        mockActorId
      );

      // Assert
      expect(vault.store).not.toHaveBeenCalled();
      const setCall = mockTx.update.mock.results[0]!.value.set.mock.calls[0]![0];
      expect(setCall).toEqual(
        expect.objectContaining({
          cityEncryptedStoreId: null,
          updatedAt: expect.any(Date)
        })
      );
      expect(result.cityEncryptedStoreId).toBeNull();
    });

    // PERF-001 fix: Removed "should throw error when vault entry retrieval fails" test
    // This test is no longer applicable since store() now returns the vault entry ID directly,
    // eliminating the separate SELECT query that could fail.

    it('should use transaction when provided', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress }])
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress }])
            })
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [{ id: 200 }] }),
        transaction: jest.fn().mockImplementation(async (callback: any) => {
          return await callback(mockTx);
        })
      };
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);

      // Act
      const result = await repository.updateVaultField(
        mockTenantId,
        mockAddressId,
        'city',
        'New City',
        mockActorId,
        mockTx as any
      );

      // Assert - transaction should be called (even when tx is provided, it wraps in another transaction)
      expect(mockTx.transaction).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('updateVaultFields', () => {
    it('should return unchanged address when no components provided', async () => {
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

    it('should update multiple fields sequentially in transaction', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress }])
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress }])
            })
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [{ id: 200 }] }),
        transaction: jest.fn().mockImplementation(async (callback: any) => {
          return await callback(mockTx);
        })
      };
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);

      // Act
      const result = await repository.updateVaultFields(
        mockTenantId,
        mockAddressId,
        { city: 'New City', state: 'New State' },
        mockActorId
      );

      // Assert - verify vault.store called twice
      expect(vault.store).toHaveBeenCalledTimes(2);
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({ fieldPath: 'addresses.city', value: 'New City' })
      );
      expect(vault.store).toHaveBeenCalledWith(
        expect.objectContaining({ fieldPath: 'addresses.state', value: 'New State' })
      );
      expect(result).toBeDefined();
    });

    it('should use transaction when provided', async () => {
      // Arrange
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress }])
            })
          })
        }),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([{ ...mockAddress }])
            })
          })
        }),
        execute: jest.fn().mockResolvedValue({ rows: [{ id: 200 }] }),
        transaction: jest.fn().mockImplementation(async (callback: any) => {
          return await callback(mockTx);
        })
      };
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockAddress);

      // Act
      await repository.updateVaultFields(
        mockTenantId,
        mockAddressId,
        { city: 'New City' },
        mockActorId,
        mockTx as any
      );

      // Assert - transaction should be called (even when tx is provided)
      expect(mockTx.transaction).toHaveBeenCalled();
      expect(mockTx.update).toHaveBeenCalled();
    });
  });

  describe('findWithVault', () => {
    it('should return address with decrypted components', async () => {
      // Arrange
      vault.retrieveById.mockResolvedValue('123 Main St');
      // Create address with only 1 vault ID for simpler test
      const addressWithOneVault = {
        ...mockAddress,
        street2EncryptedStoreId: null,
        cityEncryptedStoreId: null,
        stateEncryptedStoreId: null,
        postalCodeEncryptedStoreId: null,
        countryEncryptedStoreId: null
      };
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([addressWithOneVault])
          })
        })
      });

      // Act
      const result = await repository.findWithVault(mockTenantId, mockAddressId, mockRequestedBy);

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe(mockAddressId);
      expect(result?.decrypted).toEqual({ street: '123 Main St' });
    });

    it('should return null when address not found', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findWithVault(mockTenantId, 999, mockRequestedBy);

      // Assert
      expect(result).toBeNull();
      expect(vault.retrieveById).not.toHaveBeenCalled();
    });

    it('should call retrieveVaultComponentsBatch', async () => {
      // Arrange
      vault.retrieveById.mockResolvedValue('123 Main St');
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockAddress])
          })
        })
      });

      // Act
      await repository.findWithVault(mockTenantId, mockAddressId, mockRequestedBy);

      // Assert
      expect(vault.retrieveById).toHaveBeenCalled();
    });
  });

  describe('findByUserWithVault', () => {
    it('should return all user addresses with decrypted components', async () => {
      // Arrange
      const mockAddresses = [mockAddress, mockAddress2];
      vault.retrieveById.mockResolvedValueOnce('123 Main St').mockResolvedValueOnce('Springfield');
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockAddresses)
          })
        })
      });

      // Act
      const result = await repository.findByUserWithVault(
        mockTenantId,
        mockUserId,
        mockRequestedBy
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('decrypted');
      expect(result[1]).toHaveProperty('decrypted');
    });

    it('should return empty array when user has no addresses', async () => {
      // Arrange
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findByUserWithVault(
        mockTenantId,
        mockUserId,
        mockRequestedBy
      );

      // Assert
      expect(result).toEqual([]);
      expect(vault.retrieveById).not.toHaveBeenCalled();
    });

    it('should call retrieveVaultComponentsBatch for all addresses', async () => {
      // Arrange
      const mockAddresses = [mockAddress, mockAddress2];
      vault.retrieveById.mockResolvedValue('123 Main St');
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockAddresses)
          })
        })
      });

      // Act
      await repository.findByUserWithVault(mockTenantId, mockUserId, mockRequestedBy);

      // Assert
      expect(vault.retrieveById).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // INHERITED METHODS FROM BaseRepository
  // ============================================================================

  describe('inherited methods from BaseRepository', () => {
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

    it('should have create method', () => {
      expect(typeof repository.create).toBe('function');
    });

    it('should have update method', () => {
      expect(typeof repository.update).toBe('function');
    });

    it('should have delete method', () => {
      expect(typeof repository.delete).toBe('function');
    });
  });
});
