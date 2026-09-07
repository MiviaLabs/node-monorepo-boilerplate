/**
 * JWT Auth Guard
 *
 * Guard to protect routes using JWT authentication
 */

import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { jwtService } from '../services/jwt.service';

import type { Observable } from 'rxjs';

// NOTE: Reflector and ExecutionContext MUST be value imports for NestJS DI metadata

/**
 * JWT authentication guard
 *
 * Extends Passport JWT guard with public route support.
 * Use this guard to protect routes that require authentication.
 *
 * @example Using JwtAuthGuard at controller level
 * ```typescript
 * import { Controller, Get, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, User, AuthenticatedUser } from '@package/auth';
 *
 * @Controller('users')
 * @UseGuards(JwtAuthGuard)
 * export class UsersController {
 *   @Get('profile')
 *   getProfile(@User() user: AuthenticatedUser) {
 *     return { userId: user.userId, tenantId: user.tenantId };
 *   }
 * }
 * ```
 *
 * @example Using JwtAuthGuard at method level with @Public() bypass
 * ```typescript
 * import { Controller, Get, UseGuards } from '@nestjs/common';
 * import { JwtAuthGuard, Public } from '@package/auth';
 *
 * @Controller('api')
 * @UseGuards(JwtAuthGuard)
 * export class ApiController {
 *   @Public()
 *   @Get('health')
 *   healthCheck() {
 *     return { status: 'ok' };
 *   }
 *
 *   @Get('protected')
 *   protectedEndpoint() {
 *     return { message: 'Authenticated access only' };
 *   }
 * }
 * ```
 *
 * @see Public - Decorator to mark routes as public (bypass authentication)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  /**
   * Check if route is public
   */
  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? false
    );
  }

  /**
   * Activate guard for non-public routes
   */
  override canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Allow access to public routes
    if (this.isPublic(context)) {
      return true;
    }

    // For protected routes, use standard Passport JWT authentication
    return super.canActivate(context);
  }

  /**
   * Handle authentication errors
   */
  override handleRequest<TUser = unknown>(err: unknown, user: TUser, _info: unknown): TUser {
    if (err || !user) {
      throw err instanceof Error
        ? new UnauthorizedException(err.message)
        : new UnauthorizedException();
    }
    return user;
  }
}

/**
 * Manual JWT validation guard (without Passport)
 *
 * Use this if you want to bypass Passport and use custom JWT validation.
 * Validates tokens directly using the jwtService singleton.
 *
 * @example Using JwtAuthManualGuard for custom token validation
 * ```typescript
 * import { Controller, Get, UseGuards } from '@nestjs/common';
 * import { JwtAuthManualGuard, User } from '@package/auth';
 *
 * @Controller('custom')
 * @UseGuards(JwtAuthManualGuard)
 * export class CustomController {
 *   @Get('data')
 *   getData(@User() user: { userId: string; tenantId: string }) {
 *     return { userId: user.userId, tenantId: user.tenantId };
 *   }
 * }
 * ```
 *
 * @see JwtAuthGuard - Preferred guard using Passport JWT strategy
 */
@Injectable()
export class JwtAuthManualGuard {
  constructor(private reflector: Reflector) {}

  /**
   * Check if route is public
   */
  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? false
    );
  }

  /**
   * Validate JWT from request
   */
  canActivate(context: ExecutionContext): boolean {
    // Allow access to public routes
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access token is missing');
    }

    try {
      // Validate token
      const result = jwtService.validate(token);

      if (!result.valid) {
        throw new UnauthorizedException(result.error ?? 'Invalid token');
      }

      // Attach user info to request
      request.user = {
        userId: result.userId,
        tenantId: result.tenantId
      };

      return true;
    } catch (error) {
      if (error instanceof Error) {
        throw new UnauthorizedException(error.message);
      }
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Extract token from Authorization header
   */
  private extractTokenFromHeader(request: unknown): string | undefined {
    const req = request as { headers?: { authorization?: string } };
    const [type, token] = req.headers?.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
