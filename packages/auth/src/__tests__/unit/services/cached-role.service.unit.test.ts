/**
 * Unit tests for Cached Role Service cache read behavior
 *
 * Reproduces the double-JSON.parse bug: CacheService.get() already parses the
 * stored JSON array, but CachedRoleService.getUserRoles() re-parsed it with
 * JSON.parse(arrayObject), which always throws and silently falls back to the
 * database — so the cache could never serve a hit.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { CachedRoleService } from '../../../services/cached-role.service';
import type { CacheService } from '@package/redis';

/**
 * In-memory cache that honors the CacheService contract:
 * set() serializes non-string values (JSON.stringify), get() parses them back.
 */
class InMemoryCache {
  private store = new Map<string, string>();

  async set(key: string, value: unknown, _options?: { ttl?: number }): Promise<void> {
    this.store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    if (raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe('CachedRoleService', () => {
  it('should serve the second getUserRoles call from the cache', async () => {
    let systemRoleQueries = 0;
    const roleService = {
      getSystemRoles: async (_userId: number) => {
        systemRoleQueries += 1;
        return ['system_admin'];
      },
      getTenantRole: async (_userId: number, _tenantId: number) => 'tenant_user'
    };

    const cache = new InMemoryCache();
    const service = new CachedRoleService(
      roleService as never,
      cache as unknown as CacheService,
      {}
    );

    const first = await service.getUserRoles(123, 456);
    assert.deepStrictEqual(first, ['system_admin', 'tenant_user']);

    const second = await service.getUserRoles(123, 456);
    assert.deepStrictEqual(second, ['system_admin', 'tenant_user']);

    assert.strictEqual(
      systemRoleQueries,
      1,
      'second call must be served from cache, not re-query the database'
    );
  });

  it('should invalidate cached roles so the next call re-queries', async () => {
    let systemRoleQueries = 0;
    const roleService = {
      getSystemRoles: async (_userId: number) => {
        systemRoleQueries += 1;
        return ['system_admin'];
      },
      getTenantRole: async () => null
    };

    const cache = new InMemoryCache();
    const service = new CachedRoleService(
      roleService as never,
      cache as unknown as CacheService,
      {}
    );

    await service.getUserRoles(1);
    await service.invalidateRoles(1);
    await service.getUserRoles(1);

    assert.strictEqual(systemRoleQueries, 2);
  });
});
