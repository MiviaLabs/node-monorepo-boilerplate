/**
 * UserCacheKeys Unit Tests (Jest)
 *
 * Tests the cache key builders and constants for the Users module.
 */

import {
  USER_CACHE_NAMESPACE,
  USER_CACHE_TAGS,
  USER_CACHE_TTL,
  UserCacheKeyBuilder
} from './users.cache-keys';

describe('UserCacheKeys', () => {
  const tenantId = 123;
  const userId = 456;
  const version = 'seed-7';

  describe('Cache Key Builder', () => {
    it('should build tenant version key', () => {
      const key = UserCacheKeyBuilder.tenantVersion(tenantId);
      expect(key).toBe('tenant:123:users:version');
    });

    it('should build user entity key with versioned tenant prefix', () => {
      const key = UserCacheKeyBuilder.userEntity(tenantId, userId, version);
      expect(key).toBe('tenant:123:users:vseed-7:entity:456');
    });

    it('should build user list key with pagination and version', () => {
      const key = UserCacheKeyBuilder.userList(tenantId, 1, 10, version);
      expect(key).toBe('tenant:123:users:vseed-7:list:page=1:size=10:offset=0');
    });

    it('should build user list key with different page and version', () => {
      const key = UserCacheKeyBuilder.userList(tenantId, 2, 20, version);
      expect(key).toBe('tenant:123:users:vseed-7:list:page=2:size=20:offset=20');
    });

    it('should build user permissions key', () => {
      const key = UserCacheKeyBuilder.userPermissions(tenantId, userId, version);
      expect(key).toBe('tenant:123:users:vseed-7:permissions:456');
    });

    it('should build user profile key', () => {
      const key = UserCacheKeyBuilder.userProfile(tenantId, userId, version);
      expect(key).toBe('tenant:123:users:vseed-7:profile:456');
    });

    it('should build user status key', () => {
      const key = UserCacheKeyBuilder.userStatus(tenantId, userId, version);
      expect(key).toBe('tenant:123:users:vseed-7:status:456');
    });

    it('should build user email hash lookup key', () => {
      const emailHash = 'abc123...hash';
      const key = UserCacheKeyBuilder.userByEmailHash(tenantId, emailHash, version);
      expect(key).toBe('tenant:123:users:vseed-7:email:abc123...hash');
    });
  });

  describe('Cache TTL Constants', () => {
    it('should have correct entity TTL (5 minutes)', () => {
      expect(USER_CACHE_TTL.ENTITY).toBe(300);
    });

    it('should have correct list TTL (1 minute)', () => {
      expect(USER_CACHE_TTL.LIST).toBe(60);
    });

    it('should have correct permissions TTL (5 minutes)', () => {
      expect(USER_CACHE_TTL.PERMISSIONS).toBe(300);
    });

    it('should have correct profile TTL (5 minutes)', () => {
      expect(USER_CACHE_TTL.PROFILE).toBe(300);
    });

    it('should have correct status TTL (1 minute)', () => {
      expect(USER_CACHE_TTL.STATUS).toBe(60);
    });
  });

  describe('Cache Tags', () => {
    it('should have permissions tag', () => {
      expect(USER_CACHE_TAGS.PERMISSIONS).toBe('permissions');
    });

    it('should have profile tag', () => {
      expect(USER_CACHE_TAGS.PROFILE).toBe('profile');
    });

    it('should have status tag', () => {
      expect(USER_CACHE_TAGS.STATUS).toBe('status');
    });

    it('should have all tag', () => {
      expect(USER_CACHE_TAGS.ALL).toBe('all');
    });
  });

  describe('Cache Namespace', () => {
    it('should have correct namespace', () => {
      expect(USER_CACHE_NAMESPACE).toBe('users');
    });
  });
});
