/**
 * User Decorator
 *
 * Decorators to extract user information from the request
 */

import { createParamDecorator } from '@nestjs/common';

import type { ExecutionContext } from '@nestjs/common';

/**
 * Extract the authenticated user from the request
 *
 * When used without an argument, returns the full user object.
 * When used with a property name (e.g., 'userId', 'tenantId'), returns that specific property.
 *
 * @example Extracting full user object
 * ```typescript
 * import { Controller, Get, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, User } from '@package/auth';
 *
 * interface AuthenticatedUser {
 *   userId: string;
 *   tenantId: string;
 *   email: string;
 *   roles: string[];
 * }
 *
 * @Controller('users')
 * @UseGuards(JwtAuthGuard)
 * export class UsersController {
 *   @Get('profile')
 *   getProfile(@User() user: AuthenticatedUser) {
 *     return { userId: user.userId, email: user.email };
 *   }
 * }
 * ```
 *
 * @example Extracting specific property
 * ```typescript
 * @Get('my-orders')
 * getOrders(@User('userId') userId: string) {
 *   return this.ordersService.findByUser(userId);
 * }
 * ```
 *
 * @see UserId - Shorthand for @User('userId')
 * @see TenantId - Shorthand for @User('tenantId')
 */
export const User = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    return data ? user?.[data] : user;
  }
);

/**
 * Extract the user ID from the request
 *
 * @returns Decorator function that extracts userId
 * @example
 * ```typescript
 * @Get('posts')
 * getMyPosts(@UserId() userId: string) {
 *   return this.postsService.findByUser(userId);
 * }
 * ```
 */
export const UserId = () => User('userId');

/**
 * Extract the tenant ID from the request
 *
 * @returns Decorator function that extracts tenantId
 * @example
 * ```typescript
 * @Get('posts')
 * getPosts(@TenantId() tenantId: string) {
 *   return this.postsService.findByTenant(tenantId);
 * }
 * ```
 */
export const TenantId = () => User('tenantId');

/**
 * Extract the actor ID from the request
 *
 * The actor ID is the user who is performing the action.
 * This is useful for audit trails and logging.
 *
 * @returns Decorator function that extracts actorId
 * @example
 * ```typescript
 * @Post('posts')
 * createPost(@Body() dto: CreatePostDto, @ActorId() actorId: string) {
 *   return this.postsService.create(dto, actorId);
 * }
 * ```
 */
export const ActorId = () => User('actorId');

/**
 * Extract the username from the request
 *
 * @returns Decorator function that extracts username
 * @example
 * ```typescript
 * @Get('profile')
 * getProfile(@Username() username: string) {
 *   return this.usersService.findByUsername(username);
 * }
 * ```
 */
export const Username = () => User('username');

/**
 * Extract the email from the request
 *
 * @returns Decorator function that extracts email
 * @example
 * ```typescript
 * @Get('profile')
 * getProfile(@Email() email: string) {
 *   return this.usersService.findByEmail(email);
 * }
 * ```
 */
export const Email = () => User('email');

/**
 * Extract user roles from the request
 *
 * @returns Decorator function that extracts user roles
 * @example
 * ```typescript
 * @Get('admin/dashboard')
 * getDashboard(@UserRoles() roles: string[]) {
 *   if (!roles.includes('admin')) {
 *     throw new ForbiddenException();
 *   }
 *   return this.adminService.getDashboard();
 * }
 * ```
 */
export const UserRoles = () => User('roles');

/**
 * Extract user permissions from the request
 *
 * @returns Decorator function that extracts user permissions
 * @example
 * ```typescript
 * @Get('content/edit')
 * editContent(@UserPermissions() permissions: string[]) {
 *   if (!permissions.includes('content:write')) {
 *     throw new ForbiddenException();
 *   }
 *   return this.contentService.getEditable();
 * }
 * ```
 */
export const UserPermissions = () => User('permissions');
