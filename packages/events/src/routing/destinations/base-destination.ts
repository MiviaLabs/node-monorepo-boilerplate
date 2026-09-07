/**
 * Base destination adapter
 *
 * Provides common functionality for all destination adapters.
 */

import type { EventMessage } from '../../event-bus';
import { logger } from '../../logging/logger';
import type { IDestinationAdapter, DestinationType } from '../interfaces';

/**
 * Base options for all destinations
 */
export interface BaseDestinationOptions {
  /** Enable/disable this destination */
  enabled?: boolean;
  /** Timeout for publishing operations (ms) */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay (ms) */
  retryDelay?: number;
}

/**
 * Abstract base class for destination adapters
 *
 * Provides common functionality like retry logic, timeout handling,
 * and logging.
 */
export abstract class BaseDestinationAdapter implements IDestinationAdapter {
  protected readonly options: Required<BaseDestinationOptions>;
  protected isInitialized = false;

  constructor(
    public readonly type: DestinationType,
    options: BaseDestinationOptions = {}
  ) {
    this.options = {
      enabled: options.enabled ?? true,
      timeout: options.timeout ?? 30000, // 30 seconds default
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000 // 1 second default
    };
  }

  /**
   * Initialize the destination adapter
   *
   * Subclasses should override this to perform any necessary initialization.
   */
  async initialize(): Promise<void> {
    if (!this.options.enabled) {
      logger.info(`${this.type} destination adapter is disabled`);
      return;
    }

    try {
      await this.doInitialize();
      this.isInitialized = true;
      logger.info(`${this.type} destination adapter initialized successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize ${this.type} destination adapter: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Perform actual initialization - to be implemented by subclasses
   */
  protected abstract doInitialize(): Promise<void>;

  /**
   * Check if adapter is ready to publish events
   */
  isReady(): boolean {
    return this.options.enabled && this.isInitialized;
  }

  /**
   * Publish an event to this destination with retry logic
   */
  async publish(event: unknown, options?: Record<string, unknown>): Promise<void> {
    if (!this.isReady()) {
      throw new Error(`${this.type} destination adapter is not ready`);
    }

    return this.withRetry(async () => {
      await this.doPublish(event as EventMessage, options ?? {});
    });
  }

  /**
   * Publish multiple events to this destination
   */
  async publishBatch(events: unknown[], options?: Record<string, unknown>): Promise<void> {
    if (!this.isReady()) {
      throw new Error(`${this.type} destination adapter is not ready`);
    }

    return this.withRetry(async () => {
      await this.doPublishBatch(events as EventMessage[], options ?? {});
    });
  }

  /**
   * Perform actual publish - to be implemented by subclasses
   */
  protected abstract doPublish(
    event: EventMessage,
    options: Record<string, unknown>
  ): Promise<void>;

  /**
   * Perform actual batch publish - to be implemented by subclasses
   */
  protected abstract doPublishBatch(
    events: EventMessage[],
    options: Record<string, unknown>
  ): Promise<void>;

  /**
   * Execute an operation with retry logic
   */
  protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        // Add timeout to the operation
        return await this.withTimeout(operation(), this.options.timeout);
      } catch (error) {
        lastError = error as Error;

        // Don't retry if it's not a retryable error
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        // Don't wait after the last attempt
        if (attempt < this.options.maxRetries) {
          const delay = this.options.retryDelay * attempt; // Exponential backoff
          logger.warn(
            `${this.type} destination: Attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`
          );
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `${this.type} destination: Failed after ${this.options.maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }

  /**
   * Add timeout to a promise
   */
  protected async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Check if an error is retryable
   */
  protected isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /temporary/i,
      /try again/i
    ];

    return retryablePatterns.some((pattern) => pattern.test(error.message));
  }

  /**
   * Sleep for a specified duration
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources
   */
  async cleanup?(): Promise<void> {
    this.isInitialized = false;
    logger.info(`${this.type} destination adapter cleaned up`);
  }
}
