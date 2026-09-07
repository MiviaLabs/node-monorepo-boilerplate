import { createParamDecorator } from '@nestjs/common';
import { Errors } from '@package/errors';

import type { ExecutionContext } from '@nestjs/common';

/**
 * Request interface with user data from JWT
 */
interface RequestWithUser {
  user?: Record<string, unknown>;
}

/**
 * Decorator to inject user ID into controller methods
 *
 * Extracts userId from request.user (JWT payload populated by JwtAuthGuard).
 * Tries both 'userId' and 'sub' properties to support different JWT strategies.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * async getProfile(@UserId() userId: string) {
 *   // userId is the authenticated user's ID from JWT
 *   return this.service.findById(userId);
 * }
 * ```
 */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  const user = request.user;

  if (!user) {
    throw Errors.authauthenticationTokenIs002({});
  }

  // Try 'userId' first (standard JWT strategy), then 'sub' (OpenID Connect)
  const userId = (user['userId'] as string) || (user['sub'] as string);

  if (!userId || typeof userId !== 'string') {
    throw Errors.authauthenticationTokenIs003({});
  }

  return userId;
});
