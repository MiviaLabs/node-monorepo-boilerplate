import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { THROTTLE_OPTIONS_KEY } from '../decorators/throttle.decorator';
import { RateLimitService } from '../services/rate-limit.service';

import type { Request, Response } from 'express';

export interface ThrottleOptions {
  limit?: number;
  ttl?: number; // seconds
}

/**
 * Rate limiting guard using Redis backend.
 * Protects endpoints from abuse by limiting request rate.
 *
 * Usage:
 * @UseGuards(ThrottleGuard)
 * @Throttle(100, 60) // 100 requests per 60 seconds
 * @Controller('users')
 * export class PeopleController {}
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly logger = new Logger(ThrottleGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get throttle options from decorator or use defaults
    const throttleOptions = this.reflector.getAllAndOverride<ThrottleOptions>(
      THROTTLE_OPTIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    const limit =
      throttleOptions?.limit ?? this.configService.get<number>('rateLimit.defaultLimit') ?? 100;
    const ttl =
      throttleOptions?.ttl ?? this.configService.get<number>('rateLimit.defaultTtl') ?? 60;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Extract identifier for rate limiting
    const identifier = this.extractIdentifier(request);

    try {
      const allowed = await this.rateLimitService.checkLimit(identifier, limit, ttl);

      if (!allowed) {
        const retryAfter = await this.rateLimitService.getRetryAfter(identifier, ttl);

        this.logger.warn(`Rate limit exceeded for ${identifier} (${limit} requests/${ttl}s)`);

        // Set headers on response before throwing
        response.setHeader('X-RateLimit-Limit', limit.toString());
        response.setHeader('X-RateLimit-Remaining', '0');
        response.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + ttl).toString());
        response.setHeader('Retry-After', retryAfter.toString());

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded',
            retryAfter
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      // Add rate limit headers to response
      const remaining = await this.rateLimitService.getRemaining(identifier, limit);

      response.setHeader('X-RateLimit-Limit', limit.toString());
      response.setHeader('X-RateLimit-Remaining', remaining.toString());
      response.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000 + ttl).toString());

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Rate limit check failed for ${identifier}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      // Fail open - allow request if rate limit service fails
      return true;
    }
  }

  /**
   * Extract unique identifier for rate limiting.
   * Priority: API key > User ID > IP address
   */
  private extractIdentifier(request: Request): string {
    // Check for API key
    const apiKey =
      (request.headers['x-api-key'] as string | undefined) ??
      (request.query['apiKey'] as string | undefined) ??
      ((request.body as Record<string, unknown> | undefined)?.['apiKey'] as string | undefined);
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      return `api-key:${apiKey}`;
    }

    // Check for authenticated user
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const user = request.user as { id?: string } | undefined;
    if (user?.id) {
      return `user:${user.id}`;
    }

    // Fall back to IP address
    const ip = request.ip ?? request.socket?.remoteAddress;
    return `ip:${ip}`;
  }
}
