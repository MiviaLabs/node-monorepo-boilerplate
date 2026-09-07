/**
 * UsersCacheConfig Unit Tests (Jest)
 *
 * Tests the cache configuration for the Users module.
 */

import { usersCacheConfig } from './users.cache.config';

describe('UsersCacheConfig', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Default Configuration', () => {
    it('should have caching enabled by default', () => {
      // Clear environment variables
      delete process.env['CACHE_ENABLED'];

      const config = usersCacheConfig();
      expect(config.enabled).toBe(true);
    });

    it('should use default entity TTL (300 seconds)', () => {
      delete process.env['CACHE_USER_TTL'];

      const config = usersCacheConfig();
      expect(config.defaultTTL).toBe(300);
    });

    it('should use default list TTL (60 seconds)', () => {
      delete process.env['CACHE_USER_LIST_TTL'];

      const config = usersCacheConfig();
      expect(config.listTTL).toBe(60);
    });

    it('should use default permissions TTL (300 seconds)', () => {
      delete process.env['CACHE_USER_PERMISSIONS_TTL'];

      const config = usersCacheConfig();
      expect(config.permissionsTTL).toBe(300);
    });

    it('should use default profile TTL (300 seconds)', () => {
      delete process.env['CACHE_USER_PROFILE_TTL'];

      const config = usersCacheConfig();
      expect(config.profileTTL).toBe(300);
    });

    it('should use default status TTL (60 seconds)', () => {
      delete process.env['CACHE_USER_STATUS_TTL'];

      const config = usersCacheConfig();
      expect(config.statusTTL).toBe(60);
    });
  });

  describe('Environment Variable Overrides', () => {
    it('should allow disabling cache via CACHE_ENABLED=false', () => {
      process.env['CACHE_ENABLED'] = 'false';

      const config = usersCacheConfig();
      expect(config.enabled).toBe(false);
    });

    it('should allow custom entity TTL via CACHE_USER_TTL', () => {
      process.env['CACHE_USER_TTL'] = '600';

      const config = usersCacheConfig();
      expect(config.defaultTTL).toBe(600);
    });

    it('should allow custom list TTL via CACHE_USER_LIST_TTL', () => {
      process.env['CACHE_USER_LIST_TTL'] = '120';

      const config = usersCacheConfig();
      expect(config.listTTL).toBe(120);
    });

    it('should allow custom permissions TTL via CACHE_USER_PERMISSIONS_TTL', () => {
      process.env['CACHE_USER_PERMISSIONS_TTL'] = '600';

      const config = usersCacheConfig();
      expect(config.permissionsTTL).toBe(600);
    });

    it('should allow custom profile TTL via CACHE_USER_PROFILE_TTL', () => {
      process.env['CACHE_USER_PROFILE_TTL'] = '900';

      const config = usersCacheConfig();
      expect(config.profileTTL).toBe(900);
    });

    it('should allow custom status TTL via CACHE_USER_STATUS_TTL', () => {
      process.env['CACHE_USER_STATUS_TTL'] = '30';

      const config = usersCacheConfig();
      expect(config.statusTTL).toBe(30);
    });
  });

  describe('Invalid Values', () => {
    it('should handle invalid TTL values gracefully', () => {
      process.env['CACHE_USER_TTL'] = 'invalid';

      const config = usersCacheConfig();
      // NaN should result from parseInt('invalid')
      expect(Number.isNaN(config.defaultTTL)).toBe(true);
    });

    it('should handle zero TTL values', () => {
      process.env['CACHE_USER_TTL'] = '0';

      const config = usersCacheConfig();
      expect(config.defaultTTL).toBe(0);
    });

    it('should handle negative TTL values', () => {
      process.env['CACHE_USER_TTL'] = '-60';

      const config = usersCacheConfig();
      expect(config.defaultTTL).toBe(-60);
    });
  });

  describe('Config Type', () => {
    it('should return config with correct type structure', () => {
      const config = usersCacheConfig();

      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('defaultTTL');
      expect(config).toHaveProperty('listTTL');
      expect(config).toHaveProperty('permissionsTTL');
      expect(config).toHaveProperty('profileTTL');
      expect(config).toHaveProperty('statusTTL');
    });

    it('should have all boolean or number properties', () => {
      const config = usersCacheConfig();

      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.defaultTTL).toBe('number');
      expect(typeof config.listTTL).toBe('number');
      expect(typeof config.permissionsTTL).toBe('number');
      expect(typeof config.profileTTL).toBe('number');
      expect(typeof config.statusTTL).toBe('number');
    });
  });
});
