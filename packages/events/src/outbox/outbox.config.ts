import type { OutboxPollerConfig } from './outbox-poller.service';

/**
 * Default outbox poller configuration
 *
 * These defaults are designed for production use with balanced
 * throughput, latency, and resource consumption.
 *
 * Override these defaults via EventsModule.forRootAsync() when needed.
 */
export const outboxPollerConfig: OutboxPollerConfig = {
  /** Poll every 1 second for low-latency event delivery */
  pollInterval: 1000,

  /** Process up to 10 events per batch to balance throughput and memory */
  batchSize: 10,

  /** Retry up to 5 times before giving up */
  maxRetries: 5,

  /** Exponential backoff multiplier (2x delay per retry) */
  retryBackoffMultiplier: 2,

  /** Start with 1 second delay for first retry */
  initialRetryDelay: 1000,

  /** Run cleanup every hour (3600000ms = 1 hour) */
  cleanupInterval: 3600000,

  /** Keep published events for 7 days for debugging and replay */
  retentionDays: 7,

  /** Unique worker identifier (combines PID and timestamp) */
  workerId: `worker-${process.pid}-${Date.now()}`,

  /** Enable the poller by default */
  enabled: true
};

/**
 * Create outbox poller configuration with custom settings
 *
 * Merges custom configuration with defaults, giving precedence to custom values.
 *
 * @param config - Custom configuration options
 * @returns Merged configuration object
 *
 * @example
 * ```typescript
 * const config = createOutboxPollerConfig({
 *   pollInterval: 5000,  // Slower polling
 *   batchSize: 50,       // Larger batches
 *   retentionDays: 30,   // Longer retention
 * });
 * ```
 */
export function createOutboxPollerConfig(config: Partial<OutboxPollerConfig>): OutboxPollerConfig {
  return {
    ...outboxPollerConfig,
    ...config,
    workerId: config.workerId || `worker-${process.pid}-${Date.now()}`
  };
}

/**
 * Validate outbox poller configuration
 *
 * Checks that configuration values are within acceptable ranges.
 * Throws an error if validation fails.
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 *
 * @example
 * ```typescript
 * try {
 *   validateOutboxPollerConfig(config);
 * } catch (error) {
 *   console.error('Invalid configuration:', error.message);
 * }
 * ```
 */
export function validateOutboxPollerConfig(config: OutboxPollerConfig): void {
  if (config.pollInterval < 100) {
    throw new Error('pollInterval must be at least 100ms');
  }

  if (config.batchSize < 1 || config.batchSize > 1000) {
    throw new Error('batchSize must be between 1 and 1000');
  }

  if (config.maxRetries < 0 || config.maxRetries > 100) {
    throw new Error('maxRetries must be between 0 and 100');
  }

  if (config.retryBackoffMultiplier < 1 || config.retryBackoffMultiplier > 10) {
    throw new Error('retryBackoffMultiplier must be between 1 and 10');
  }

  if (config.initialRetryDelay < 100) {
    throw new Error('initialRetryDelay must be at least 100ms');
  }

  if (config.cleanupInterval < 60000) {
    throw new Error('cleanupInterval must be at least 60000ms (1 minute)');
  }

  if (config.retentionDays < 1 || config.retentionDays > 365) {
    throw new Error('retentionDays must be between 1 and 365');
  }

  if (!config.workerId || config.workerId.trim().length === 0) {
    throw new Error('workerId must be a non-empty string');
  }
}
