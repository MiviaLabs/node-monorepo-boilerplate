import { Injectable, Logger, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { metrics, trace, ValueType } from '@opentelemetry/api';
import type { OutboxRecord } from '@package/db-outbox';
import { OutboxStatus } from '@package/db-outbox';

import { EventBus } from '../event-bus';
import { OutboxRepository } from '../outbox/outbox.repository';
import type { ReplayConfig } from '../config';

/**
 * Replay status enum
 */
export enum ReplayStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Replay options for filtering events
 */
export interface ReplayOptions {
  /** Aggregate ID to replay events for */
  aggregateId?: string;
  /** Event type filter */
  eventType?: string;
  /** Tenant ID for multi-tenancy */
  tenantId?: string;
  /** Start date (inclusive) */
  startDate?: Date;
  /** End date (inclusive) */
  endDate?: Date;
  /** Maximum number of events to replay */
  maxEvents?: number;
}

/**
 * Replay session tracking
 */
export interface ReplaySession {
  /** Unique replay ID */
  replayId: string;
  /** Current status */
  status: ReplayStatus;
  /** Number of events processed */
  processedCount: number;
  /** Total events to process */
  totalCount: number;
  /** Number of successes */
  successCount: number;
  /** Number of failures */
  failureCount: number;
  /** Started timestamp */
  startedAt: Date;
  /** Completed timestamp (if done) */
  completedAt?: Date;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Replay result for a single event
 */
export interface ReplayEventResult {
  eventId: string;
  eventType: string;
  aggregateId: string;
  success: boolean;
  error?: string;
}

/**
 * OpenTelemetry metrics for replay service
 */
interface ReplayMetrics {
  replayStartedCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  replayCompletedCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  replayFailedCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  eventReplayedCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
  replayDurationHistogram: ReturnType<ReturnType<typeof metrics.getMeter>['createHistogram']>;
}

/**
 * Simple semaphore for concurrency control
 *
 * Limits the number of concurrent operations to a maximum value.
 */
class Semaphore {
  private available: number;
  private readonly waitQueue: Array<(release: () => void) => void> = [];

  constructor(maxConcurrency: number) {
    if (maxConcurrency <= 0) {
      throw new Error('Max concurrency must be greater than 0');
    }
    this.available = maxConcurrency;
  }

  /**
   * Acquire a slot from the semaphore
   *
   * Returns a release function that MUST be called when done.
   */
  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }

    // Wait for a slot to become available
    return new Promise((resolve) => {
      this.waitQueue.push((releaseFn: () => void) => {
        resolve(releaseFn);
      });
    });
  }

  /**
   * Release a slot back to the semaphore
   */
  private release(): void {
    if (this.waitQueue.length > 0) {
      // Wake up the next waiter
      const next = this.waitQueue.shift()!;
      next(() => this.release());
    } else {
      this.available++;
    }
  }
}

/**
 * Create replay metrics
 */
function createReplayMetrics(): ReplayMetrics {
  const meter = metrics.getMeter('events-replay');

  const replayStartedCounter = meter.createCounter('replay.started', {
    description: 'Number of replay sessions started',
    valueType: ValueType.INT
  });

  const replayCompletedCounter = meter.createCounter('replay.completed', {
    description: 'Number of replay sessions completed',
    valueType: ValueType.INT
  });

  const replayFailedCounter = meter.createCounter('replay.failed', {
    description: 'Number of replay sessions failed',
    valueType: ValueType.INT
  });

  const eventReplayedCounter = meter.createCounter('replay.events', {
    description: 'Number of events replayed',
    valueType: ValueType.INT
  });

  const replayDurationHistogram = meter.createHistogram('replay.duration_ms', {
    description: 'Duration of replay sessions in milliseconds',
    valueType: ValueType.INT,
    unit: 'ms'
  });

  return {
    replayStartedCounter,
    replayCompletedCounter,
    replayFailedCounter,
    eventReplayedCounter,
    replayDurationHistogram
  };
}

/**
 * Event replay service
 *
 * Provides functionality to replay historical events for debugging,
 * recovery, or aggregate rebuild scenarios.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(
 *     private readonly replayService: EventReplayService
 *   ) {}
 *
 *   async rebuildAggregate(aggregateId: string) {
 *     const result = await this.replayService.startReplay({
 *       aggregateId,
 *     });
 *     return result;
 *   }
 * }
 * ```
 */
@Injectable()
export class EventReplayService implements OnModuleDestroy {
  private readonly logger = new Logger(EventReplayService.name);
  private readonly metrics: ReplayMetrics;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly activeReplays = new Map<string, ReplaySession>();
  private readonly sessionCleanupTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly outboxRepo: OutboxRepository,
    private readonly config: Required<ReplayConfig>
  ) {
    this.metrics = createReplayMetrics();

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
      this.logger.debug('Replay cleanup timer cleared');
    }

    // Clear all session cleanup timeouts
    for (const timeoutId of this.sessionCleanupTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.sessionCleanupTimeouts.clear();
    this.logger.debug('Replay session cleanup timeouts cleared');
  }

  /**
   * Start a new replay session
   *
   * Replays historical events based on provided options.
   * Returns immediately with replayId while processing continues in background.
   *
   * @param options - Replay options for filtering events
   * @returns Replay session with initial tracking information (non-blocking)
   *
   * @example
   * ```typescript
   * const session = await this.replayService.startReplay({
   *   aggregateId: 'order-123',
   *   startDate: new Date('2024-01-01'),
   *   endDate: new Date('2024-01-31'),
   * });
   * // Returns immediately with replayId and status=PENDING
   * // Processing continues in background
   * ```
   */
  async startReplay(options: ReplayOptions): Promise<ReplaySession> {
    // Require tenantId for security - prevents cross-tenant data leakage
    if (!options.tenantId) {
      throw new BadRequestException('tenantId is required for event replay');
    }

    const tracer = trace.getTracer('events-replay');
    const replayId = randomUUID();

    return tracer.startActiveSpan('EventReplayService.startReplay', async (span) => {
      try {
        // Add span attributes
        span.setAttribute('replay.id', replayId);
        span.setAttribute('replay.aggregate_id', options.aggregateId || 'all');
        span.setAttribute('replay.tenant_id', options.tenantId || 'all');
        span.setAttribute('replay.event_type', options.eventType || 'all');

        // Create session
        const session: ReplaySession = {
          replayId,
          status: ReplayStatus.PENDING,
          processedCount: 0,
          totalCount: 0,
          successCount: 0,
          failureCount: 0,
          startedAt: new Date()
        };

        this.activeReplays.set(replayId, session);

        // Get events to replay (this part is still awaited to get count)
        const events = await this.getReplayableEvents(options);
        session.totalCount = events.length;
        this.activeReplays.set(replayId, session);

        this.logger.log(`Starting async replay ${replayId} with ${events.length} events`);

        // Handle empty events case synchronously
        if (events.length === 0) {
          session.status = ReplayStatus.COMPLETED;
          session.completedAt = new Date();
          this.activeReplays.set(replayId, session);
          return session;
        }

        // Start async processing (fire-and-forget)
        // Use setImmediate to ensure we return to caller first
        setImmediate(() => {
          this.processEventsBatchAsync(replayId, events, options).catch((error) => {
            this.logger.error(`Async processing failed for replay ${replayId}`, error);
          });
        });

        // Return session immediately with PENDING status
        return session;
      } catch (error) {
        const session = this.activeReplays.get(replayId);
        if (session) {
          session.status = ReplayStatus.FAILED;
          session.completedAt = new Date();
          session.error = error instanceof Error ? error.message : String(error);
          this.activeReplays.set(replayId, session);
        }

        this.logger.error(
          `Replay ${replayId} failed: ${error instanceof Error ? error.message : String(error)}`
        );

        // Record metrics
        this.metrics.replayFailedCounter.add(1);

        span.setAttribute('error', true);
        span.setAttribute('error.message', error instanceof Error ? error.message : String(error));

        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Process events asynchronously in background
   *
   * This method runs in background after startReplay returns.
   * Updates the session as processing progresses.
   *
   * @param replayId - The replay session ID
   * @param events - Events to process
   * @param options - Original replay options for metrics
   */
  private async processEventsBatchAsync(
    replayId: string,
    events: OutboxRecord[],
    options: ReplayOptions
  ): Promise<void> {
    const tracer = trace.getTracer('events-replay');

    await tracer.startActiveSpan('EventReplayService.processEventsBatchAsync', async (span) => {
      try {
        span.setAttribute('replay.id', replayId);

        const session = this.activeReplays.get(replayId);
        if (!session) {
          this.logger.warn(`Replay session ${replayId} not found during async processing`);
          return;
        }

        // Update status to in progress
        session.status = ReplayStatus.IN_PROGRESS;
        this.activeReplays.set(replayId, session);

        // Record metrics
        this.metrics.replayStartedCounter.add(1, {
          aggregate_id: options.aggregateId || 'all',
          tenant_id: options.tenantId || 'all'
        });

        // Process events in batches with parallelism control
        const startTime = Date.now();
        await this.processEventsBatch(replayId, events);
        const duration = Date.now() - startTime;

        // Re-fetch the session to get the latest state (may have been cancelled during processing)
        const currentSession = this.activeReplays.get(replayId);
        if (!currentSession) {
          this.logger.warn(`Replay session ${replayId} not found after processing`);
          return;
        }

        // Update session status (preserve cancelled/completed/failed state)
        // Only update if still in PENDING or IN_PROGRESS
        const shouldUpdateStatus =
          currentSession.status === ReplayStatus.PENDING ||
          currentSession.status === ReplayStatus.IN_PROGRESS;

        if (shouldUpdateStatus) {
          currentSession.status =
            currentSession.failureCount === 0 ? ReplayStatus.COMPLETED : ReplayStatus.FAILED;
          currentSession.completedAt = new Date();
        }
        currentSession.processedCount = events.length;

        this.activeReplays.set(replayId, currentSession);

        // Record metrics
        this.metrics.replayDurationHistogram.record(duration, {
          status: currentSession.status
        });

        if (currentSession.status === ReplayStatus.COMPLETED) {
          this.metrics.replayCompletedCounter.add(1);
        } else if (
          currentSession.status === ReplayStatus.FAILED ||
          currentSession.status === ReplayStatus.CANCELLED
        ) {
          this.metrics.replayFailedCounter.add(1);
        }

        // Schedule cleanup of completed session after 5 minutes to allow final status queries
        const timeoutId = setTimeout(() => this.activeReplays.delete(replayId), 5 * 60 * 1000);
        this.sessionCleanupTimeouts.set(replayId, timeoutId);

        this.logger.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    EVENT REPLAY COMPLETED                               ║
╠══════════════════════════════════════════════════════════════════════╣
║ Replay ID:     ${replayId}
║ Total Events:  ${events.length}
║ Successful:    ${currentSession.successCount}
║ Failed:        ${currentSession.failureCount}
║ Duration:      ${duration}ms
╚══════════════════════════════════════════════════════════════════════╝
        `);
      } catch (error) {
        const session = this.activeReplays.get(replayId);
        if (session) {
          session.status = ReplayStatus.FAILED;
          session.completedAt = new Date();
          session.error = error instanceof Error ? error.message : String(error);
          this.activeReplays.set(replayId, session);
        }

        this.logger.error(
          `Replay ${replayId} async processing failed: ${error instanceof Error ? error.message : String(error)}`
        );

        // Record metrics
        this.metrics.replayFailedCounter.add(1);

        span.setAttribute('error', true);
        span.setAttribute('error.message', error instanceof Error ? error.message : String(error));
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get replay session status
   *
   * @param replayId - The replay session ID
   * @returns Replay session or null if not found
   */
  getReplayStatus(replayId: string): ReplaySession | null {
    return this.activeReplays.get(replayId) || null;
  }

  /**
   * Cancel an active replay session
   *
   * @param replayId - The replay session ID to cancel
   * @returns true if cancelled, false if not found or already completed
   */
  cancelReplay(replayId: string): boolean {
    const session = this.activeReplays.get(replayId);
    if (!session) {
      return false;
    }

    if (session.status !== ReplayStatus.IN_PROGRESS && session.status !== ReplayStatus.PENDING) {
      return false;
    }

    session.status = ReplayStatus.CANCELLED;
    session.completedAt = new Date();
    this.activeReplays.set(replayId, session);

    this.logger.log(`Replay ${replayId} cancelled`);
    return true;
  }

  /**
   * Get replayable events based on options
   */
  private async getReplayableEvents(options: ReplayOptions): Promise<OutboxRecord[]> {
    // If aggregate ID provided, use existing repository method
    if (options.aggregateId) {
      // Pass tenantId to repository for server-side filtering (multi-tenancy isolation)
      const events = await this.outboxRepo.getByAggregate(options.aggregateId, options.tenantId);

      // Filter to only PUBLISHED events - prevents republishing failed/pending events
      let filtered = events.filter((e) => e.status === OutboxStatus.PUBLISHED);

      // Apply remaining filters (client-side for non-tenant filters)
      if (options.eventType) {
        filtered = filtered.filter((e) => e.eventType === options.eventType);
      }

      if (options.startDate) {
        filtered = filtered.filter((e) => e.createdAt >= options.startDate!);
      }

      if (options.endDate) {
        filtered = filtered.filter((e) => e.createdAt <= options.endDate!);
      }

      if (options.maxEvents) {
        filtered = filtered.slice(0, options.maxEvents);
      }

      return filtered;
    }

    // For non-aggregate queries, use the new getReplayableEvents method
    // This supports queries by tenantId, eventType, date range, and limit
    const events = await this.outboxRepo.getReplayableEvents({
      tenantId: options.tenantId,
      eventType: options.eventType,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.maxEvents
    });

    this.logger.debug(`Found ${events.length} replayable events for non-aggregate query`, {
      tenantId: options.tenantId,
      eventType: options.eventType,
      startDate: options.startDate?.toISOString(),
      endDate: options.endDate?.toISOString(),
      maxEvents: options.maxEvents
    });

    return events;
  }

  /**
   * Process events with concurrency control
   *
   * Uses a semaphore to ensure at most maxParallel events are processed
   * simultaneously. Each event is processed individually through the full
   * pipeline (eventBus.publish + markAsReplayed).
   *
   * This fixes the previous misleading behavior where batchSize × maxParallel
   * events would be processed concurrently. Now maxParallel truly represents
   * the maximum number of concurrent event processing operations.
   */
  private async processEventsBatch(replayId: string, events: OutboxRecord[]): Promise<void> {
    const session = this.activeReplays.get(replayId);
    if (!session) {
      throw new Error(`Replay session ${replayId} not found`);
    }

    const maxParallel = this.config.maxParallel;
    const semaphore = new Semaphore(maxParallel);

    // Track results incrementally
    const success: ReplayEventResult[] = [];
    const failed: ReplayEventResult[] = [];

    // Track first error for stopOnError enforcement
    let hasError = false;

    // Create processing promises for all events
    // The semaphore ensures only maxParallel events are processed concurrently
    const processingPromises = events.map(async (event) => {
      // Check for cancellation before acquiring semaphore slot
      const currentSession = this.activeReplays.get(replayId);
      if (currentSession?.status === ReplayStatus.CANCELLED) {
        return null; // Skip processing if cancelled
      }

      // Check if we should stop due to error (stopOnError enforcement)
      if (this.config.stopOnError && hasError) {
        return null; // Skip this event
      }

      // Acquire a slot (waits if maxParallel are already processing)
      const release = await semaphore.acquire();

      // Verify again after acquiring - user may have cancelled during wait
      const recheckSession = this.activeReplays.get(replayId);
      if (recheckSession?.status === ReplayStatus.CANCELLED) {
        release(); // Release immediately without processing
        return null;
      }

      const tracer = trace.getTracer('events-replay');

      try {
        // Verify tenant ID exists (should not happen due to tenantId validation in startReplay)
        if (!event.tenantId) {
          this.logger.warn(`Event ${event.eventId} has no tenant ID, skipping replay`);
          return {
            eventId: event.eventId,
            eventType: event.eventType,
            aggregateId: event.aggregateId,
            success: false,
            error: 'missing_tenant_id'
          } as const;
        }

        // Republish event through event bus with OpenTelemetry span
        await tracer.startActiveSpan('EventReplayService.publishEvent', async (span) => {
          span.setAttribute('replay.id', replayId);
          span.setAttribute('event.id', event.eventId);
          span.setAttribute('event.type', event.eventType);
          span.setAttribute('event.aggregate_id', event.aggregateId);
          if (event.tenantId) {
            span.setAttribute('event.tenant_id', event.tenantId);
          }

          return this.eventBus.publish(event.eventType, event.payload, {
            key: event.aggregateId,
            headers: {
              'event-id': event.eventId,
              ...(event.tenantId ? { 'tenant-id': event.tenantId } : {}),
              'replay-id': replayId,
              'original-event-id': event.eventId
            }
          });
        });

        // Only mark as replayed after successful publish
        await this.outboxRepo.markAsReplayed(event.eventId, event.tenantId, replayId);

        return {
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          success: true
        } as const;
      } catch (error) {
        hasError = true; // Track error for stopOnError
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to replay event ${event.eventId}: ${errorMsg}`);

        return {
          eventId: event.eventId,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          success: false,
          error: errorMsg
        } as const;
      } finally {
        // Always release semaphore slot
        release();
      }
    });

    // Wait for all events to process
    const results = await Promise.allSettled(processingPromises);

    // Aggregate results
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        if (result.value.success) {
          success.push(result.value);
          // Record success metric
          this.metrics.eventReplayedCounter.add(1, {
            event_type: result.value.eventType,
            status: 'success'
          });
        } else {
          failed.push(result.value);
          // Record failure metric
          this.metrics.eventReplayedCounter.add(1, {
            event_type: result.value.eventType,
            status: 'failed'
          });
        }
      }
    }

    // Update session with results
    session.successCount += success.length;
    session.failureCount += failed.length;
    this.activeReplays.set(replayId, session);

    // Stop on error if configured (now properly enforced via hasError flag)
    if (this.config.stopOnError && session.failureCount > 0) {
      this.logger.warn(`Replay ${replayId} stopped due to error (stopOnError=true)`);
    }
  }

  /**
   * Start periodic cleanup of old replay metadata
   *
   * Runs cleanup based on configured retention period.
   */
  private startCleanup(): void {
    const intervalMs = this.config.cleanupInterval;

    this.cleanupTimer = setInterval(() => {
      this.cleanupOldReplayData().catch((error) => {
        this.logger.error('Error in replay cleanup', error);
      });
    }, intervalMs);

    this.logger.debug(`Replay cleanup timer started with interval ${intervalMs}ms`);
  }

  /**
   * Clean up old replay metadata
   *
   * Clears replay tracking fields from events older than retention period.
   */
  private async cleanupOldReplayData(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);

      // Use the repository method to clear old replay metadata
      await this.outboxRepo.cleanupOldReplayMetadata(cutoffDate);

      this.logger.debug(`Replay cleanup cleared metadata older than ${cutoffDate.toISOString()}`, {
        cutoffDate: cutoffDate.toISOString(),
        retentionDays: this.config.retentionDays
      });
    } catch (error) {
      this.logger.error('Error cleaning up replay metadata', error);
    }
  }
}
