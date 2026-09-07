/**
 * Health status constants
 */

/**
 * Health status for the overall API health check
 */
export const enum HealthStatus {
  Ok = 'ok',
  Error = 'error'
}

/**
 * Individual health indicator status
 */
export const enum IndicatorStatus {
  Up = 'up',
  Down = 'down',
  Degraded = 'degraded'
}

/**
 * Outbox health thresholds
 *
 * These thresholds determine when the outbox health check reports
 * degraded or down status based on pending and failed event counts.
 */
export const OUTBOX_HEALTH_THRESHOLDS = {
  /** Number of failed events that triggers "down" status */
  FAILED: 10,
  /** Number of pending events that triggers "degraded" status */
  PENDING: 100
} as const;
