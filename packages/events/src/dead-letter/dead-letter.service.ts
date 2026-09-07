import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { metrics, trace, ValueType } from '@opentelemetry/api';

import { EventBus } from '../event-bus';
import { OutboxRepository } from '../outbox/outbox.repository';
import { sanitizeError } from '../utils/error-sanitizer';

import type { DeadLetterConfig } from '../config';
import type { OutboxRecord } from '@package/db-outbox';

/**
 * Error classification categories
 */
export enum ErrorClassification {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  UNKNOWN = 'unknown'
}

/**
 * Dead letter event information
 */
export interface DeadLetterEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  tenantId?: string;
  retryCount: number;
  errorMessage: string;
  deadLetteredAt: Date;
  reason: string;
}

/**
 * OpenTelemetry metrics for dead letter service
 */
interface DeadLetterMetrics {
  deadLetteredCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  replayCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  replayFailedCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
}

/**
 * Create dead letter metrics
 */
function createDeadLetterMetrics(): DeadLetterMetrics {
  const meter = metrics.getMeter('events-dead-letter');

  const deadLetteredCounter = meter.createCounter('dead_letter.total', {
    description: 'Number of events sent to dead letter queue',
    valueType: ValueType.INT
  });

  const replayCounter = meter.createCounter('dead_letter.replay_success', {
    description: 'Number of successfully replayed events from DLQ',
    valueType: ValueType.INT
  });

  const replayFailedCounter = meter.createCounter('dead_letter.replay_failed', {
    description: 'Number of failed replay attempts from DLQ',
    valueType: ValueType.INT
  });

  return {
    deadLetteredCounter,
    replayCounter,
    replayFailedCounter
  };
}

/**
 * Dead letter queue service
 *
 * Handles classification, storage, and replay of permanently failed events.
 * Events are sent to DLQ after exceeding maximum retry attempts.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(
 *     private readonly deadLetterService: DeadLetterService
 *   ) {}
 *
 *   async handleEventFailure(event: OutboxRecord, error: Error) {
 *     await this.deadLetterService.sendToDeadLetter(event, error);
 *   }
 * }
 * ```
 */
@Injectable()
export class DeadLetterService implements OnModuleDestroy {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly metrics: DeadLetterMetrics;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly outboxRepo: OutboxRepository,
    private readonly config: Required<DeadLetterConfig>
  ) {
    this.metrics = createDeadLetterMetrics();

    // Start cleanup job if enabled
    if (this.config.enabled) {
      this.startCleanup();
    }
  }

  /**
   * Cleanup on module destroy
   *
   * Clears the cleanup interval to prevent memory leaks.
   */
  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      this.logger.debug('Dead letter cleanup timer cleared');
    }
  }

  /**
   * Classify an error into a dead letter category
   *
   * Analyzes error messages and types to determine the appropriate
   * dead letter reason code.
   *
   * @param error - The error to classify
   * @returns Error classification category
   *
   * @example
   * ```typescript
   * const classification = this.deadLetterService.classifyError(error);
   * console.log(classification); // 'network' | 'timeout' | 'validation' | 'permission' | 'unknown'
   * ```
   */
  classifyError(error: unknown): ErrorClassification {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network errors
      if (
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('econnreset') ||
        message.includes('etimedout') ||
        message.includes('network') ||
        message.includes('connection')
      ) {
        return ErrorClassification.NETWORK;
      }

      // Timeout errors
      if (
        message.includes('timeout') ||
        message.includes('timed out') ||
        message.includes('deadline')
      ) {
        return ErrorClassification.TIMEOUT;
      }

      // Validation errors
      if (
        message.includes('validation') ||
        message.includes('invalid') ||
        message.includes('schema') ||
        message.includes('format')
      ) {
        return ErrorClassification.VALIDATION;
      }

      // Permission errors
      if (
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('permission') ||
        message.includes('access denied')
      ) {
        return ErrorClassification.PERMISSION;
      }
    }

    return ErrorClassification.UNKNOWN;
  }

  /**
   * Send event to dead letter queue
   *
   * Marks the event as dead-lettered with classification and optional alerting.
   * Includes OpenTelemetry tracing for observability.
   *
   * @param event - The outbox record to send to DLQ
   * @param error - The error that caused the failure
   *
   * @example
   * ```typescript
   * try {
   *   await this.publishEvent(event);
   * } catch (error) {
   *   await this.deadLetterService.sendToDeadLetter(event, error);
   * }
   * ```
   */
  async sendToDeadLetter(event: OutboxRecord, error: unknown): Promise<void> {
    const tracer = trace.getTracer('events-dead-letter');

    return tracer.startActiveSpan('DeadLetterService.sendToDeadLetter', async (span) => {
      try {
        const classification = this.classifyError(error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Add span attributes
        span.setAttribute('event.id', event.eventId);
        span.setAttribute('event.type', event.eventType);
        span.setAttribute('tenant.id', event.tenantId || 'unknown');
        span.setAttribute('dead_letter.classification', classification);
        span.setAttribute('event.retry_count', event.retryCount);

        // Sanitize error for logging (no PII)
        const sanitizedError = sanitizeError(errorMessage);

        // Mark as dead-lettered in database with tenant scoping
        if (!event.tenantId) {
          this.logger.warn(
            `Event ${event.eventId} has no tenant ID, skipping dead letter processing`
          );
          span.setAttribute('error', true);
          span.setAttribute('error.reason', 'missing_tenant_id');
          return;
        }

        await this.outboxRepo.markAsDeadLettered(event.eventId, event.tenantId, classification);

        // Log alert if configured
        if (this.config.alertOnFailure) {
          this.logger.error(`
╔══════════════════════════════════════════════════════════════════════╗
║                    DEAD LETTER QUEUE ALERT                              ║
╠══════════════════════════════════════════════════════════════════════╣
║ Event permanently failed and sent to dead letter queue                 ║
╠══════════════════════════════════════════════════════════════════════╣
║ Event ID:    ${event.eventId}
║ Event Type:  ${event.eventType}
║ Aggregate:   ${event.aggregateId}
║ Tenant:      ${event.tenantId || 'N/A'}
║ Retry Count: ${event.retryCount}
║ Reason:      ${classification}
║ Error:       ${sanitizedError}
╠══════════════════════════════════════════════════════════════════════╣
║ [ACTION] Review dead letter event and replay if appropriate             ║
╚══════════════════════════════════════════════════════════════════════╝
      `);
        }

        // Publish to dead letter topic (if configured)
        if (this.config.deadLetterTopic) {
          try {
            const payload = {
              eventId: event.eventId,
              eventType: event.eventType,
              aggregateId: event.aggregateId,
              tenantId: event.tenantId,
              retryCount: event.retryCount,
              errorMessage: sanitizedError,
              classification,
              deadLetteredAt: new Date().toISOString()
            };

            await this.eventBus.publish(this.config.deadLetterTopic, payload, {
              key: event.eventId,
              headers: {
                'event-id': event.eventId,
                'tenant-id': event.tenantId || '',
                classification: classification
              }
            });
          } catch (publishError) {
            // Log but don't fail - event is already dead-lettered in database
            this.logger.warn(
              `Failed to publish to dead letter topic: ${publishError instanceof Error ? publishError.message : String(publishError)}`
            );
          }
        }

        // Record metrics
        this.metrics.deadLetteredCounter.add(1, {
          classification,
          eventType: event.eventType
        });
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get dead-lettered events
   *
   * Retrieves events that have been sent to the dead letter queue.
   *
   * @param tenantId - Optional tenant ID for multi-tenancy
   * @returns Array of dead-lettered events
   *
   * @example
   * ```typescript
   * const deadEvents = await this.deadLetterService.getDeadLetteredEvents('tenant-123');
   * ```
   */
  async getDeadLetteredEvents(tenantId?: string): Promise<DeadLetterEvent[]> {
    const records = await this.outboxRepo.getDeadLetteredEvents(tenantId);

    return records.map((record) => ({
      eventId: record.eventId,
      eventType: record.eventType,
      aggregateId: record.aggregateId,
      tenantId: record.tenantId || undefined,
      retryCount: record.retryCount,
      errorMessage: record.errorMessage || '',
      deadLetteredAt: record.deadLetteredAt || new Date(),
      reason: record.deadLetterReason || 'unknown'
    }));
  }

  /**
   * Replay a dead-lettered event
   *
   * Resets the event for retry by clearing dead letter fields
   * and setting status back to pending.
   *
   * @param eventId - The event ID to replay
   * @returns true if replay was successful
   *
   * @example
   * ```typescript
   * const success = await this.deadLetterService.replayFromDeadLetter(eventId);
   * if (success) {
   *   console.log('Event queued for replay');
   * }
   * ```
   */
  async replayFromDeadLetter(eventId: string): Promise<boolean> {
    try {
      // Get the event to verify it exists
      const event = await this.outboxRepo.getById(eventId);

      if (!event) {
        this.logger.warn(`Event ${eventId} not found for replay`);
        return false;
      }

      if (!event.deadLetteredAt) {
        this.logger.warn(`Event ${eventId} is not dead-lettered`);
        return false;
      }

      if (!event.tenantId) {
        this.logger.warn(`Event ${eventId} has no tenant ID, cannot reset for replay`);
        return false;
      }

      // Reset for retry with tenant scoping
      await this.outboxRepo.resetForRetry(eventId, event.tenantId);

      this.logger.log(`Event ${eventId} reset for replay`, {
        eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId
      });

      // Record metrics
      this.metrics.replayCounter.add(1, {
        eventType: event.eventType
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to replay event ${eventId}: ${error instanceof Error ? error.message : String(error)}`
      );

      // Record metrics
      this.metrics.replayFailedCounter.add(1);

      return false;
    }
  }

  /**
   * Start periodic cleanup of old dead-lettered events
   *
   * Runs cleanup based on configured retention period.
   * Stores timer reference for cleanup on module destroy.
   */
  private startCleanup(): void {
    const intervalMs = this.config.cleanupInterval;

    this.cleanupTimer = setInterval(() => {
      this.cleanupOldDeadLetters().catch((error) => {
        this.logger.error('Error in dead letter cleanup', error);
      });
    }, intervalMs);

    this.logger.debug(`Dead letter cleanup timer started with interval ${intervalMs}ms`);
  }

  /**
   * Clean up old dead-lettered events
   *
   * Deletes dead-lettered events older than the retention period.
   */
  private async cleanupOldDeadLetters(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);

      await this.outboxRepo.cleanupDeadLetters(cutoffDate);

      this.logger.debug(`Cleaned up dead-lettered events older than ${cutoffDate.toISOString()}`, {
        cutoffDate: cutoffDate.toISOString(),
        retentionDays: this.config.retentionDays
      });
    } catch (error) {
      this.logger.error('Error cleaning up dead-lettered events', error);
    }
  }

  /**
   * Delete a specific dead-lettered event
   *
   * Permanently removes a dead-lettered event by ID.
   * Fetches the event first to get tenant ID for multi-tenancy isolation.
   *
   * @param eventId - The event ID to delete
   * @returns true if the event was deleted, false if not found
   *
   * @example
   * ```typescript
   * const deleted = await this.deadLetterService.deleteDeadLetteredEvent('event-123');
   * if (deleted) {
   *   console.log('Event deleted successfully');
   * }
   * ```
   */
  async deleteDeadLetteredEvent(eventId: string): Promise<boolean> {
    try {
      // Get the event first to verify it exists and get its tenant ID
      const event = await this.outboxRepo.getById(eventId);

      if (!event) {
        this.logger.warn(`Event ${eventId} not found for deletion`);
        return false;
      }

      if (!event.deadLetteredAt) {
        this.logger.warn(`Event ${eventId} is not dead-lettered`);
        return false;
      }

      if (!event.tenantId) {
        this.logger.warn(`Event ${eventId} has no tenant ID, cannot delete`);
        return false;
      }

      // Delete with tenant scoping
      const deleted = await this.outboxRepo.deleteDeadLetteredEvent(eventId, event.tenantId);

      if (deleted) {
        this.logger.log(`Deleted dead-lettered event ${eventId} for tenant ${event.tenantId}`);
      } else {
        this.logger.warn(`Dead-lettered event ${eventId} not found for tenant ${event.tenantId}`);
      }

      return deleted;
    } catch (error) {
      this.logger.error(
        `Failed to delete dead-lettered event ${eventId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }
}
