jest.mock('@package/redis', () => ({
  CacheService: class MockCacheService {}
}));

import { CachedBaseRepository } from '../cached-base.repository';

import type { ConfigService } from '@nestjs/config';
import type { Logger, MetricsService } from '@package/observability';
import type { CacheService } from '@package/redis';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type TestEntity = {
  id: number;
  organizationId: number;
  status: string;
};

type TestInsert = Omit<TestEntity, 'id'>;
type TestUpdate = Partial<TestInsert>;

class TestCachedRepository extends CachedBaseRepository<
  TestEntity,
  TestInsert,
  TestUpdate,
  number
> {
  protected getTable(): string {
    return 'users';
  }

  protected getIdColumn(): string {
    return 'id';
  }

  protected getTenantColumn(): string {
    return 'organizationId';
  }

  protected getEntityName(): string {
    return 'User';
  }
}

describe('CachedBaseRepository', () => {
  let repository: TestCachedRepository;
  let cache: jest.Mocked<CacheService>;
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(() => {
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      getVersion: jest.fn().mockResolvedValue('seed-0'),
      bumpVersion: jest.fn().mockResolvedValue('seed-1')
    } as unknown as jest.Mocked<CacheService>;

    db = {
      select: jest.fn()
    } as unknown as jest.Mocked<NodePgDatabase>;

    const config = {
      get: jest.fn(() => ({ enabled: true, ttl: { entity: 300, list: 60 } }))
    } as unknown as jest.Mocked<ConfigService>;

    const logger = {
      debug: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    const counter = { increment: jest.fn(), add: jest.fn() };
    const histogram = { record: jest.fn() };
    const metrics = {
      createCounter: jest.fn(() => counter),
      createHistogram: jest.fn(() => histogram)
    } as unknown as jest.Mocked<MetricsService>;

    repository = new TestCachedRepository(db, cache, config, logger, metrics, 'users');
  });

  it('includes the full where shape in list cache keys', async () => {
    cache.get.mockResolvedValue(null);
    const firstWhere = { status: 'active' };
    const secondWhere = { status: 'disabled' };

    const offset = jest.fn().mockResolvedValue([]);
    const limit = jest.fn(() => ({ offset }));
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where }));
    (db.select as jest.Mock).mockReturnValue({ from });

    await repository.findMany(42, { limit: 10, offset: 0, where: firstWhere as never });
    await repository.findMany(42, { limit: 10, offset: 0, where: secondWhere as never });

    const [firstKey] = (cache.get as jest.Mock).mock.calls[0] ?? [];
    const [secondKey] = (cache.get as jest.Mock).mock.calls[1] ?? [];
    expect(firstKey).not.toBe(secondKey);
  });

  it('rotates the tenant cache version for list invalidation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (repository as any).invalidateListCache(42);
    expect(cache.bumpVersion).toHaveBeenCalledWith('tenant:42:users:version');
  });
});
