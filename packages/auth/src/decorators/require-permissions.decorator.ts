import { SetMetadata } from '@nestjs/common';

import { REQUIRED_PERMISSIONS_KEY } from '../types/permissions.types';

/**
 * Require specific permissions to access route
 *
 * @param permissions - Array of permission strings required to access the route
 * @returns Decorator function that sets required permissions metadata
 *
 * @example
 * ```typescript
 * // Require single permission
 * @RequirePermissions('tenant:users:create')
 * @Post()
 * async createUser() { ... }
 *
 * // Require multiple permissions (all must be present)
 * @RequirePermissions('tenant:users:create', 'tenant:users:read')
 * @Post()
 * async createUser() { ... }
 * ```
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
