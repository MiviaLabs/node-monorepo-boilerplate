import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { metrics, ValueType } from '@opentelemetry/api';

import { healthCheck } from '../client';
import { DeadLetterService } from '../dead-letter';
import { EventBus } from '../event-bus';
import { OutboxRepository } from './outbox.repository';

import type { InfrastructureEventsConfig } from '../config';
import type { Outbox } from '@package/db-outbox';

/**
 * OpenTelemetry metrics for outbox poller
 */
interface OutboxMetrics {
  pendingEventsCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  failedEventsCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  processingDurationHistogram: ReturnType<ReturnType<typeof metrics.getMeter>['createHistogram']>;
}

/**
 * Create outbox metrics
 */
function createOutboxMetrics(): OutboxMetrics {
  const meter = metrics.getMeter('events-outbox');

  const pendingEventsCounter = meter.createCounter('outbox.pending_events', {
    description: 'Number of pending events in outbox',
    valueType: ValueType.INT
  });

  const failedEventsCounter = meter.createCounter('outbox.failed_events', {
    description: 'Number of failed events in outbox',
    valueType: ValueType.INT
  });

  const processingDurationHistogram = meter.createHistogram('outbox.processing_duration_ms', {
    description: 'Duration of outbox processing in milliseconds',
    unit: 'ms',
    valueType: ValueType.DOUBLE
  });

  return {
    pendingEventsCounter,
    failedEventsCounter,
    processingDurationHistogram
  };
}

/**
 * Configuration for outbox poller
 */
export interface OutboxPollerConfig {
  /** Polling interval in milliseconds (default: 1000ms) */
  pollInterval: number;

  /** Maximum number of events to process per batch (default: 10) */
  batchSize: number;

  /** Maximum retry attempts before giving up (default: 5) */
  maxRetries: number;

  /** Retry backoff multiplier (default: 2) */
  retryBackoffMultiplier: number;

  /** Initial retry delay in milliseconds (default: 1000ms) */
  initialRetryDelay: number;

  /** Cleanup interval in milliseconds (default: 3600000ms = 1 hour) */
  cleanupInterval: number;

  /** Retention period for published events in days (default: 7) */
  retentionDays: number;

  /** Whether events are globally enabled (default: true) */
  eventsEnabled?: boolean;

  /** Worker identifier (for locking) */
  workerId: string;

  /** Enable/disable the poller (default: true) */
  enabled: boolean;

  /** Maximum retry attempts for Kafka connection verification (default: 3) */
  connectionRetryMax?: number;

  /** Delay between Kafka connection retry attempts in ms (default: 2000) */
  connectionRetryDelayMs?: number;
}

/**
 * Background worker that polls the outbox table and publishes events to Kafka
 *
 * This service runs continuously in the background, polling for pending events
 * and publishing them to Kafka. It handles retries with exponential backoff,
 * backpressure management, and periodic cleanup of old published events.
 *
 * The poller uses worker locking to prevent multiple instances from processing
 * the same event, making it safe to run in multi-instance deployments.
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [EventsModule],
 *   providers: [
 *     {
 *       provide: 'OUTBOX_POLLER_CONFIG',
 *       useValue: {
 *         ...outboxPollerConfig,
 *         pollInterval: 5000, // Custom poll interval
 *       }
 *     }
 *   ]
 * })
 * export class AppModule {}
 * ```
 */
@Injectable()
export class OutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPollerService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private processingStartTime: number | null = null;

  // Internal state to avoid mutating config
  private isEnabled: boolean;
  private readonly connectionRetryMax: number;
  private readonly connectionRetryDelayMs: number;

  // OpenTelemetry metrics
  private readonly metrics: OutboxMetrics;

  constructor(
    private readonly eventBus: EventBus,
    private readonly outboxRepo: OutboxRepository,
    private readonly config: OutboxPollerConfig,
    // Note: infrastructureConfig is injected but may not be directly used
    readonly infrastructureConfig?: InfrastructureEventsConfig,
    private readonly deadLetterService?: DeadLetterService
  ) {
    // Copy config.enabled to internal state to avoid mutation
    this.isEnabled = config.enabled;
    this.connectionRetryMax = config.connectionRetryMax ?? 3;
    this.connectionRetryDelayMs = config.connectionRetryDelayMs ?? 2000;
    // Initialize metrics
    this.metrics = createOutboxMetrics();
  }

  /**
   * Start the poller when module initializes
   */
  async onModuleInit() {
    // Skip initialization if events are globally disabled
    if (this.config.eventsEnabled === false) {
      this.logger.warn('Events are disabled globally, skipping outbox poller initialization');
      return;
    }

    this.logger.log('Initializing OutboxPollerService...');

    if (!this.isEnabled) {
      this.logger.warn('Outbox poller is disabled');
      return;
    }

    // Check Kafka connectivity first with retry logic
    try {
      const startTime = Date.now();
      const isConnected = await this.verifyKafkaConnection();
      const duration = Date.now() - startTime;

      if (!isConnected) {
        this.logger.warn(
          'Kafka connection failed, disabling outbox poller. ' +
            'Events will be stored in outbox table but not published to Kafka. ' +
            'The application will continue to run, but event publishing will be delayed until Kafka is available.',
          {
            workerId: this.config.workerId,
            connectionCheckDurationMs: duration
          }
        );
        this.isEnabled = false;
        return;
      }

      this.logger.log('Kafka connection verified, outbox poller enabled', {
        connectionCheckDurationMs: duration
      });
    } catch (error) {
      this.logger.warn(
        'Kafka connection check failed, disabling outbox poller. ' +
          'Events will be stored in outbox table but not published to Kafka. ' +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        {
          workerId: this.config.workerId,
          error: error instanceof Error ? error.message : String(error)
        }
      );
      this.isEnabled = false;
      return;
    }

    // Start polling
    this.startPolling();

    // Start cleanup job
    this.startCleanup();

    this.logger.log('Outbox poller started', {
      workerId: this.config.workerId,
      pollInterval: this.config.pollInterval,
      batchSize: this.config.batchSize
    });
  }

  /**
   * Stop the poller when module destroys
   */
  onModuleDestroy() {
    // Stop polling
    this.stopPolling();

    // Stop cleanup job
    this.stopCleanup();

    this.logger.log('Outbox poller stopped', {
      workerId: this.config.workerId
    });
  }

  /**
   * Verify Kafka connectivity on startup with retry logic
   *
   * Uses exponential backoff retry with configurable max attempts.
   * Returns true if connection succeeds, false otherwise.
   */
  private async verifyKafkaConnection(): Promise<boolean> {
    const timeout = 10000; // 10 seconds

    for (let attempt = 1; attempt <= this.connectionRetryMax; attempt++) {
      try {
        this.logger.debug(
          `Kafka connection verification attempt ${attempt}/${this.connectionRetryMax}`
        );

        // Race between health check and timeout
        const isConnected = await Promise.race([
          healthCheck(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeout))
        ]);

        if (isConnected) {
          if (attempt > 1) {
            this.logger.log(
              `Kafka connection verified on attempt ${attempt}/${this.connectionRetryMax}`
            );
          }
          return true;
        }

        // If not connected and this isn't the last attempt, retry with backoff
        if (attempt < this.connectionRetryMax) {
          const backoffDelay = this.connectionRetryDelayMs * attempt; // Linear backoff
          this.logger.debug(
            `Kafka connection failed, retrying in ${backoffDelay}ms (attempt ${attempt}/${this.connectionRetryMax})`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }
      } catch (error) {
        this.logger.debug('Kafka connectivity check threw error', {
          error: error instanceof Error ? error.message : String(error),
          attempt: `${attempt}/${this.connectionRetryMax}`
        });

        // If this isn't the last attempt, retry with backoff
        if (attempt < this.connectionRetryMax) {
          const backoffDelay = this.connectionRetryDelayMs * attempt;
          this.logger.debug(
            `Retrying Kafka connection in ${backoffDelay}ms (attempt ${attempt}/${this.connectionRetryMax})`
          );
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
        }
      }
    }

    // All attempts failed
    this.logger.warn(
      `Kafka connection verification failed after ${this.connectionRetryMax} attempts`
    );
    return false;
  }

  /**
   * Start polling for pending events
   */
  private startPolling() {
    this.pollTimer = setInterval(() => {
      this.processPendingEvents().catch((error) => {
        this.logger.error('Error in poll timer', error);
      });
    }, this.config.pollInterval);
  }

  /**
   * Stop polling
   */
  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Process pending events from outbox table
   *
   * This method polls for pending and retryable events,
   * then processes each event by publishing to Kafka.
   */
  private async processPendingEvents() {
    // Prevent concurrent processing
    if (this.isProcessing) {
      const processingDuration = this.processingStartTime
        ? Date.now() - this.processingStartTime
        : 0;

      this.logger.debug('Already processing, skipping poll', {
        processingDurationMs: processingDuration,
        pollIntervalMs: this.config.pollInterval,
        workerId: this.config.workerId
      });
      return;
    }

    this.isProcessing = true;
    this.processingStartTime = Date.now();

    try {
      // Atomically claim pending events using FOR UPDATE SKIP LOCKED
      const pendingEvents = await this.outboxRepo.claimPending(
        this.config.batchSize,
        this.config.workerId
      );

      // Atomically claim retryable failed events using FOR UPDATE SKIP LOCKED
      const retryableEvents = await this.outboxRepo.claimRetryable(
        this.config.batchSize,
        this.config.workerId
      );

      const allEvents = [...pendingEvents, ...retryableEvents];

      if (allEvents.length === 0) {
        return;
      }

      this.logger.debug(`Processing ${allEvents.length} events`, {
        pending: pendingEvents.length,
        retryable: retryableEvents.length
      });

      // Process each event sequentially to maintain ordering
      for (const event of allEvents) {
        await this.processEvent(event);
      }

      // Log completion with timing
      const duration = Date.now() - (this.processingStartTime || Date.now());
      this.logger.debug(`Processed ${allEvents.length} events`, {
        durationMs: duration,
        pending: pendingEvents.length,
        retryable: retryableEvents.length
      });

      // Record metrics
      this.metrics.processingDurationHistogram.record(duration);
    } catch (error) {
      this.logger.error('Error processing pending events', error);
    } finally {
      this.isProcessing = false;
      this.processingStartTime = null;
    }
  }

  /**
   * Process a single outbox event
   *
   * Attempts to publish the event to Kafka, handling errors and retries.
   * Events are already atomically claimed via claimPending/claimRetryable,
   * so no additional locking is needed.
   *
   * @param event - The outbox record to process (already claimed/locked)
   */

  private async processEvent(event: Outbox) {
    try {
      // Check retry limit
      if (event.retryCount >= this.config.maxRetries) {
        // Send to dead letter queue if service is available
        if (this.deadLetterService) {
          const error = new Error(event.errorMessage || 'Max retries exceeded');
          await this.deadLetterService.sendToDeadLetter(event, error);
        } else {
          // Fallback: Log DLQ alert (for backwards compatibility)
          this.logger.error(`
╔══════════════════════════════════════════════════════════════════════╗
║                    DEAD LETTER QUEUE ALERT                              ║
╠══════════════════════════════════════════════════════════════════════╣
║ Event permanently failed after ${this.config.maxRetries} retries               ║
╠══════════════════════════════════════════════════════════════════════╣
║ Event ID:    ${event.eventId}
║ Event Type:  ${event.eventType}
║ Aggregate:   ${event.aggregateId}
║ Tenant:      ${event.tenantId || 'N/A'}
║ Retry Count: ${event.retryCount}
║ Last Error:  ${event.errorMessage || 'Unknown'}
╠══════════════════════════════════════════════════════════════════════╣
║ [ALERT] This event has been moved to the dead-letter queue             ║
║ [ACTION] Required: Manual investigation may be needed                  ║
╚══════════════════════════════════════════════════════════════════════╝
          `);

          // Mark as permanently failed (far future retry date = won't retry)
          await this.outboxRepo.markAsFailed(
            event.eventId,
            'Max retries exceeded',
            new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // Far future
          );
        }

        return;
      }

      // Events are already atomically claimed by claimPending/claimRetryable
      // using FOR UPDATE SKIP LOCKED, so no additional lock check is needed.

      // Parse payload (jsonb from PostgreSQL is already parsed as unknown)
      let payload: unknown;
      try {
        // Drizzle returns jsonb as unknown - it may already be an object
        payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      } catch (error) {
        throw new Error(`Invalid JSON payload: ${String(error)}`);
      }

      // Publish to Kafka
      await this.eventBus.publish(event.eventType, payload, {
        key: event.aggregateId,
        headers: {
          'correlation-id': event.correlationId || '',
          'causation-id': event.causationId || '',
          'tenant-id': event.tenantId || '',
          'event-id': event.eventId,
          'schema-version': event.schemaVersion || '1.0'
        }
      });

      // Mark as published
      await this.outboxRepo.markAsPublished(event.eventId);

      this.logger.debug(`Event ${event.eventId} published successfully`, {
        eventId: event.eventId,
        eventType: event.eventType,
        aggregateId: event.aggregateId
      });
    } catch (error) {
      // Calculate next retry time with exponential backoff
      const retryDelay =
        this.config.initialRetryDelay *
        Math.pow(this.config.retryBackoffMultiplier, event.retryCount || 0);

      const nextRetryAt = new Date(Date.now() + retryDelay);

      this.logger.error(
        `Failed to publish event ${event.eventId}, retrying at ${nextRetryAt.toISOString()}`,
        error
      );

      // Mark as failed (will retry)
      await this.outboxRepo.markAsFailed(
        event.eventId,
        error instanceof Error ? error.message : String(error),
        nextRetryAt
      );
    }
  }

  /**
   * Start cleanup job
   */
  private startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldEvents().catch((error) => {
        this.logger.error('Error in cleanup timer', error);
      });
    }, this.config.cleanupInterval);
  }

  /**
   * Stop cleanup job
   */
  private stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up old published events
   *
   * Deletes published events older than the retention period.
   * This prevents the outbox table from growing indefinitely.
   */
  private async cleanupOldEvents() {
    try {
      const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);

      await this.outboxRepo.cleanup(cutoffDate);

      this.logger.debug(
        JSON.stringify({
          type: 'outbox_cleanup',
          cutoffDate: cutoffDate.toISOString(),
          retentionDays: this.config.retentionDays
        })
      );
    } catch (error) {
      this.logger.error('Error cleaning up old events', error);
    }
  }

  /**
   * Get poller health status
   *
   * Returns information about the poller's health and state.
   * Useful for health checks and monitoring.
   *
   * @returns Health status object
   *
   * @example
   * ```typescript
   * const health = await this.outboxPoller.getHealth();
   * console.log(health);
   * // {
   * //   isProcessing: false,
   * //   workerId: 'worker-123-456',
   * //   enabled: true,
   * //   pendingCount: 5,
   * //   failedCount: 2
   * // }
   * ```
   */
  async getHealth() {
    // If events are globally disabled, return healthy status with zero counts
    if (this.config.eventsEnabled === false) {
      return {
        isProcessing: false,
        workerId: this.config.workerId,
        enabled: this.isEnabled,
        pendingCount: 0,
        failedCount: 0,
        eventsEnabled: false
      };
    }

    const [pendingCount, failedCount] = await Promise.all([
      this.outboxRepo.getPendingCount(),
      this.outboxRepo.getFailedCount()
    ]);

    // Record metrics
    this.metrics.pendingEventsCounter.add(pendingCount);
    this.metrics.failedEventsCounter.add(failedCount);

    return {
      isProcessing: this.isProcessing,
      workerId: this.config.workerId,
      enabled: this.isEnabled,
      pendingCount,
      failedCount,
      eventsEnabled: true
    };
  }
}
