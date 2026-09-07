import { createParamDecorator } from '@nestjs/common';

import type { ExecutionContext } from '@nestjs/common';

/**
 * Current user decorator
 *
 * Extracts the authenticated user from the request object
 * Works with JwtAuthGuard to populate req.user
 *
 * Usage:
 * - @CurrentUser() - Returns full CurrentUserData object
 * - @CurrentUser('userId') - Returns user.userId (string)
 * - @CurrentUser('tenantId') - Returns user.tenantId (string)
 * - @CurrentUser('roles') - Returns user.roles (readonly string[] | undefined)
 *
 * @example
 * ```typescript
 * @Get('profile')
 * getProfile(@CurrentUser() user: CurrentUserData) {
 *   return user;
 * }
 *
 * @Get('profile/:id')
 * getProfileById(@CurrentUser('userId') userId: string, @Param('id') id: string) {
 *   return this.service.findById(userId, id);
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof CurrentUserData | undefined,
    ctx: ExecutionContext
  ): CurrentUserData | string | string[] | readonly string[] | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserData }>();
    const user = request.user;

    if (!user) {
      throw new Error('User not found in request. Ensure JwtAuthGuard is applied.');
    }

    // If a property name is provided, return that specific property
    if (data) {
      return user[data];
    }

    // Otherwise return the full user object
    return user;
  }
);

/**
 * Current user data interface
 * Extracted from JWT payload by JwtAuthGuard
 *
 * NOTE: userId is a STRING in the JWT payload but represents a number ID from the database.
 * Controllers should convert to number when calling commands/queries that expect number.
 *
 * Permission resolution strategy:
 * - Custom JWT Provider: permissions embedded in token (permissions array populated)
 * - Firebase Provider: perm_version for cache lookup (permissions array empty, use permVersion)
 */
export interface CurrentUserData {
  readonly userId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly email?: string;
  readonly username?: string;
  readonly name?: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  readonly permVersion?: string; // Permission version for cache lookup (Firebase provider)
}
