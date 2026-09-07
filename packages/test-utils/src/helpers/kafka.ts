/**
 * Kafka E2E Test Helpers
 *
 * Provides utilities for setting up and tearing down Kafka for E2E tests.
 * Wraps the Kafka Testcontainers infrastructure using the Confluent Kafka image.
 *
 * **Important**: Kafka startup is slow (10-30 seconds) due to broker initialization
 * and KRaft controller election. Newer Confluent images (e.g., cp-kafka:7.7.1) run
 * in KRaft mode without ZooKeeper. This delay is expected behavior for distributed systems.
 *
 * **Environment Variables Set**:
 * - `KAFKA_BROKER`: Single broker address (e.g., `localhost:9092`)
 * - `KAFKA_BROKERS`: Comma-separated broker list (same as KAFKA_BROKER for single node)
 *
 * @packageDocumentation
 */

import {
  startKafkaContainer,
  stopKafkaContainer,
  getKafkaConnectionEnvVars
} from '../containers/kafka.container';

/** Set of container names that have been set up */
const setupContainers = new Set<string>();

/**
 * Sets up Kafka for E2E tests (Jest-compatible).
 *
 * Starts the Kafka Testcontainer and configures environment variables
 * for the application to connect. This is idempotent and can be called
 * multiple times safely - subsequent calls are no-ops.
 *
 * **Startup Time**: Kafka typically takes 10-30 seconds to start due to
 * broker initialization and KRaft controller election.
 * Set appropriate Jest timeouts (e.g., 60000ms) for `beforeAll()`.
 *
 * **Environment Variables Set**:
 * - `KAFKA_BROKER`: Single broker address for simple configurations
 * - `KAFKA_BROKERS`: Comma-separated list for multi-broker configurations
 *
 * **Container Naming**: Use different names when running multiple Kafka
 * instances (e.g., for testing multi-cluster scenarios).
 *
 * @param name - Unique container name for identification (default: 'main')
 * @returns Promise that resolves when Kafka is ready to accept connections
 *
 * @example Basic Kafka E2E test setup
 * ```ts
 * import { setupKafkaE2E, teardownKafkaE2E } from '@package/test-utils';
 *
 * describe('Event Publishing E2E', () => {
 *   beforeAll(async () => {
 *     // Start Kafka container (~20 seconds)
 *     await setupKafkaE2E();
 *   }, 60000);
 *
 *   afterAll(async () => {
 *     await teardownKafkaE2E();
 *   });
 *
 *   it('should publish event to Kafka', async () => {
 *     await eventPublisher.publish('user.created', { userId: '123' });
 *     // Assert event was published...
 *   });
 * });
 * ```
 *
 * @example Combined database and Kafka setup
 * ```ts
 * import {
 *   setupTestDatabaseJest,
 *   teardownTestDatabase,
 *   setupKafkaE2E,
 *   teardownKafkaE2E
 * } from '@package/test-utils';
 *
 * describe('Full E2E Tests', () => {
 *   beforeAll(async () => {
 *     // Start both containers in parallel for faster setup
 *     await Promise.all([
 *       setupTestDatabaseJest(),
 *       setupKafkaE2E()
 *     ]);
 *   }, 90000);
 *
 *   afterAll(async () => {
 *     await Promise.all([
 *       teardownTestDatabase(),
 *       teardownKafkaE2E()
 *     ]);
 *   });
 *
 *   // tests...
 * });
 * ```
 *
 * @example Named container for multi-cluster testing
 * ```ts
 * // Start two Kafka clusters for cross-cluster testing
 * await setupKafkaE2E('cluster-a');
 * await setupKafkaE2E('cluster-b');
 *
 * // Clean up both
 * await teardownKafkaE2E('cluster-a');
 * await teardownKafkaE2E('cluster-b');
 * ```
 */
export async function setupKafkaE2E(name: string = 'main'): Promise<void> {
  // Only setup once per container name, even if called from multiple test files
  if (setupContainers.has(name)) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[Kafka E2E] Starting Kafka container '${name}'...`);

  await startKafkaContainer(name);

  // Set Kafka environment variables from Testcontainers
  // CRITICAL: These MUST override any existing env vars to ensure
  // tests connect to the Testcontainers instance, not external Kafka
  const envVars = getKafkaConnectionEnvVars(name);
  process.env['KAFKA_BROKER'] = envVars.KAFKA_BROKER;
  process.env['KAFKA_BROKERS'] = envVars.KAFKA_BROKERS;

  // Only mark as setup after successful startup and env configuration
  setupContainers.add(name);

  // eslint-disable-next-line no-console
  console.log(`[Kafka E2E] Kafka container '${name}' started:`, {
    broker: envVars.KAFKA_BROKER
  });
}

/**
 * Tears down Kafka for E2E tests (Jest-compatible).
 *
 * Stops the Kafka Testcontainer and logs the shutdown. This is idempotent
 * and can be called multiple times safely - if Kafka is not set up, this
 * is a no-op.
 *
 * **Important**: Always call this in `afterAll()` to prevent container leaks.
 * Leaking containers can exhaust Docker resources and cause flaky tests.
 *
 * @param name - Container name to stop (default: 'main')
 * @returns Promise that resolves when the container is stopped
 *
 * @example Standard teardown
 * ```ts
 * import { setupKafkaE2E, teardownKafkaE2E } from '@package/test-utils';
 *
 * describe('Kafka Tests', () => {
 *   beforeAll(async () => {
 *     await setupKafkaE2E();
 *   }, 60000);
 *
 *   afterAll(async () => {
 *     await teardownKafkaE2E();
 *   });
 *
 *   // tests...
 * });
 * ```
 *
 * @example In Jest global teardown
 * ```ts
 * // jest.global-teardown.ts
 * import { teardownKafkaE2E } from '@package/test-utils';
 *
 * export default async function globalTeardown(): Promise<void> {
 *   await teardownKafkaE2E();
 * }
 * ```
 *
 * @example Teardown with error handling
 * ```ts
 * afterAll(async () => {
 *   try {
 *     await teardownKafkaE2E();
 *   } catch (error) {
 *     console.error('Failed to teardown Kafka:', error);
 *     // Don't throw - allow other cleanup to proceed
 *   }
 * });
 * ```
 */
export async function teardownKafkaE2E(name: string = 'main'): Promise<void> {
  if (setupContainers.has(name)) {
    // eslint-disable-next-line no-console
    console.log(`[Kafka E2E] Stopping Kafka container '${name}'...`);
    await stopKafkaContainer(name);
    setupContainers.delete(name);
    // eslint-disable-next-line no-console
    console.log(`[Kafka E2E] Kafka container '${name}' stopped`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[Kafka E2E] Teardown for '${name}' was a no-op (container not set up)`);
  }
}

/**
 * Checks if a Kafka container is currently set up for E2E tests.
 *
 * Returns `true` if `setupKafkaE2E()` has been called for the specified
 * container and it is running. Returns `false` if Kafka has not been
 * set up or has been torn down.
 *
 * This is useful for conditional logic in test setup, such as skipping
 * tests that require Kafka when it's not available.
 *
 * @param name - Container name to check (default: 'main')
 * @returns `true` if the specified Kafka container is running, `false` otherwise
 *
 * @example Conditional test execution
 * ```ts
 * import { isKafkaE2ESetup, setupKafkaE2E } from '@package/test-utils';
 *
 * describe('Event Publishing', () => {
 *   beforeAll(async () => {
 *     if (!isKafkaE2ESetup()) {
 *       await setupKafkaE2E();
 *     }
 *   }, 60000);
 *
 *   // tests...
 * });
 * ```
 *
 * @example Skip tests when Kafka unavailable
 * ```ts
 * const describeWithKafka = isKafkaE2ESetup() ? describe : describe.skip;
 *
 * describeWithKafka('Kafka-dependent tests', () => {
 *   it('should publish events', async () => {
 *     // ...
 *   });
 * });
 * ```
 *
 * @example Check specific named container
 * ```ts
 * if (isKafkaE2ESetup('cluster-a')) {
 *   // cluster-a is running
 * }
 * ```
 */
export function isKafkaE2ESetup(name: string = 'main'): boolean {
  return setupContainers.has(name);
}
