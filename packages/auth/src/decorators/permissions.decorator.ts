/**
 * Permissions Decorator
 *
 * Marks a route or controller with required permissions
 */

import { SetMetadata } from '@nestjs/common';

import { REQUIRED_PERMISSIONS_KEY } from '../types/permissions.types';

// Re-export for backward compatibility
export { REQUIRED_PERMISSIONS_KEY } from '../types/permissions.types';

/**
 * Specify required permissions for a route or controller
 *
 * User must have ALL of the specified permissions to access the route
 *
 * @param permissions - Array of permission names
 * @returns Decorator function that sets metadata
 * @example
 * ```typescript
 * @RequirePermissions('users:create', 'users:write')
 * @Post('users')
 * createUser(@Body() dto: CreateUserDto) {
 *   return this.usersService.create(dto);
 * }
 * ```
 */
export const RequirePermissions = (...permissions: string[]) => {
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
};

/**
 * Require any of the specified permissions
 *
 * User must have AT LEAST ONE of the specified permissions to access the route
 * This is used with AnyPermissionGuard
 *
 * @param permissions - Array of permission names
 * @returns Decorator function that sets metadata
 * @example
 * ```typescript
 * @RequireAnyPermission('users:read', 'users:write')
 * @Get('users')
 * listUsers() {
 *   return this.usersService.findAll();
 * }
 * ```
 */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/**
 * Require create permission
 *
 * @param resource - Resource name for the permission
 * @returns Decorator function that sets create permission
 * @example
 * ```typescript
 * @CanCreate('users')
 * @Post('users')
 * createUser(@Body() dto: CreateUserDto) {
 *   return this.usersService.create(dto);
 * }
 * ```
 */
export const CanCreate = (resource: string) => RequirePermissions(`${resource}:create`);

/**
 * Require read permission
 *
 * @param resource - Resource name for the permission
 * @returns Decorator function that sets read permission
 * @example
 * ```typescript
 * @CanRead('users')
 * @Get('users')
 * listUsers() {
 *   return this.usersService.findAll();
 * }
 * ```
 */
export const CanRead = (resource: string) => RequirePermissions(`${resource}:read`);

/**
 * Require update permission
 *
 * @param resource - Resource name for the permission
 * @returns Decorator function that sets update permission
 * @example
 * ```typescript
 * @CanUpdate('users')
 * @Patch('users/:id')
 * updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
 *   return this.usersService.update(id, dto);
 * }
 * ```
 */
export const CanUpdate = (resource: string) => RequirePermissions(`${resource}:update`);

/**
 * Require delete permission
 *
 * @param resource - Resource name for the permission
 * @returns Decorator function that sets delete permission
 * @example
 * ```typescript
 * @CanDelete('users')
 * @Delete('users/:id')
 * deleteUser(@Param('id') id: string) {
 *   return this.usersService.delete(id);
 * }
 * ```
 */
export const CanDelete = (resource: string) => RequirePermissions(`${resource}:delete`);

/**
 * Require full CRUD permissions
 *
 * @param resource - Resource name for the permission
 * @returns Decorator function that sets all CRUD permissions
 * @example
 * ```typescript
 * @CanManage('users')
 * @Controller('users')
 * export class UsersController {
 *   // All CRUD operations
 * }
 * ```
 */
export const CanManage = (resource: string) =>
  RequirePermissions(
    `${resource}:create`,
    `${resource}:read`,
    `${resource}:update`,
    `${resource}:delete`
  );
