/**
 * Event Consumer Test Helper
 *
 * Mock event consumer for E2E testing of event publishing and consumption.
 * Simulates various failure scenarios and processing delays.
 *
 * @packageDocumentation
 */

import { EventEmitter } from 'node:events';

const enum MockConsumerErrorType {
  TRANSIENT = 'transient',
  PERMANENT = 'permanent'
}

export interface MockConsumerConfig {
  eventType: string;
  processDelay?: number; // Simulate processing time (ms)
  failureRate?: number; // 0-1, fraction of events that fail
  maxFailures?: number; // Fail this many times, then succeed
}

export class MockEventConsumer extends EventEmitter {
  private receivedEvents: unknown[] = [];
  private failedEvents: unknown[] = [];
  private failureCount = 0;
  private shouldFail = true;

  constructor(private readonly config: MockConsumerConfig) {
    super();
  }

  /**
   * Configure the mock consumer
   */
  configure(options: {
    maxFailures?: number;
    errorType?: MockConsumerErrorType;
    shouldFail?: boolean;
  }): void {
    if (options.maxFailures !== undefined) {
      this.config.maxFailures = options.maxFailures;
    }
    if (options.shouldFail !== undefined) {
      this.shouldFail = options.shouldFail;
    }
  }

  /**
   * Reset failure counter and event tracking
   */
  reset(): void {
    this.receivedEvents = [];
    this.failedEvents = [];
    this.failureCount = 0;
    this.shouldFail = true;
  }

  /**
   * Simulate consuming an event
   * Throws errors based on configuration
   */
  async consume(event?: unknown): Promise<void> {
    // Simulate processing delay
    if (this.config.processDelay) {
      await new Promise((resolve) => setTimeout(resolve, this.config.processDelay));
    }

    // Check if we should still fail
    if (this.config.maxFailures && this.failureCount >= this.config.maxFailures) {
      this.shouldFail = false;
    }

    // Check for failure rate
    if (this.config.failureRate && Math.random() < this.config.failureRate) {
      this.failedEvents.push(event);
      this.failureCount++;
      this.emit('error', event);
      throw new Error('Mock consumer failure');
    }

    // Check if we should fail
    if (this.shouldFail) {
      this.failureCount++;
      this.failedEvents.push(event);
      this.emit('error', event);
      throw new Error('ECONNREFUSED: Connection refused by Kafka broker');
    }

    // Success
    this.receivedEvents.push(event);
    this.emit('received', event);
  }

  getReceivedEvents(): unknown[] {
    return [...this.receivedEvents];
  }

  getFailedEvents(): unknown[] {
    return [...this.failedEvents];
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Wait for a specific number of events to be received
   */
  waitForEvent(count: number, timeoutMs = 5000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const check = (): void => {
        if (this.receivedEvents.length >= count) {
          clearTimeout(timer);
          this.off('received', check);
          resolve();
        }
      };

      const timer = setTimeout(() => {
        this.off('received', check);
        reject(new Error(`Timeout waiting for ${count} events`));
      }, timeoutMs);

      this.on('received', check);
      check();
    });
  }
}

export function createMockConsumer(config: MockConsumerConfig): MockEventConsumer {
  return new MockEventConsumer(config);
}
