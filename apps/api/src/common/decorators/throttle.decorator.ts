import { SetMetadata } from '@nestjs/common';

import type { ThrottleOptions } from '../guards/throttle.guard';

export const THROTTLE_OPTIONS_KEY = 'throttle_options';

/**
 * Decorator to set rate limit options for a controller or method.
 *
 * Usage:
 * @Throttle(100, 60) // 100 requests per 60 seconds
 * @Get('users')
 * findAll() {}
 *
 * @Throttle(10, 60) // 10 requests per 60 seconds (stricter)
 * @Post('users')
 * create() {}
 *
 * @param limit - Maximum number of requests
 * @param ttl - Time window in seconds
 * @returns A decorator that sets throttle metadata on the target
 */
export const Throttle = (limit: number, ttl: number): ReturnType<typeof SetMetadata> =>
  SetMetadata(THROTTLE_OPTIONS_KEY, { limit, ttl } as ThrottleOptions);
