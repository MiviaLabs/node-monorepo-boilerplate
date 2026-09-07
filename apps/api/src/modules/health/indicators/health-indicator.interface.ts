import type { IndicatorStatus } from '../health.constants';

/**
 * Health indicator interface for implementing custom health checks
 */
export interface HealthIndicator {
  /**
   * Check health of the component
   * @returns Promise resolving to health status
   */
  check(): Promise<HealthIndicatorResult>;
}

/**
 * Health indicator result
 */
export interface HealthIndicatorResult {
  readonly status: IndicatorStatus;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}
