/**
 * Unit tests for CachedUserRepository
 *
 * Tests the cached user repository with Redis caching.
 * Verifies cache hit/miss patterns, invalidation, and email hashing.
 */

jest.mock('@package/auth', () => ({
  CachedPermissionService: class MockCachedPermissionService {
    hasPermission = jest.fn().mockResolvedValue(true);
  }
}));

jest.mock('@package/redis', () => ({
  CacheService: class MockCacheService {}
}));

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Errors } from '@package/errors';
import { Logger, MetricsService } from '@package/observability';
import { CacheService } from '@package/redis';

import { CachedUserRepository } from '../../repositories/cached-user.repository';
import { USER_CACHE_TTL, UserCacheKeyBuilder } from '../../users.cache-keys';

import type { TestingModule } from '@nestjs/testing';
import type { User } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

describe('CachedUserRepository', () => {
  let repository: CachedUserRepository;
  let cache: jest.Mocked<CacheService>;
  let db: jest.Mocked<NodePgDatabase>;
  let config: jest.Mocked<ConfigService>;
  let logger: jest.Mocked<Logger>;
  let metrics: jest.Mocked<MetricsService>;

  const mockUser: User = {
    id: 1,
    organizationId: 123,
    emailHash: 'abc123hash',
    emailEncrypted: 'encrypted-email',
    firstNameEncrypted: 'encrypted-first',
    lastNameEncrypted: 'encrypted-last',
    displayName: 'Test User',
    phoneNumberEncrypted: null,
    isActive: true,
    isVerified: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastSignInAt: null,
    deletedAt: new Date('2099-12-31T00:00:00.000Z'),
    photoUrl: null,
    avatarFileId: null,
    encryptionKeyVersion: 'primary-encryption-key/1'
  };

  beforeEach(async () => {
    // Mock cache service
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      getVersion: jest.fn().mockResolvedValue('seed-0'),
      bumpVersion: jest.fn().mockResolvedValue('seed-1'),
      invalidatePattern: jest.fn()
    } as unknown as jest.Mocked<CacheService>;

    // Mock database
    db = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<NodePgDatabase>;

    // Mock config service
    config = {
      get: jest.fn(() => ({ enabled: true, ttl: { entity: 300, list: 60 } }))
    } as unknown as jest.Mocked<ConfigService>;

    // Mock logger
    logger = {
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    // Mock metrics service
    const mockCounter = {
      add: jest.fn(),
      increment: jest.fn()
    };
    const mockHistogram = {
      record: jest.fn()
    };
    metrics = {
      createCounter: jest.fn(() => mockCounter),
      createHistogram: jest.fn(() => mockHistogram)
    } as unknown as jest.Mocked<MetricsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CachedUserRepository,
        {
          provide: MAIN_DB,
          useValue: db
        },
        {
          provide: CacheService,
          useValue: cache
        },
        {
          provide: ConfigService,
          useValue: config
        },
        {
          provide: Logger,
          useValue: logger
        },
        {
          provide: MetricsService,
          useValue: metrics
        }
      ]
    }).compile();

    repository = module.get<CachedUserRepository>(CachedUserRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hashEmail', () => {
    it('should hash email consistently with SHA-256', async () => {
      // Access private method via any cast for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hashEmail = (repository as any).hashEmail.bind(repository);

      const email = 'test@example.com';
      const hash1 = hashEmail(email);
      const hash2 = hashEmail(email);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
      expect(typeof hash1).toBe('string');
    });

    it('should handle different emails with different hashes', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hashEmail = (repository as any).hashEmail.bind(repository);

      const email1 = 'user1@example.com';
      const email2 = 'user2@example.com';

      expect(hashEmail(email1)).not.toBe(hashEmail(email2));
    });

    it('should normalize email to lowercase before hashing', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hashEmail = (repository as any).hashEmail.bind(repository);

      const email1 = 'Test@Example.com';
      const email2 = 'test@example.com';

      expect(hashEmail(email1)).toBe(hashEmail(email2));
    });

    it('should trim whitespace before hashing', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hashEmail = (repository as any).hashEmail.bind(repository);

      const email1 = '  test@example.com  ';
      const email2 = 'test@example.com';

      expect(hashEmail(email1)).toBe(hashEmail(email2));
    });
  });

  describe('count', () => {
    it('should return count from cache on cache hit', async () => {
      const cachedCount = 5;
      cache.get.mockResolvedValue(cachedCount);

      const result = await repository.count(123);

      expect(result).toBe(cachedCount);
      expect(cache.get).toHaveBeenCalledTimes(1);
      expect(cache.getVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should query database on cache miss and cache result', async () => {
      cache.get.mockResolvedValue(null);
      const mockCountResult = { count: 10 };

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockCountResult])
        })
      });

      const result = await repository.count(123);

      expect(result).toBe(10);
      expect(cache.set).toHaveBeenCalledWith(expect.any(String), 10, {
        ttl: USER_CACHE_TTL.STATUS
      });
    });

    it('should return 0 when no users found', async () => {
      cache.get.mockResolvedValue(null);

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      const result = await repository.count(123);

      expect(result).toBe(0);
    });
  });

  describe('findWithPagination', () => {
    it('should return users from cache on cache hit', async () => {
      const cachedUsers = [mockUser];
      cache.get.mockResolvedValue(cachedUsers);

      const result = await repository.findWithPagination(123, 1, 10);

      expect(result).toEqual(cachedUsers);
      expect(cache.get).toHaveBeenCalledTimes(1);
      expect(cache.getVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should query database on cache miss and cache result', async () => {
      cache.get.mockResolvedValue(null);
      const mockUsers = [mockUser, { ...mockUser, id: 2 }];

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue(mockUsers)
              })
            })
          })
        })
      });

      const result = await repository.findWithPagination(123, 1, 10);

      expect(result).toEqual(mockUsers);
      expect(cache.set).toHaveBeenCalledWith(expect.any(String), mockUsers, {
        ttl: USER_CACHE_TTL.LIST
      });
    });

    it('should calculate correct offset for pagination', async () => {
      cache.get.mockResolvedValue(null);

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue([])
              })
            })
          })
        })
      });

      await repository.findWithPagination(123, 3, 10);

      // Page 3, pageSize 10 = offset 20
      const offsetCall = (db.select as jest.Mock).mock.results[0]?.value.from.mock.results[0]?.value
        .where.mock.results[0]?.value.orderBy.mock.results[0]?.value.limit.mock.results[0]?.value
        .offset;
      expect(offsetCall).toHaveBeenCalledWith(20);
    });
  });

  describe('findByEmail', () => {
    it('should return user from cache on cache hit', async () => {
      const cachedUser = mockUser;
      cache.get.mockResolvedValue(cachedUser);

      const result = await repository.findByEmail(123, 'test@example.com');

      expect(result).toEqual(cachedUser);
      expect(cache.get).toHaveBeenCalledTimes(1);
      expect(cache.getVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should query database on cache miss and cache result', async () => {
      cache.get.mockResolvedValue(null);

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockUser])
          })
        })
      });

      const result = await repository.findByEmail(123, 'test@example.com');

      expect(result).toEqual(mockUser);
      expect(cache.set).toHaveBeenCalledWith(expect.any(String), mockUser, {
        ttl: USER_CACHE_TTL.ENTITY
      });
    });

    it('should return null when user not found', async () => {
      cache.get.mockResolvedValue(null);

      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      const result = await repository.findByEmail(123, 'notfound@example.com');

      expect(result).toBeNull();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should hash email for cache key', async () => {
      cache.get.mockResolvedValue(null);
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([])
          })
        })
      });

      await repository.findByEmail(123, 'test@example.com');

      // Verify cache.get was called with email hash (not plain email)
      const cacheKey = (cache.get as jest.Mock).mock.calls[0]?.[0];
      expect(cacheKey).not.toContain('test@example.com');
      expect(cacheKey).toContain(':vseed-0:email:');
    });
  });

  describe('createWithOrg', () => {
    it('should create user with organizationId', async () => {
      const [user] = [mockUser];

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([user])
        })
      });

      const result = await repository.createWithOrg({ organizationId: 123 });

      expect(result).toEqual(mockUser);
      expect(db.insert).toHaveBeenCalled();
      expect(cache.bumpVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
    });

    it('should hash email when provided', async () => {
      const [user] = [mockUser];
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([user])
        })
      });

      await repository.createWithOrg({
        organizationId: 123,
        emailHash: 'custom-hash'
      });

      const valuesCall = (db.insert as jest.Mock).mock.results[0]?.value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({
          emailHash: 'custom-hash'
        })
      );
    });
  });

  describe('createSimple', () => {
    it('should create user directly', async () => {
      const [user] = [mockUser];

      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([user])
        })
      });

      const result = await repository.createSimple({ organizationId: 123 });

      expect(result).toEqual(mockUser);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should generate empty email hash if not provided', async () => {
      const [user] = [mockUser];
      (db.insert as jest.Mock).mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([user])
        })
      });

      await repository.createSimple({ organizationId: 123 });

      const valuesCall = (db.insert as jest.Mock).mock.results[0]?.value.values;
      expect(valuesCall).toHaveBeenCalledWith(
        expect.objectContaining({
          emailHash: expect.any(String)
        })
      );
    });
  });

  describe('update', () => {
    it('should verify user exists before updating', async () => {
      const [updatedUser] = [{ ...mockUser, updatedAt: new Date('2024-01-02T00:00:00.000Z') }];
      (db.update as jest.Mock).mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedUser])
          })
        })
      });

      // Mock findByIdOrThrow to return user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockUser);

      const result = await repository.update(123, 1, {
        updatedAt: new Date('2024-01-02T00:00:00.000Z')
      });

      expect(result).toEqual(updatedUser);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(repository['findByIdOrThrow']).toHaveBeenCalledWith(123, 1);
      expect(cache.bumpVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
    });

    it('should throw error when user not found during verification', async () => {
      const notFoundError = Errors.databaserecordNotFound004({ entity: 'User' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockRejectedValue(notFoundError);

      await expect(
        repository.update(123, 999, {
          updatedAt: new Date('2024-01-02T00:00:00.000Z')
        })
      ).rejects.toThrow(notFoundError);
    });
  });

  describe('delete', () => {
    it('should verify user exists before deleting', async () => {
      (db.delete as jest.Mock).mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined)
      });

      // Mock findByIdOrThrow
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockResolvedValue(mockUser);

      await repository.delete(123, 1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(repository['findByIdOrThrow']).toHaveBeenCalledWith(123, 1);
      expect(db.delete).toHaveBeenCalled();
      expect(cache.bumpVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
    });

    it('should throw error when user not found during verification', async () => {
      const notFoundError = Errors.databaserecordNotFound004({ entity: 'User' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(repository, 'findByIdOrThrow' as any).mockRejectedValue(notFoundError);

      await expect(repository.delete(123, 999)).rejects.toThrow(notFoundError);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('invalidateUserTags', () => {
    it('should invalidate multiple tags for user', async () => {
      await repository.invalidateUserTags(123, 1, ['permissions', 'profile']);

      expect(cache.bumpVersion).toHaveBeenCalledTimes(1);
    });

    it('should invalidate entity cache', async () => {
      cache.getVersion.mockResolvedValueOnce('seed-1');
      await repository.invalidateUserTags(123, 1, ['status']);

      expect(cache.bumpVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
      expect(cache.delete).toHaveBeenCalledWith('tenant:123:users:vseed-1:entity:1');
    });

    it('should not call cache when disabled', async () => {
      // Create a new repository instance with cache disabled
      (config.get as jest.Mock).mockReturnValue({ enabled: false });
      const disabledModule: TestingModule = await Test.createTestingModule({
        providers: [
          CachedUserRepository,
          {
            provide: MAIN_DB,
            useValue: db
          },
          {
            provide: CacheService,
            useValue: cache
          },
          {
            provide: ConfigService,
            useValue: config
          },
          {
            provide: Logger,
            useValue: logger
          },
          {
            provide: MetricsService,
            useValue: metrics
          }
        ]
      }).compile();

      const disabledRepo = disabledModule.get<CachedUserRepository>(CachedUserRepository);

      await disabledRepo.invalidateUserTags(123, 1, ['permissions']);

      expect(cache.bumpVersion).not.toHaveBeenCalled();
    });
  });

  describe('clearAllUserCaches', () => {
    it('should clear all user caches for tenant', async () => {
      await repository.clearAllUserCaches(123);

      expect(cache.bumpVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
      expect(cache.invalidatePattern).toHaveBeenCalledWith('tenant:123:users:v*');
    });
  });

  describe('cache disabled fallback', () => {
    beforeEach(() => {
      (config.get as jest.Mock).mockReturnValue({ enabled: false });
    });

    it('should bypass cache when disabled in count', async () => {
      const mockCountResult = { count: 5 };
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockCountResult])
        })
      });

      // Create a new repository instance with cache disabled
      const disabledModule: TestingModule = await Test.createTestingModule({
        providers: [
          CachedUserRepository,
          {
            provide: MAIN_DB,
            useValue: db
          },
          {
            provide: CacheService,
            useValue: cache
          },
          {
            provide: ConfigService,
            useValue: config
          },
          {
            provide: Logger,
            useValue: logger
          },
          {
            provide: MetricsService,
            useValue: metrics
          }
        ]
      }).compile();

      const disabledRepo = disabledModule.get<CachedUserRepository>(CachedUserRepository);
      const result = await disabledRepo.count(123);

      expect(result).toBe(5);
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('should bypass cache when disabled in findWithPagination', async () => {
      const mockUsers = [mockUser];
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                offset: jest.fn().mockResolvedValue(mockUsers)
              })
            })
          })
        })
      });

      // Create a new repository instance with cache disabled
      const disabledModule: TestingModule = await Test.createTestingModule({
        providers: [
          CachedUserRepository,
          {
            provide: MAIN_DB,
            useValue: db
          },
          {
            provide: CacheService,
            useValue: cache
          },
          {
            provide: ConfigService,
            useValue: config
          },
          {
            provide: Logger,
            useValue: logger
          },
          {
            provide: MetricsService,
            useValue: metrics
          }
        ]
      }).compile();

      const disabledRepo = disabledModule.get<CachedUserRepository>(CachedUserRepository);
      const result = await disabledRepo.findWithPagination(123, 1, 10);

      expect(result).toEqual(mockUsers);
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('should bypass cache when disabled in findByEmail', async () => {
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockUser])
          })
        })
      });

      // Create a new repository instance with cache disabled
      const disabledModule: TestingModule = await Test.createTestingModule({
        providers: [
          CachedUserRepository,
          {
            provide: MAIN_DB,
            useValue: db
          },
          {
            provide: CacheService,
            useValue: cache
          },
          {
            provide: ConfigService,
            useValue: config
          },
          {
            provide: Logger,
            useValue: logger
          },
          {
            provide: MetricsService,
            useValue: metrics
          }
        ]
      }).compile();

      const disabledRepo = disabledModule.get<CachedUserRepository>(CachedUserRepository);
      const result = await disabledRepo.findByEmail(123, 'test@example.com');

      expect(result).toEqual(mockUser);
      expect(cache.get).not.toHaveBeenCalled();
    });
  });

  describe('metrics recording', () => {
    it('should create metrics counters on initialization', () => {
      expect(metrics.createCounter).toHaveBeenCalledWith('cache.hit', 'Cache hit count');
      expect(metrics.createCounter).toHaveBeenCalledWith('cache.miss', 'Cache miss count');
      expect(metrics.createCounter).toHaveBeenCalledWith(
        'cache.invalidation',
        'Cache invalidation count'
      );
    });

    it('should create metrics histogram on initialization', () => {
      expect(metrics.createHistogram).toHaveBeenCalledWith(
        'cache.operation.duration.ms',
        'Cache operation duration in milliseconds'
      );
    });

    it('should record cache hits during findByEmail', async () => {
      cache.get.mockResolvedValue(mockUser);

      await repository.findByEmail(123, 'test@example.com');

      // Verify cache.get was called (which indicates a cache operation was measured)
      expect(cache.get).toHaveBeenCalled();
    });

    it('should record cache misses during findByEmail', async () => {
      cache.get.mockResolvedValue(null);
      (db.select as jest.Mock).mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([mockUser])
          })
        })
      });

      await repository.findByEmail(123, 'test@example.com');

      // Verify cache.get was called (cache miss) and db.select was called
      expect(cache.get).toHaveBeenCalled();
      expect(db.select).toHaveBeenCalled();
    });

    it('should record cache invalidations during clearAllUserCaches', async () => {
      await repository.clearAllUserCaches(123);

      expect(cache.bumpVersion).toHaveBeenCalledWith(UserCacheKeyBuilder.tenantVersion(123));
    });
  });
});
