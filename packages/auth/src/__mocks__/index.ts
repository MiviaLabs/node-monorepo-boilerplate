/**
 * Jest manual mock for @package/auth
 *
 * This mock is automatically used by Jest when tests import from @package/auth
 * See jest.config.js moduleNameMapper for how this is resolved
 */

import type { CachedPermissionService } from '../services/cached-permission.service';

export class CachedPermissionService {
  hasPermission = jest.fn().mockResolvedValue(true);
  getUserPermissions = jest.fn().mockResolvedValue([]);
  invalidatePermissions = jest.fn().mockResolvedValue(undefined);
  invalidateAllPermissions = jest.fn().mockResolvedValue(undefined);
  invalidateGlobalPermissions = jest.fn().mockResolvedValue(undefined);
  warmCache = jest.fn().mockResolvedValue(undefined);
}
