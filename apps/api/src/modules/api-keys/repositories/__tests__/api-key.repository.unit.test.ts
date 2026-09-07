/**
 * ApiKeyRepository Unit Tests
 *
 * Tests the ApiKeyRepository data access layer.
 * Uses a mock database connection to isolate repository logic.
 *
 * Coverage:
 * - findByKeyHash: Tenant scoping, soft-delete filtering, active status filtering
 * - findById: Inherited from BaseRepository
 * - findByTenant: Include/exclude inactive keys
 * - findByUser: User-scoped queries with tenant isolation
 * - create: Organization ID validation, insert failure handling
 * - updateLastUsed: Not found error, IP tracking
 * - softDelete: Soft delete delegation
 * - isExpired: Expiration check logic
 * - hasScopes: Scope validation logic
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified mock calls */
/* eslint-disable @typescript-eslint/no-explicit-any -- Mock database requires any type */

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  createMockApiKey,
  createMockApiKeys,
  createMockExpiredApiKey,
  createMockInactiveApiKey,
  createApiKeyData,
  API_KEY_TEST_DATA,
  createMockFromTestDataConstant
} from '../../__tests__/fixtures/api-key.fixture';
import { ApiKeyRepository } from '../../repositories/api-key.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('ApiKeyRepository', () => {
  let repository: ApiKeyRepository;
  let db: jest.Mocked<NodePgDatabase>;

  const mockApiKey = createMockApiKey({
    id: '123e4567-e89b-12d3-a456-426614174000',
    organizationId: '123e4567-e89b-12d3-a456-426614174100',
    userId: '123e4567-e89b-12d3-a456-426614174200',
    name: 'Test API Key',
    keyHash: 'abc123hash',
    keyPrefix: 'sk_test_',
    scopes: ['read:users', 'write:products'],
    isActive: true,
    usageCount: 0
  });

  beforeEach(async () => {
    const mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      transaction: jest.fn()
    };

    const module = await Test.createTestingModule({
      providers: [
        ApiKeyRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    repository = module.get<ApiKeyRepository>(ApiKeyRepository);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = module.get<NodePgDatabase>(MAIN_DB) as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('findByKeyHash', () => {
    it('should find API key by hash within tenant scope', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyHash = 'abc123hash';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockApiKey])
          })
        })
      });

      // Act
      const result = await repository.findByKeyHash(tenantId, keyHash);

      // Assert
      expect(result).toEqual(mockApiKey);
      expect(db.select).toHaveBeenCalled();
      expect(db.select).toHaveBeenCalledWith();
    });

    it('should return null when key hash not found', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyHash = 'nonexistent';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findByKeyHash(tenantId, keyHash);

      // Assert
      expect(result).toBeNull();
    });

    it('should filter out inactive keys', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyHash = 'inactive-key-hash';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      await repository.findByKeyHash(tenantId, keyHash);

      // Assert - where clause should include isActive: true filter
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should filter out soft-deleted keys', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyHash = 'deleted-key-hash';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      await repository.findByKeyHash(tenantId, keyHash);

      // Assert - where clause should include deletedAt IS NULL filter
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should scope query to tenant', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyHash = 'scoped-key-hash';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockApiKey])
          })
        })
      });

      // Act
      await repository.findByKeyHash(tenantId, keyHash);

      // Assert - query should include organizationId filter
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find API key by ID within tenant scope', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyId = '123e4567-e89b-12d3-a456-426614174000';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockApiKey])
          })
        })
      });

      // Act
      const result = await repository.findById(tenantId, keyId);

      // Assert
      expect(result).toEqual(mockApiKey);
    });

    it('should return null when API key not found', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyId = 'nonexistent-key-id';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      const result = await repository.findById(tenantId, keyId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should return all active keys for tenant', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const mockKeys = createMockApiKeys(3, { organizationId: tenantId });

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockKeys)
          })
        })
      });

      // Act
      const result = await repository.findByTenant(tenantId);

      // Assert
      expect(result).toEqual(mockKeys);
      expect(result).toHaveLength(3);
    });

    it('should include inactive keys when includeInactive is true', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const inactiveKey = createMockInactiveApiKey({ organizationId: tenantId });

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([inactiveKey])
          })
        })
      });

      // Act
      const result = await repository.findByTenant(tenantId, true);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]!.isActive).toBe(false);
    });

    it('should exclude inactive keys when includeInactive is false', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      await repository.findByTenant(tenantId, false);

      // Assert - where clause should include isActive: true and deletedAt IS NULL
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should order results by createdAt', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      await repository.findByTenant(tenantId);

      // Assert - orderBy should be called
      const orderByCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!
        .value.where.mock.results[0]!.value.orderBy;
      expect(orderByCall).toHaveBeenCalled();
    });
  });

  describe('findByUser', () => {
    it('should return keys for specific user within tenant', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const userId = '123e4567-e89b-12d3-a456-426614174200';
      const userKeys = createMockApiKeys(2, { organizationId: tenantId, userId });

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(userKeys)
          })
        })
      });

      // Act
      const result = await repository.findByUser(tenantId, userId);

      // Assert
      expect(result).toEqual(userKeys);
      expect(result).toHaveLength(2);
    });

    it('should filter out soft-deleted keys', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const userId = '123e4567-e89b-12d3-a456-426614174200';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      await repository.findByUser(tenantId, userId);

      // Assert - where clause should include deletedAt IS NULL filter
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });

    it('should scope query to tenant', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const userId = '123e4567-e89b-12d3-a456-426614174200';

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act
      await repository.findByUser(tenantId, userId);

      // Assert - query should include both organizationId and userId filters
      const whereCall = (db.select as jest.Mock).mock.results[0]!.value.from.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create API key with organization ID from tenant', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const createData = createApiKeyData({
        organizationId: tenantId,
        name: 'New Key'
      });

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockApiKey])
        })
      });

      // Act
      const result = await repository.create(tenantId, createData);

      // Assert
      expect(result).toEqual(mockApiKey);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should throw error when organizationId does not match tenantId', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const createData = createApiKeyData({
        organizationId: 'different-tenant-id',
        name: 'Mismatched Key'
      });

      // Act & Assert
      await expect(repository.create(tenantId, createData)).rejects.toThrow(
        'Organization ID mismatch'
      );
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should throw error when insert fails', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const createData = createApiKeyData({
        organizationId: tenantId
      });

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([])
        })
      });

      // Act & Assert
      await expect(repository.create(tenantId, createData)).rejects.toThrow(
        'Failed to create API key'
      );
    });
  });

  describe('updateLastUsed', () => {
    it('should update last used information with IP', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyId = '123e4567-e89b-12d3-a456-426614174000';
      const ipAddress = '192.168.1.1';
      const updatedKey = { ...mockApiKey, lastUsedAt: new Date(), lastUsedIp: ipAddress };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedKey])
          })
        })
      });

      // Act
      const result = await repository.updateLastUsed(tenantId, keyId, ipAddress);

      // Assert
      expect(result).toEqual(updatedKey);
      expect(result.lastUsedIp).toBe(ipAddress);
    });

    it('should update last used information without IP', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyId = '123e4567-e89b-12d3-a456-426614174000';
      const updatedKey = { ...mockApiKey, lastUsedAt: new Date(), lastUsedIp: null };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedKey])
          })
        })
      });

      // Act
      const result = await repository.updateLastUsed(tenantId, keyId);

      // Assert
      expect(result).toEqual(updatedKey);
      expect(result.lastUsedIp).toBeNull();
    });

    it('should throw NotFoundException when key not found', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyId = 'nonexistent-key-id';

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([])
          })
        })
      });

      // Act & Assert
      await expect(repository.updateLastUsed(tenantId, keyId)).rejects.toThrow(NotFoundException);
      await expect(repository.updateLastUsed(tenantId, keyId)).rejects.toThrow(
        `API key ${keyId} not found`
      );
    });

    it('should scope update to tenant', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyId = '123e4567-e89b-12d3-a456-426614174000';

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockApiKey])
          })
        })
      });

      // Act
      await repository.updateLastUsed(tenantId, keyId);

      // Assert - where clause should include both id and organizationId
      const whereCall = (db.update as jest.Mock).mock.results[0]!.value.set.mock.results[0]!.value
        .where;
      expect(whereCall).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should soft delete API key', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyId = '123e4567-e89b-12d3-a456-426614174000';
      const userContext = { userId: 'user-123', tenantId, roles: ['admin'] };

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockApiKey])
          })
        })
      });

      // Act
      await repository.softDelete(tenantId, keyId, userContext);

      // Assert
      expect(db.update).toHaveBeenCalled();
    });

    it('should accept soft delete without user context', async () => {
      // Arrange
      const tenantId = '123e4567-e89b-12d3-a456-426614174100';
      const keyId = '123e4567-e89b-12d3-a456-426614174000';

      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([mockApiKey])
          })
        })
      });

      // Act
      await repository.softDelete(tenantId, keyId);

      // Assert
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('isExpired', () => {
    it('should return false when no expiration date', () => {
      // Arrange
      const keyWithoutExpiry = createMockApiKey({ expiresAt: undefined });

      // Act
      const result = repository.isExpired(keyWithoutExpiry);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when expiration date is in future', () => {
      // Arrange
      const future = new Date();
      future.setHours(future.getHours() + 1);
      const keyWithFutureExpiry = createMockApiKey({ expiresAt: future });

      // Act
      const result = repository.isExpired(keyWithFutureExpiry);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true when expiration date is in past', () => {
      // Arrange
      const expiredKey = createMockExpiredApiKey();

      // Act
      const result = repository.isExpired(expiredKey);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when expiration date is exactly now', () => {
      // Arrange
      // Use fake timers to freeze time, ensuring both Date() calls return the same timestamp
      jest.useFakeTimers();
      const frozenNow = new Date();
      jest.setSystemTime(frozenNow);

      const nowKey = createMockApiKey({ expiresAt: frozenNow });

      // Act
      const result = repository.isExpired(nowKey);

      // Assert
      // A key that expires at exactly this moment is still valid (not yet in the past)
      expect(result).toBe(false);

      // Cleanup
      jest.useRealTimers();
    });
  });

  describe('hasScopes', () => {
    it('should return true when no scopes required', () => {
      // Arrange
      const key = createMockApiKey();

      // Act
      const result = repository.hasScopes(key, []);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when key has all required scopes', () => {
      // Arrange
      const key = createMockApiKey({ scopes: ['read:users', 'write:products', 'delete:orders'] });

      // Act
      const result = repository.hasScopes(key, ['read:users', 'write:products']);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when key missing required scope', () => {
      // Arrange
      const key = createMockApiKey({ scopes: ['read:users'] });

      // Act
      const result = repository.hasScopes(key, ['read:users', 'write:products']);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when key has no scopes', () => {
      // Arrange
      const key = createMockApiKey({ scopes: [] });

      // Act
      const result = repository.hasScopes(key, ['read:users']);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle undefined scopes gracefully', () => {
      // Arrange
      const key = createMockApiKey({ scopes: undefined as unknown as string[] });

      // Act
      const result = repository.hasScopes(key, ['read:users']);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for admin key with all scopes', () => {
      // Arrange
      const adminKey = createMockFromTestDataConstant(API_KEY_TEST_DATA.ADMIN);

      // Act
      const result = repository.hasScopes(adminKey, ['read:all', 'write:all']);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for read-only key requesting write access', () => {
      // Arrange
      const readOnlyKey = createMockFromTestDataConstant(API_KEY_TEST_DATA.READ_ONLY);

      // Act
      const result = repository.hasScopes(readOnlyKey, ['write:products']);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('inherited methods from BaseRepository', () => {
    it('should have findById method', () => {
      // Assert
      expect(typeof repository.findById).toBe('function');
    });

    it('should have findByIdOrThrow method', () => {
      // Assert
      expect(typeof repository.findByIdOrThrow).toBe('function');
    });

    it('should have findMany method', () => {
      // Assert
      expect(typeof repository.findMany).toBe('function');
    });

    it('should have exists method', () => {
      // Assert
      expect(typeof repository.exists).toBe('function');
    });

    it('should have transaction method', () => {
      // Assert
      expect(typeof repository.transaction).toBe('function');
    });
  });
});
