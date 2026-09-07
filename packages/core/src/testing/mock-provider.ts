/**
 * Base mock provider class for infrastructure packages
 *
 * Provides a consistent foundation for creating mock implementations
 * of infrastructure providers (secrets, encryption, queues, etc.).
 */

import { OperationError, ConnectionError } from '../errors';

/**
 * Provider health status
 */
export enum ProviderHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

/**
 * Provider operation result
 */
export interface ProviderOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * Base options for mock providers
 */
export interface MockProviderOptions {
  /** Simulate latency in milliseconds */
  latency?: number;
  /** Simulate failure rate (0-1) */
  failureRate?: number;
  /** Initial health status */
  health?: ProviderHealth;
  /** Maximum number of operations before becoming unhealthy */
  maxOperations?: number;
}

/**
 * Base mock provider class
 *
 * Provides common functionality for testing infrastructure providers
 */
export abstract class MockProvider {
  protected _health: ProviderHealth;
  protected _operations = 0;
  protected readonly latency: number;
  protected readonly failureRate: number;
  protected readonly maxOperations?: number;

  constructor(options: MockProviderOptions = {}) {
    this._health = options.health ?? ProviderHealth.HEALTHY;
    this.latency = options.latency ?? 0;
    this.failureRate = options.failureRate ?? 0;
    if (options.maxOperations !== undefined) {
      this.maxOperations = options.maxOperations;
    }
  }

  /**
   * Get current health status
   */
  get health(): ProviderHealth {
    return this._health;
  }

  /**
   * Get number of operations performed
   */
  get operationCount(): number {
    return this._operations;
  }

  /**
   * Check if provider is healthy
   */
  isHealthy(): boolean {
    return this._health === ProviderHealth.HEALTHY;
  }

  /**
   * Set health status
   */
  setHealth(status: ProviderHealth): void {
    this._health = status;
  }

  /**
   * Execute an operation with simulated latency and failure rate
   */
  protected async executeOperation<T>(
    operationName: string,
    operation: () => T | Promise<T>
  ): Promise<T> {
    this._operations++;

    // Check if max operations exceeded
    if (this.maxOperations && this._operations > this.maxOperations) {
      this.setHealth(ProviderHealth.UNHEALTHY);
      throw new OperationError(operationName, 'Maximum operations exceeded for mock provider');
    }

    // Check if unhealthy
    if (!this.isHealthy()) {
      throw new ConnectionError(this.getProviderName(), 'Mock provider is unhealthy');
    }

    // Simulate latency
    if (this.latency > 0) {
      await this.delay(this.latency);
    }

    // Simulate failure
    if (Math.random() < this.failureRate) {
      throw new OperationError(operationName, 'Simulated failure from mock provider');
    }

    // Execute the operation
    return operation();
  }

  /**
   * Reset the mock provider to initial state
   */
  reset(): void {
    this._health = ProviderHealth.HEALTHY;
    this._operations = 0;
  }

  /**
   * Delay helper function
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the provider name (to be implemented by subclasses)
   */
  protected abstract getProviderName(): string;
}

/**
 * Mock provider factory
 *
 * Creates mock providers with consistent configuration
 */
export class MockProviderFactory {
  static create<T extends MockProvider>(
    MockClass: new (options: MockProviderOptions) => T,
    options: MockProviderOptions = {}
  ): T {
    const provider = new MockClass(options);
    return provider;
  }
}
