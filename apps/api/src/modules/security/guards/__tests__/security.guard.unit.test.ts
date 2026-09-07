/**
 * SecurityGuard Unit Tests
 *
 * Tests the security guard's lockout checking behavior.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - Missing tenant/user context handling
 * - Lockout status checking via Redis
 * - Correct Redis key format verification
 * - ForbiddenException throwing for locked users
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';

import {
  createMockExecutionContext,
  createMockRequest,
  getLockoutKey,
  TEST_TENANT_ID,
  TEST_USER_ID
} from '../../__tests__/fixtures/security.fixture';
import { SecurityGuard } from '../security.guard';

import type { CacheService } from '@package/redis';

describe('SecurityGuard', () => {
  let guard: SecurityGuard;
  let cache: jest.Mocked<CacheService>;

  beforeEach(() => {
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      keys: jest.fn(),
      mget: jest.fn(),
      mset: jest.fn(),
      incr: jest.fn(),
      incrBy: jest.fn(),
      decr: jest.fn(),
      decrBy: jest.fn()
    } as unknown as jest.Mocked<CacheService>;

    guard = new SecurityGuard(cache);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should return false when tenantId is missing', async () => {
      // Arrange
      const request = createMockRequest({ tenantId: undefined, userId: TEST_USER_ID });
      const context = createMockExecutionContext(request);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('should return false when userId is missing', async () => {
      // Arrange
      const request = createMockRequest({ tenantId: TEST_TENANT_ID, userId: undefined });
      const context = createMockExecutionContext(request);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('should return false when user object is missing', async () => {
      // Arrange
      const request = { user: undefined };
      const context = createMockExecutionContext(request);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(false);
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('should return true when user is not locked out', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      cache.get.mockResolvedValue(null);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(cache.get).toHaveBeenCalledTimes(1);
    });

    it('should throw ForbiddenException when user is locked out', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      cache.get.mockResolvedValue('1');

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Account temporarily locked due to suspicious activity'
      );
    });

    it('should check lockout status with correct Redis key format', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const expectedKey = getLockoutKey(TEST_TENANT_ID, TEST_USER_ID);
      cache.get.mockResolvedValue(null);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(cache.get).toHaveBeenCalledWith(expectedKey);
    });

    it('should return true when lockout key exists but value is not "1"', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      cache.get.mockResolvedValue('0'); // Not locked

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle different tenant and user combinations', async () => {
      // Arrange
      const customTenantId = 'custom-tenant-999';
      const customUserId = 'custom-user-888';
      const request = createMockRequest({ tenantId: customTenantId, userId: customUserId });
      const context = createMockExecutionContext(request);
      const expectedKey = getLockoutKey(customTenantId, customUserId);
      cache.get.mockResolvedValue(null);

      // Act
      await guard.canActivate(context);

      // Assert
      expect(cache.get).toHaveBeenCalledWith(expectedKey);
    });
  });
});
