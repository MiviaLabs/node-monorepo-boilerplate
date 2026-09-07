/**
 * Health Module Test Fixtures
 *
 * Shared test data and factory functions for health module tests.
 */

import { HealthStatus, IndicatorStatus } from '../../health.constants';

import type { HealthData } from '../../dto/health-response.dto';

/**
 * Creates mock health data for testing
 */
export function createMockHealthData(overrides: Partial<HealthData> = {}): HealthData {
  return {
    status: HealthStatus.Ok,
    message: 'API is healthy',
    version: '1.0.0',
    timestamp: '2024-01-01T00:00:00.000Z',
    details: {
      database: { status: IndicatorStatus.Up },
      redis: { status: IndicatorStatus.Up },
      outbox: { status: IndicatorStatus.Up }
    },
    ...overrides
  };
}

/**
 * Creates mock degraded health data
 */
export function createMockDegradedHealthData(overrides: Partial<HealthData> = {}): HealthData {
  return {
    status: HealthStatus.Error,
    message: 'API is degraded',
    version: '1.0.0',
    timestamp: '2024-01-01T00:00:00.000Z',
    details: {
      database: { status: IndicatorStatus.Up },
      redis: { status: IndicatorStatus.Up },
      outbox: { status: IndicatorStatus.Down, message: '3 failed events' }
    },
    ...overrides
  };
}

/**
 * Mock indicator status constants
 */
export const MOCK_INDICATORS = {
  UP: { status: IndicatorStatus.Up },
  DOWN: { status: IndicatorStatus.Down, message: 'Connection failed' },
  DEGRADED: { status: IndicatorStatus.Degraded, message: 'High latency' }
} as const;
