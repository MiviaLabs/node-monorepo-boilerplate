/**
 * Public Decorator
 *
 * Marks a route or controller as public (no authentication required)
 */

import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for public routes
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route or controller as public
 *
 * Routes marked with @Public() will not require authentication.
 * Use this to expose specific endpoints when JwtAuthGuard is applied globally.
 *
 * @returns Decorator function that sets public metadata
 * @example Using @Public() to bypass authentication on specific routes
 * ```typescript
 * import { Controller, Get, Post, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, Public, User } from '@package/auth';
 *
 * @Controller('api')
 * @UseGuards(JwtAuthGuard)
 * export class ApiController {
 *   @Public()
 *   @Get('health')
 *   healthCheck() {
 *     return { status: 'ok', timestamp: new Date().toISOString() };
 *   }
 *
 *   @Public()
 *   @Post('auth/login')
 *   login() {
 *     return this.authService.login();
 *   }
 *
 *   @Get('protected')
 *   protectedRoute(@User() user) {
 *     return { message: 'Authenticated access', userId: user.userId };
 *   }
 * }
 * ```
 *
 * @example Using @Public() at controller level
 * ```typescript
 * @Public()
 * @Controller('docs')
 * export class DocsController {
 *   @Get()
 *   getApiDocs() {
 *     return this.docsService.getOpenApiSpec();
 *   }
 * }
 * ```
 *
 * @see JwtAuthGuard - Guard that respects the @Public() decorator
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
