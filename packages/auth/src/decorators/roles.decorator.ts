/**
 * Roles Decorator
 *
 * Marks a route or controller with required roles
 */

import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for required roles
 */
export const ROLES_KEY = 'roles';

/**
 * Specify required roles for a route or controller
 *
 * User must have at least one of the specified roles to access the route
 *
 * @param roles - Array of role names
 * @returns Decorator function that sets roles metadata
 * @example
 * ```typescript
 * @Roles('admin', 'moderator')
 * @Post('users')
 * createUser(@Body() dto: CreateUserDto) {
 *   return this.usersService.create(dto);
 * }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Require admin role
 *
 * @returns Decorator function that requires admin role
 * @example
 * ```typescript
 * @RequireAdmin()
 * @Delete('users/:id')
 * deleteUser(@Param('id') id: string) {
 *   return this.usersService.delete(id);
 * }
 * ```
 */
export const RequireAdmin = () => Roles('admin');

/**
 * Require moderator role
 *
 * @returns Decorator function that requires moderator or admin role
 * @example
 * ```typescript
 * @RequireModerator()
 * @Post('content/approve')
 * approveContent(@Param('id') id: string) {
 *   return this.contentService.approve(id);
 * }
 * ```
 */
export const RequireModerator = () => Roles('moderator', 'admin');

/**
 * Require user role (basic authenticated user)
 *
 * @returns Decorator function that requires user role
 * @example
 * ```typescript
 * @RequireUser()
 * @Get('profile')
 * getProfile(@Request() req) {
 *   return this.usersService.findOne(req.user.userId);
 * }
 * ```
 */
export const RequireUser = () => Roles('user');
