import { Injectable } from '@nestjs/common';
import { RedisModule } from '@package/redis';

import { IndicatorStatus } from '../health.constants';
import { HealthIndicator, HealthIndicatorResult } from './health-indicator.interface';

/**
 * Redis Health Indicator
 *
 * Checks Redis connectivity by using the RedisModule.healthCheck() method.
 * Leverages the built-in health check from the redis package.
 */
@Injectable()
export class RedisHealthIndicator implements HealthIndicator {
  /**
   * Check Redis connectivity
   *
   * Uses RedisModule.healthCheck() to verify the Redis connection is healthy.
   * The health check returns true if the Redis client is connected and responsive.
   *
   * @returns Promise resolving to health indicator result
   */
  async check(): Promise<HealthIndicatorResult> {
    try {
      const isHealthy = await RedisModule.healthCheck();

      return isHealthy
        ? { status: IndicatorStatus.Up }
        : { status: IndicatorStatus.Down, message: 'Redis connection failed' };
    } catch (error) {
      return {
        status: IndicatorStatus.Down,
        message: error instanceof Error ? error.message : 'Unknown Redis error'
      };
    }
  }
}
