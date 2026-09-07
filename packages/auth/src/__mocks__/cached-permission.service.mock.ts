/**
 * Mock CachedPermissionService for unit testing
 *
 * This mock provides a no-op implementation of CachedPermissionService
 * that can be used in unit tests without requiring the full lazy-loaded
 * auth package.
 *
 * Usage in Jest tests:
 * ```typescript
 * jest.mock('@package/auth', () => ({
 *   CachedPermissionService: require('@package/auth/src/__mocks__/cached-permission.service.mock').MockCachedPermissionService,
 * }));
 * ```
 */

import type { CachedPermissionService } from '../services/cached-permission.service';

export class MockCachedPermissionService implements Partial<CachedPermissionService> {
  hasPermission = jest.fn().mockResolvedValue(true);
  getUserPermissions = jest.fn().mockResolvedValue([]);
  invalidatePermissions = jest.fn().mockResolvedValue(undefined);
  invalidateAllPermissions = jest.fn().mockResolvedValue(undefined);
  invalidateGlobalPermissions = jest.fn().mockResolvedValue(undefined);
  warmCache = jest.fn().mockResolvedValue(undefined);
}

export const MockCachedPermissionServiceProvider = {
  provide: 'CachedPermissionService',
  useClass: MockCachedPermissionService
};
