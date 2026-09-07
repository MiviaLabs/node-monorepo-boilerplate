/**
 * Unit Tests for UserIdentityRepository
 *
 * Tests user identity repository for multi-provider authentication.
 */

jest.mock('@package/auth', () => ({
  CachedPermissionService: class MockCachedPermissionService {
    hasPermission = jest.fn().mockResolvedValue(true);
  }
}));

import { Test } from '@nestjs/testing';
import { EncryptionService } from '@package/encryption';
import { MetricsService } from '@package/observability';
import { CacheService } from '@package/redis';
import { hashEmail } from '@package/utils';

import { EncryptedStoreKeyService } from '../../../encrypted-store/encrypted-store-key.service';
import { UserIdentityRepository } from '../user-identity.repository';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('UserIdentityRepository', () => {
  let moduleRef: TestingModule;
  let repository: UserIdentityRepository;
  let db: jest.Mocked<NodePgDatabase>;
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
  };
  let metrics: {
    createCounter: jest.Mock;
    createHistogram: jest.Mock;
    createGauge: jest.Mock;
    incrementCounter: jest.Mock;
    recordHistogram: jest.Mock;
    recordGauge: jest.Mock;
  };

  const mockDb = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    orderBy: jest.fn()
  };

  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  };

  const mockMetrics = {
    createCounter: jest.fn(),
    createHistogram: jest.fn(),
    createGauge: jest.fn(),
    incrementCounter: jest.fn(),
    recordHistogram: jest.fn(),
    recordGauge: jest.fn()
  };

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        UserIdentityRepository,
        {
          provide: MAIN_DB,
          useValue: mockDb
        },
        {
          provide: CacheService,
          useValue: mockCache
        },
        {
          provide: MetricsService,
          useValue: mockMetrics
        },
        {
          provide: EncryptionService,
          useValue: {
            encryptToBase64: jest.fn().mockResolvedValue({
              ciphertext: 'encrypted',
              encryptedDataKey: 'key',
              iv: 'iv',
              authTag: 'tag'
            })
          }
        },
        {
          provide: EncryptedStoreKeyService,
          useValue: {
            getPrimaryKeyIdWithVersion: jest.fn().mockResolvedValue({
              keyId: 'primary-encryption-key',
              keyVersion: 'primary-encryption-key/1'
            })
          }
        }
      ]
    }).compile();

    repository = moduleRef.get<UserIdentityRepository>(UserIdentityRepository);
    db = mockDb as never;
    cache = mockCache;
    metrics = mockMetrics;

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('organizationId cache', () => {
    it('should return cached organizationId when present', async () => {
      cache.get.mockResolvedValue({ organizationId: 777 });

      const result = await (
        repository as unknown as {
          getUserOrganizationId: (userId: number) => Promise<number | null>;
        }
      ).getUserOrganizationId(123);

      expect(result).toBe(777);
      expect(db.select).not.toHaveBeenCalled();
      expect(metrics.incrementCounter).toHaveBeenCalledWith('auth.user_org_cache.hit', 1, {
        operation: 'get'
      });
      expect(metrics.recordHistogram).toHaveBeenCalledWith(
        'auth.user_org_cache.lookup.duration.ms',
        expect.any(Number),
        { result: 'hit' }
      );
    });

    it('should cache null organizationId for cache misses', async () => {
      cache.get.mockResolvedValue(null);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      } as never);

      const result = await (
        repository as unknown as {
          getUserOrganizationId: (userId: number) => Promise<number | null>;
        }
      ).getUserOrganizationId(9999);

      expect(result).toBeNull();
      expect(cache.set).toHaveBeenCalledWith(
        'auth:user-org:9999',
        expect.objectContaining({ organizationId: null, cachedAt: expect.any(Number) }),
        { ttl: 300 }
      );
      expect(metrics.incrementCounter).toHaveBeenCalledWith('auth.user_org_cache.miss', 1, {
        operation: 'get'
      });
      expect(metrics.recordHistogram).toHaveBeenCalledWith(
        'auth.user_org_cache.lookup.duration.ms',
        expect.any(Number),
        { result: 'miss' }
      );
    });

    it('should invalidate cached organizationId by cache key', async () => {
      cache.delete.mockResolvedValue(undefined);

      repository.invalidateUserOrganizationCache(456);
      await Promise.resolve();

      expect(cache.delete).toHaveBeenCalledWith('auth:user-org:456');
      expect(metrics.recordGauge).toHaveBeenCalledWith(
        'auth.user_org_cache.local.key_count',
        expect.any(Number),
        { operation: 'delete' }
      );
    });

    it('should increment error metric when cache get fails', async () => {
      cache.get.mockRejectedValue(new Error('cache get failed'));
      cache.set.mockResolvedValue(undefined);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ organizationId: 777 }])
          })
        })
      } as never);

      const result = await (
        repository as unknown as {
          getUserOrganizationId: (userId: number) => Promise<number | null>;
        }
      ).getUserOrganizationId(123);

      expect(result).toBe(777);
      expect(metrics.incrementCounter).toHaveBeenCalledWith('auth.user_org_cache.error', 1, {
        operation: 'get'
      });
    });

    it('should increment error metric when cache set fails', async () => {
      cache.get.mockResolvedValue(null);
      cache.set.mockRejectedValue(new Error('cache set failed'));
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ organizationId: 777 }])
          })
        })
      } as never);

      const result = await (
        repository as unknown as {
          getUserOrganizationId: (userId: number) => Promise<number | null>;
        }
      ).getUserOrganizationId(123);

      expect(result).toBe(777);
      expect(metrics.incrementCounter).toHaveBeenCalledWith('auth.user_org_cache.error', 1, {
        operation: 'set'
      });
    });

    it('should increment error metric when cache delete fails', async () => {
      cache.delete.mockRejectedValue(new Error('cache delete failed'));

      repository.invalidateUserOrganizationCache(456);
      await new Promise((resolve) => setImmediate(resolve));

      expect(metrics.incrementCounter).toHaveBeenCalledWith('auth.user_org_cache.error', 1, {
        operation: 'delete'
      });
    });

    it('should prune expired observed cache keys when checking count', () => {
      const repo = repository as unknown as {
        observedUserOrgCacheKeys: Map<number, number>;
        getObservedKeyCount: () => number;
      };
      const now = Date.now();

      repo.observedUserOrgCacheKeys.set(1, now - 1_000);
      repo.observedUserOrgCacheKeys.set(2, now + 1_000);

      expect(repo.getObservedKeyCount()).toBe(1);
      expect(repo.observedUserOrgCacheKeys.has(1)).toBe(false);
      expect(repo.observedUserOrgCacheKeys.has(2)).toBe(true);
    });
  });

  // Helper to create mock identity with required encryptionKeyVersion field
  const createMockIdentity = (
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    encryptionKeyVersion: 'primary-encryption-key/1',
    ...overrides
  });

  describe('findByProvider', () => {
    it('should find identity by provider and provider UID', async () => {
      // Arrange
      const mockIdentity = createMockIdentity({
        id: 1,
        userId: 123,
        provider: 'google.com',
        providerUid: 'google-uid-123'
      });
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockIdentity])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findByProvider('google.com', 'google-uid-123');

      // Assert
      expect(result).toEqual(mockIdentity);
    });

    it('should return null when identity not found', async () => {
      // Arrange
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findByProvider('google.com', 'not-found');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByProviderAndUid', () => {
    it('should be alias for findByProvider', async () => {
      // Arrange
      const mockIdentity = createMockIdentity({
        id: 1,
        userId: 123,
        provider: 'google.com',
        providerUid: 'google-uid-123'
      });
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockIdentity])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findByProviderAndUid('google.com', 'google-uid-123');

      // Assert
      expect(result).toEqual(mockIdentity);
    });
  });

  describe('findById', () => {
    it('should find identity by ID', async () => {
      // Arrange
      const mockIdentity = createMockIdentity({
        id: 1,
        userId: 123,
        provider: 'google.com'
      });
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockIdentity])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findById(1);

      // Assert
      expect(result).toEqual(mockIdentity);
    });

    it('should return null when identity ID not found', async () => {
      // Arrange
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findById(999);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should return identity when found', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123 };
      jest.spyOn(repository, 'findById').mockResolvedValue(mockIdentity as never);

      // Act
      const result = await repository.findByIdOrThrow(1);

      // Assert
      expect(result).toEqual(mockIdentity);
    });

    it('should throw error when identity not found', async () => {
      // Arrange
      jest.spyOn(repository, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(repository.findByIdOrThrow(999)).rejects.toThrow('Identity not found');
    });
  });

  describe('findByUserId', () => {
    it('should find all identities for a user ordered by createdAt desc', async () => {
      // Arrange
      const mockIdentities = [
        { id: 1, userId: 123, provider: 'google.com', createdAt: new Date('2024-01-02') },
        { id: 2, userId: 123, provider: 'apple.com', createdAt: new Date('2024-01-01') }
      ];
      const mockOrderBy = jest.fn().mockResolvedValue(mockIdentities);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: mockOrderBy
          })
        })
      } as never);

      // Act
      const result = await repository.findByUserId(123);

      // Assert
      expect(result).toEqual(mockIdentities);
      expect(mockOrderBy).toHaveBeenCalled();
    });

    it('should return empty array when user has no identities', async () => {
      // Arrange
      const mockOrderBy = jest.fn().mockResolvedValue([]);
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: mockOrderBy
          })
        })
      } as never);

      // Act
      const result = await repository.findByUserId(999);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findPrimaryByUserId', () => {
    it('should find primary identity for user', async () => {
      // Arrange
      const mockIdentity = {
        id: 1,
        userId: 123,
        provider: 'email_password',
        isPrimary: true
      };
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([mockIdentity])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findPrimaryByUserId(123);

      // Assert
      expect(result).toEqual(mockIdentity);
    });

    it('should return null when user has no primary identity', async () => {
      // Arrange
      const mockWhere = jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([])
      });
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: mockWhere
        })
      } as never);

      // Act
      const result = await repository.findPrimaryByUserId(123);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findPrimaryByUserIds', () => {
    it('should find primary identities for multiple users', async () => {
      // Arrange
      const mockIdentities = [
        { id: 1, userId: 123, isPrimary: true },
        { id: 2, userId: 456, isPrimary: true }
      ];
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockIdentities)
          })
        })
      } as never);

      // Act
      const result = await repository.findPrimaryByUserIds([123, 456]);

      // Assert
      expect(result).toEqual(mockIdentities);
    });

    it('should return empty array when no users provided', async () => {
      // Arrange
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([])
          })
        })
      } as never);

      // Act
      const result = await repository.findPrimaryByUserIds([]);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('countByUserId', () => {
    it('should count identities for user', async () => {
      // Arrange
      const mockResult = { count: 3 };
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockResult])
        })
      } as never);

      // Act
      const result = await repository.countByUserId(123);

      // Assert
      expect(result).toBe(3);
    });

    it('should return 0 when user has no identities', async () => {
      // Arrange
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{}])
        })
      } as never);

      // Act
      const result = await repository.countByUserId(999);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('userHasProvider', () => {
    it('should return true when user has the provider', async () => {
      // Arrange
      const mockResult = { id: 1 };
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockResult])
        })
      } as never);

      // Act
      const result = await repository.userHasProvider(123, 'google.com');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when user does not have the provider', async () => {
      // Arrange
      jest.spyOn(db, 'select').mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      } as never);

      // Act
      const result = await repository.userHasProvider(123, 'google.com');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('create', () => {
    it('should create identity', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123, provider: 'google.com' };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockIdentity])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      const data = {
        userId: 123,
        provider: 'google.com',
        providerUid: 'google-uid-123',
        providerEmail: 'user@example.com',
        isPrimary: true
      } as never;

      // Act
      const result = await repository.createWithUserId(data);

      // Assert
      expect(result).toEqual(mockIdentity);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          providerEmailHash: hashEmail('user@example.com'),
          providerEmailEncrypted: 'encrypted:key:iv:tag',
          encryptionKeyVersion: 'primary-encryption-key/1'
        })
      );
    });

    it('should preserve provided encrypted fields when plaintext is absent', async () => {
      // Arrange
      const mockIdentity = { id: 2, userId: 123, provider: 'google.com' };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockIdentity])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      // Act
      await repository.createWithUserId({
        userId: 123,
        provider: 'google.com',
        providerUid: 'google-uid-456',
        providerEmailHash: 'existing-hash',
        providerEmailEncrypted: 'cipher:key:iv:tag',
        phoneNumberEncrypted: 'phoneCipher:key:iv:tag',
        isPrimary: true
      } as never);

      // Assert
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          providerEmailHash: 'existing-hash',
          providerEmailEncrypted: 'cipher:key:iv:tag',
          phoneNumberEncrypted: 'phoneCipher:key:iv:tag'
        })
      );
    });
  });

  describe('createWithTransaction', () => {
    it('should create identity within transaction', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123 };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockIdentity])
      });
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: mockValues
        })
      } as unknown as NodePgDatabase;

      const data = {
        userId: 123,
        provider: 'google.com',
        providerEmail: 'oauth@example.com'
      } as never;

      // Act
      const result = await repository.createWithTransaction(mockTx, data);

      // Assert
      expect(result).toEqual(mockIdentity);
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          providerEmailHash: hashEmail('oauth@example.com'),
          providerEmailEncrypted: 'encrypted:key:iv:tag',
          encryptionKeyVersion: 'primary-encryption-key/1'
        })
      );
    });
  });

  describe('update', () => {
    it('should update identity', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123 };
      const mockSet = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([mockIdentity])
        })
      });
      jest.spyOn(db, 'update').mockReturnValue({
        set: mockSet
      } as never);
      // Mock findById for authorization check
      jest.spyOn(repository, 'findById').mockResolvedValue(mockIdentity as never);

      // Act
      const result = await repository.update(123, 1, { isPrimary: true }, undefined);

      // Assert
      expect(result).toEqual(mockIdentity);
    });
  });

  describe('updateWithTransaction', () => {
    it('should update identity within transaction', async () => {
      // Arrange
      const mockIdentity = { id: 1 };
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([mockIdentity])
            })
          })
        })
      } as unknown as NodePgDatabase;

      // Act
      const result = await repository.updateWithTransaction(mockTx, 123, 1, {
        isPrimary: false
      });

      // Assert
      expect(result).toEqual(mockIdentity);
    });
  });

  describe('delete', () => {
    it('should delete identity', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123 };
      const mockWhere = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(db, 'delete').mockReturnValue({
        where: mockWhere
      } as never);
      // Mock findById for authorization check
      jest.spyOn(repository, 'findById').mockResolvedValue(mockIdentity as never);

      // Act
      await repository.delete(1);

      // Assert
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('deleteWithTransaction', () => {
    it('should delete identity within transaction', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123 };
      const mockTx = {
        delete: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined)
        })
      } as unknown as NodePgDatabase;
      // Mock findById for authorization check
      jest.spyOn(repository, 'findById').mockResolvedValue(mockIdentity as never);

      // Act
      await repository.deleteWithTransaction(mockTx, 123, 1, undefined);

      // Assert
      expect(mockTx.delete).toHaveBeenCalled();
    });
  });

  describe('updateLastSignIn', () => {
    it('should update last sign in timestamp', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123 };
      const mockSet = jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      });
      jest.spyOn(db, 'update').mockReturnValue({
        set: mockSet
      } as never);
      // Mock findById to return identity with userId
      jest.spyOn(repository, 'findById').mockResolvedValue(mockIdentity as never);

      // Act
      await repository.updateLastSignIn(1);

      // Assert
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('updateLastSignInWithTransaction', () => {
    it('should update last sign in within transaction', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123 };
      const mockTx = {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue(undefined)
          })
        })
      } as unknown as NodePgDatabase;
      // Mock findById to return identity with userId
      jest.spyOn(repository, 'findById').mockResolvedValue(mockIdentity as never);

      // Act
      await repository.updateLastSignInWithTransaction(mockTx, 1);

      // Assert
      expect(mockTx.update).toHaveBeenCalled();
    });
  });
  describe('Encryption Static Methods', () => {
    describe('formatEnvelope', () => {
      it('should format envelope correctly with all parts', () => {
        // Access the private static method
        const result = (
          UserIdentityRepository as unknown as {
            formatEnvelope: (a: string, b: string, c: string, d: string) => string;
          }
        ).formatEnvelope('ciphertext123', 'encryptedKey456', 'iv789', 'authTag012');

        expect(result).toBe('ciphertext123:encryptedKey456:iv789:authTag012');
      });
    });

    describe('isValidEnvelope', () => {
      it('should return true for valid envelope with 4 non-empty parts', () => {
        const result = UserIdentityRepository.isValidEnvelope('part1:part2:part3:part4');
        expect(result).toBe(true);
      });

      it('should return false for envelope with less than 4 parts', () => {
        expect(UserIdentityRepository.isValidEnvelope('part1:part2:part3')).toBe(false);
        expect(UserIdentityRepository.isValidEnvelope('part1:part2')).toBe(false);
      });

      it('should return false for envelope with empty parts', () => {
        expect(UserIdentityRepository.isValidEnvelope('part1::part3:part4')).toBe(false);
        expect(UserIdentityRepository.isValidEnvelope(':part2:part3:part4')).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(UserIdentityRepository.isValidEnvelope('')).toBe(false);
      });
    });

    describe('normalizeSensitiveValue', () => {
      it('should return trimmed value for valid string', () => {
        const result = (
          UserIdentityRepository as unknown as {
            normalizeSensitiveValue: (v: string | undefined) => string | undefined;
          }
        ).normalizeSensitiveValue('  test value  ');
        expect(result).toBe('test value');
      });

      it('should return undefined for empty string after trim', () => {
        const result = (
          UserIdentityRepository as unknown as {
            normalizeSensitiveValue: (v: string | undefined) => string | undefined;
          }
        ).normalizeSensitiveValue('   ');
        expect(result).toBeUndefined();
      });

      it('should return undefined for undefined input', () => {
        const result = (
          UserIdentityRepository as unknown as {
            normalizeSensitiveValue: (v: string | undefined) => string | undefined;
          }
        ).normalizeSensitiveValue(undefined);
        expect(result).toBeUndefined();
      });
    });
  });

  describe('encryptToEnvelope', () => {
    it('should encrypt value and return formatted envelope', async () => {
      // Arrange - the mock encryption service is already set up in beforeEach
      const value = 'sensitive data';

      // Act - Use type assertion to access private method for testing
      const result = await (
        repository as unknown as {
          encryptToEnvelope(value: string): Promise<{ envelope: string; keyVersion: string }>;
        }
      ).encryptToEnvelope(value);

      // Assert
      expect(result).toEqual({
        envelope: 'encrypted:key:iv:tag',
        keyVersion: 'primary-encryption-key/1'
      });
    });

    it('should throw error with message when encryption fails', async () => {
      // Arrange
      const failingModule = await Test.createTestingModule({
        providers: [
          UserIdentityRepository,
          {
            provide: MAIN_DB,
            useValue: mockDb
          },
          {
            provide: CacheService,
            useValue: mockCache
          },
          {
            provide: MetricsService,
            useValue: mockMetrics
          },
          {
            provide: EncryptionService,
            useValue: {
              encryptToBase64: jest.fn().mockRejectedValue(new Error('KMS unavailable'))
            }
          },
          {
            provide: EncryptedStoreKeyService,
            useValue: {
              getPrimaryKeyIdWithVersion: jest.fn().mockResolvedValue({
                keyId: 'primary-encryption-key',
                keyVersion: 'primary-encryption-key/1'
              })
            }
          }
        ]
      }).compile();

      const failingRepository = failingModule.get<UserIdentityRepository>(UserIdentityRepository);

      // Act & Assert
      await expect(failingRepository['encryptToEnvelope']('test')).rejects.toThrow(
        'Encryption failed for sensitive identity data: KMS unavailable'
      );

      await failingModule.close();
    });
  });

  describe('createWithUserId encryption', () => {
    it('should encrypt providerEmail and phoneNumber when provided', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123, provider: 'google.com' };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockIdentity])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      // Act
      await repository.createWithUserId({
        userId: 123,
        provider: 'google.com',
        providerUid: 'uid-123',
        providerEmail: 'user@example.com',
        phoneNumber: '+1234567890',
        isPrimary: true
      } as never);

      // Assert
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          providerEmailHash: hashEmail('user@example.com'),
          providerEmailEncrypted: 'encrypted:key:iv:tag',
          phoneNumberEncrypted: 'encrypted:key:iv:tag',
          encryptionKeyVersion: 'primary-encryption-key/1'
        })
      );
    });

    it('should use provided encrypted values when plaintext is not provided', async () => {
      // Arrange
      const mockIdentity = { id: 1, userId: 123, provider: 'google.com' };
      const mockValues = jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([mockIdentity])
      });
      jest.spyOn(db, 'insert').mockReturnValue({
        values: mockValues
      } as never);

      // Act
      await repository.createWithUserId({
        userId: 123,
        provider: 'google.com',
        providerUid: 'uid-123',
        providerEmailHash: 'pre-hashed',
        providerEmailEncrypted: 'pre:encrypted:value:tag',
        phoneNumberEncrypted: 'phone:encrypted:value:tag',
        isPrimary: true
      } as never);

      // Assert
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          providerEmailHash: 'pre-hashed',
          providerEmailEncrypted: 'pre:encrypted:value:tag',
          phoneNumberEncrypted: 'phone:encrypted:value:tag'
        })
      );
    });
  });
});
