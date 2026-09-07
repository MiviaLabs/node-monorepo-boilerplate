/**
 * @fileoverview Factory functions for creating Pub/Sub providers.
 *
 * This module provides factory functions for creating the appropriate
 * Pub/Sub provider based on configuration. It supports both production
 * (GCP) and test (mock) providers, allowing seamless switching between
 * environments.
 *
 * @module @package/pubsub/providers/provider-factory
 *
 * @example Production usage
 * ```typescript
 * import { createPubSubProvider } from '@package/pubsub';
 *
 * // Uses PUBSUB_PROJECT_ID and other env vars
 * const provider = createPubSubProvider();
 *
 * await provider.publish('events', { type: 'user.created' });
 * ```
 *
 * @example Test usage
 * ```typescript
 * import { createMockPubSubProvider } from '@package/pubsub';
 *
 * const provider = createMockPubSubProvider();
 *
 * // No GCP credentials needed!
 * await provider.createTopic('test-topic');
 * await provider.publish('test-topic', { test: 'data' });
 *
 * // Inspect mock state
 * expect(provider.getMessageCount('test-topic')).toBe(1);
 * ```
 */

import { MockPubSubProvider } from './mock-provider';
import { PubSubProvider } from './pubsub.provider';
import { resolveConfig } from '../config/config-resolver';

import type { IPubSubConfig } from '../config';
import type { Logger } from '@package/observability';

/**
 * Enumeration of available provider types.
 *
 * Used internally to identify which provider implementation is active.
 *
 * @example Checking provider type
 * ```typescript
 * if (providerType === PubSubProviderType.MOCK) {
 *   console.log('Running in test mode');
 * }
 * ```
 */
export enum PubSubProviderType {
  /** Real Google Cloud Pub/Sub provider */
  PUBSUB = 'pubsub',
  /** In-memory mock provider for testing */
  MOCK = 'mock'
}

/**
 * Creates a Pub/Sub provider based on configuration.
 *
 * This factory function automatically selects the appropriate provider:
 * - If `config.testMode` is true, returns a {@link MockPubSubProvider}
 * - Otherwise, returns a {@link PubSubProvider} connected to GCP
 *
 * If no configuration is provided, it resolves configuration from
 * environment variables using {@link resolveConfig}.
 *
 * @param config - Optional configuration (resolved from env vars if not provided)
 * @param logger - Optional logger instance for the provider
 * @returns Either a PubSubProvider or MockPubSubProvider based on config
 *
 * @example Using environment variables
 * ```bash
 * export PUBSUB_PROJECT_ID="my-project"
 * export PUBSUB_KEY_FILE="/path/to/key.json"
 * ```
 *
 * ```typescript
 * const provider = createPubSubProvider();
 * // Creates PubSubProvider with config from env vars
 * ```
 *
 * @example Explicit configuration
 * ```typescript
 * const provider = createPubSubProvider({
 *   projectId: 'my-project',
 *   credentials: { keyFile: '/path/to/key.json' },
 *   enableTracing: true
 * });
 * ```
 *
 * @example Test mode
 * ```typescript
 * const provider = createPubSubProvider({
 *   projectId: 'test-project',
 *   testMode: true
 * });
 * // Returns MockPubSubProvider - no GCP connection
 * ```
 *
 * @example With custom logger
 * ```typescript
 * import { Logger } from '@package/observability';
 *
 * const logger = new Logger({ serviceName: 'my-service' });
 * const provider = createPubSubProvider(config, logger);
 * ```
 */
export function createPubSubProvider(
  config?: IPubSubConfig,
  logger?: Logger
): PubSubProvider | MockPubSubProvider {
  const resolvedConfig = config ?? resolveConfig();

  if (resolvedConfig.testMode) {
    return new MockPubSubProvider(resolvedConfig);
  }

  return new PubSubProvider(resolvedConfig, logger);
}

/**
 * Creates an in-memory mock Pub/Sub provider for testing.
 *
 * The mock provider simulates Pub/Sub behavior without connecting to GCP.
 * It supports all the same operations as the real provider but stores
 * messages in memory.
 *
 * Use this in unit tests, integration tests, and local development
 * when you don't want to interact with real GCP resources.
 *
 * @param config - Optional partial configuration (projectId defaults to 'test-project')
 * @returns MockPubSubProvider instance
 *
 * @example Basic usage
 * ```typescript
 * const provider = createMockPubSubProvider();
 *
 * await provider.createTopic('orders');
 * await provider.createSubscription('order-processor', 'orders');
 * await provider.publish('orders', { orderId: '123' });
 *
 * // Check state
 * expect(provider.getTopicCount()).toBe(1);
 * expect(provider.getMessageCount('orders')).toBe(1);
 * ```
 *
 * @example With custom project ID
 * ```typescript
 * const provider = createMockPubSubProvider({
 *   projectId: 'integration-test-project'
 * });
 * ```
 *
 * @example In a test suite
 * ```typescript
 * describe('OrderService', () => {
 *   let provider: MockPubSubProvider;
 *
 *   beforeEach(() => {
 *     provider = createMockPubSubProvider();
 *   });
 *
 *   afterEach(() => {
 *     provider.clear(); // Reset state between tests
 *   });
 *
 *   it('publishes order events', async () => {
 *     const service = new OrderService(provider);
 *     await service.createOrder({ item: 'widget' });
 *     expect(provider.getMessageCount('orders')).toBe(1);
 *   });
 * });
 * ```
 */
export function createMockPubSubProvider(config?: Partial<IPubSubConfig>): MockPubSubProvider {
  const mockConfig: IPubSubConfig = {
    // Spread config first, then override with required mock values
    ...config,
    projectId: config?.projectId ?? 'test-project',
    // testMode must always be true for mock provider - cannot be overridden
    testMode: true
  };

  return new MockPubSubProvider(mockConfig);
}

/**
 * Disposes of a Pub/Sub provider and releases resources.
 *
 * Call this function when shutting down your application to ensure
 * clean resource cleanup. For the real provider, this closes connections
 * and stops background tasks. For the mock provider, this clears state.
 *
 * @param provider - Provider instance to dispose
 * @returns Promise that resolves when disposal is complete
 *
 * @example Graceful shutdown
 * ```typescript
 * const provider = createPubSubProvider();
 *
 * // Application logic...
 *
 * // On shutdown
 * process.on('SIGTERM', async () => {
 *   await disposePubSubProvider(provider);
 *   process.exit(0);
 * });
 * ```
 *
 * @example In tests
 * ```typescript
 * afterAll(async () => {
 *   await disposePubSubProvider(provider);
 * });
 * ```
 */
export async function disposePubSubProvider(
  provider: PubSubProvider | MockPubSubProvider
): Promise<void> {
  await provider.dispose();
}
