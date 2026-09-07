import { Inject, Injectable } from '@nestjs/common';
import { OutboxPollerService } from '@package/events';

import { IndicatorStatus, OUTBOX_HEALTH_THRESHOLDS } from '../health.constants';
import { HealthIndicator, HealthIndicatorResult } from './health-indicator.interface';

/**
 * Outbox Health Indicator
 *
 * Checks the health of the outbox poller service.
 * Returns the number of pending and failed events.
 */
@Injectable()
export class OutboxHealthIndicator implements HealthIndicator {
  constructor(@Inject(OutboxPollerService) private readonly outboxPoller: OutboxPollerService) {}

  /**
   * Check outbox health
   *
   * Health criteria:
   * - Healthy: No failed events, less than OUTBOX_HEALTH_THRESHOLDS.PENDING pending events
   * - Degraded: Some failed events or many pending events
   * - Down: Critical number of failed/pending events
   *
   * @returns Promise resolving to health indicator result
   */
  async check(): Promise<HealthIndicatorResult> {
    const health = await this.outboxPoller.getHealth();

    // Determine health status
    let status: IndicatorStatus;
    let message: string | undefined;

    if (health.failedCount >= OUTBOX_HEALTH_THRESHOLDS.FAILED) {
      status = IndicatorStatus.Down;
      message = `Too many failed events (${health.failedCount})`;
    } else if (health.failedCount > 0 || health.pendingCount >= OUTBOX_HEALTH_THRESHOLDS.PENDING) {
      status = IndicatorStatus.Degraded;
      message =
        health.failedCount > 0
          ? `${health.failedCount} failed events`
          : `${health.pendingCount} pending events`;
    } else {
      status = IndicatorStatus.Up;
    }

    return {
      status,
      ...(message !== undefined && { message }),
      details: {
        pendingCount: health.pendingCount,
        failedCount: health.failedCount,
        isProcessing: health.isProcessing,
        workerId: health.workerId,
        enabled: health.enabled,
        eventsEnabled: health.eventsEnabled
      }
    };
  }
}
