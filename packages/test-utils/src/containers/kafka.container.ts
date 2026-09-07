// Testcontainers is an optional dependency - only available when running tests
// This allows test-utils to be used in production builds without testcontainers

let KafkaContainerModule: unknown = null;

// Store multiple named Kafka containers
const kafkaContainers = new Map<string, KafkaStartedContainer>();

// Store the broker URLs after container starts
const kafkaBrokerUrls = new Map<string, string>();

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  KafkaContainerModule = require('@testcontainers/kafka');
} catch {
  // Testcontainers not installed - this is expected in production builds
  KafkaContainerModule = null;
}

/**
 * Interface representing a started Kafka container.
 *
 * Based on the @testcontainers/kafka API. Provides methods to interact
 * with the running Kafka container.
 *
 * @example
 * ```ts
 * const container = await startKafkaContainer('main');
 * const host = container.getHost();
 * const port = await container.getMappedPort(9093);
 * const brokerUrl = `${host}:${port}`;
 * ```
 */
interface KafkaStartedContainer {
  getHost(): string;
  getMappedPort(port: number): Promise<number>;
  stop(): Promise<void>;
}

/**
 * Configuration options for starting a Kafka Testcontainer.
 *
 * Kafka containers use the Confluent Platform image by default, which includes
 * a full Kafka broker with KRaft (no ZooKeeper required in newer versions).
 *
 * @example
 * ```ts
 * // Using defaults (confluentinc/cp-kafka:7.7.1)
 * await startKafkaContainer('main');
 *
 * // Custom image version
 * await startKafkaContainer('events', {
 *   image: 'confluentinc/cp-kafka:7.6.0'
 * });
 * ```
 */
export interface IKafkaContainerOptions {
  /**
   * Docker image to use for the Kafka container.
   * Must be a Confluent Platform Kafka image (cp-kafka).
   * @default process.env.TEST_KAFKA_IMAGE || 'confluentinc/cp-kafka:7.7.1'
   */
  image?: string;
}

/**
 * Starts a named Kafka Testcontainer for integration testing.
 *
 * This function manages named Kafka containers using a Map-based registry,
 * allowing multiple containers to run simultaneously with different configurations.
 *
 * **Important: Kafka containers are slow to start (10-30 seconds)** due to the
 * distributed systems architecture and broker initialization. Consider starting
 * the container in a global setup hook rather than per-test.
 *
 * BREAKING CHANGE: The container name is now REQUIRED.
 *
 * @param name - Unique container identifier (e.g., 'main', 'events', 'commands')
 * @param options - Container configuration options
 * @returns The started container instance
 * @throws Error if testcontainers is not installed
 * @throws Error if container fails to start
 *
 * @example
 * ```ts
 * // Basic usage - note: startup takes 10-30 seconds
 * await startKafkaContainer('main');
 * const brokerUrl = getKafkaBrokerUrl('main'); // e.g., "localhost:54321"
 *
 * // Configure kafkajs client
 * const { Kafka } = require('kafkajs');
 * const kafka = new Kafka({
 *   clientId: 'test-client',
 *   brokers: [getKafkaBrokerUrl('main')]
 * });
 *
 * // Using environment variables
 * const envVars = getKafkaConnectionEnvVars('main');
 * process.env.KAFKA_BROKER = envVars.KAFKA_BROKER;
 * process.env.KAFKA_BROKERS = envVars.KAFKA_BROKERS;
 *
 * // Recommended: Start in global setup for performance
 * // globalSetup.ts
 * export default async function() {
 *   await startKafkaContainer('main');
 *   process.env.KAFKA_BROKER = getKafkaBrokerUrl('main');
 * }
 *
 * // globalTeardown.ts
 * export default async function() {
 *   await stopKafkaContainer('main');
 * }
 * ```
 */
export async function startKafkaContainer(
  name: string,
  options: IKafkaContainerOptions = {}
): Promise<KafkaStartedContainer> {
  if (!KafkaContainerModule) {
    throw new Error(
      'Testcontainers is not installed. Install it with: pnpm add -D @testcontainers/kafka testcontainers'
    );
  }

  if (kafkaContainers.has(name)) {
    // eslint-disable-next-line no-console
    console.log(`[Kafka Container] Container '${name}' already started, reusing...`);
    const container = kafkaContainers.get(name);
    if (!container) {
      throw new Error(`Container '${name}' should exist but was not found in map`);
    }
    return container;
  }

  const { image = process.env['TEST_KAFKA_IMAGE'] || 'confluentinc/cp-kafka:7.7.1' } = options;

  // eslint-disable-next-line no-console
  console.log(`[Kafka Container] Starting container '${name}' (this may take 10-30 seconds)...`);

  // KafkaContainer from @testcontainers/kafka
  // It exposes port 9093 internally for the Kafka broker
  const KafkaContainer = (KafkaContainerModule as { KafkaContainer: unknown }).KafkaContainer as {
    new (image: string): {
      start(): Promise<KafkaStartedContainer>;
    };
  };

  const container = new KafkaContainer(image);

  const startedContainer = await container.start();

  // Build the broker URL: host:mappedPort
  // KafkaContainer exposes Kafka on port 9093 internally
  const host = startedContainer.getHost();
  const port = await startedContainer.getMappedPort(9093);
  const brokerUrl = `${host}:${port}`;

  kafkaContainers.set(name, startedContainer);
  kafkaBrokerUrls.set(name, brokerUrl);

  // eslint-disable-next-line no-console
  console.log(`[Kafka Container] Container '${name}' started successfully`, { broker: brokerUrl });

  return startedContainer;
}

/**
 * Stops a named Kafka Testcontainer, or all containers if no name is provided.
 *
 * This function gracefully shuts down the container(s) and removes them from
 * the internal registry. Always call this in test teardown to avoid resource leaks.
 *
 * @param name - Container identifier (optional, stops all if not provided)
 * @returns Promise that resolves when container(s) have stopped
 *
 * @example
 * ```ts
 * // Stop a specific container
 * await stopKafkaContainer('main');
 *
 * // Stop all containers (useful in global teardown)
 * await stopKafkaContainer();
 *
 * // Recommended: Use global teardown for Kafka due to slow startup
 * // globalTeardown.ts
 * export default async function() {
 *   await stopKafkaContainer('main');
 * }
 * ```
 */
export async function stopKafkaContainer(name?: string): Promise<void> {
  if (name) {
    // Stop specific container
    const container = kafkaContainers.get(name);
    if (container) {
      await container.stop();
      kafkaContainers.delete(name);
      kafkaBrokerUrls.delete(name);
      // eslint-disable-next-line no-console
      console.log(`[Kafka Container] Container '${name}' stopped`);
    }
  } else {
    // Stop all containers
    const stopPromises = Array.from(kafkaContainers.entries()).map(
      async ([containerName, container]) => {
        await container.stop();
        // eslint-disable-next-line no-console
        console.log(`[Kafka Container] Container '${containerName}' stopped`);
      }
    );
    await Promise.all(stopPromises);
    kafkaContainers.clear();
    kafkaBrokerUrls.clear();
  }
}

/**
 * Gets the Kafka broker URL for a named container.
 *
 * Returns the broker URL in the format "host:port" that can be used
 * to configure Kafka clients like kafkajs or node-rdkafka.
 *
 * @param name - Container identifier
 * @returns Kafka broker URL (e.g., "localhost:54321")
 * @throws Error if container with the given name has not been started
 *
 * @example
 * ```ts
 * // With kafkajs
 * await startKafkaContainer('main');
 * const brokerUrl = getKafkaBrokerUrl('main');
 *
 * const { Kafka } = require('kafkajs');
 * const kafka = new Kafka({
 *   clientId: 'test-app',
 *   brokers: [brokerUrl]
 * });
 *
 * const producer = kafka.producer();
 * await producer.connect();
 * await producer.send({
 *   topic: 'test-topic',
 *   messages: [{ value: 'Hello Kafka!' }]
 * });
 *
 * // Set as environment variable
 * process.env.KAFKA_BROKER = getKafkaBrokerUrl('main');
 * ```
 */
export function getKafkaBrokerUrl(name: string): string {
  const brokerUrl = kafkaBrokerUrls.get(name);
  if (!brokerUrl) {
    throw new Error(
      `Kafka container '${name}' not started. Call startKafkaContainer('${name}') first.`
    );
  }
  return brokerUrl;
}

/**
 * Gets Kafka connection environment variables for a named container.
 *
 * Extracts broker URL and formats it for environment variable injection
 * so Kafka clients can connect to the Testcontainers instance. Returns
 * both singular and plural broker variables for compatibility with
 * different client configurations.
 *
 * @param name - Container identifier
 * @returns Object with KAFKA_BROKER and KAFKA_BROKERS (both contain the same single broker URL)
 * @throws Error if container with the given name has not been started
 *
 * @example
 * ```ts
 * // Full environment variable setup
 * await startKafkaContainer('main');
 * const envVars = getKafkaConnectionEnvVars('main');
 *
 * // Set all environment variables at once
 * Object.assign(process.env, envVars);
 *
 * // Or set individually
 * process.env.KAFKA_BROKER = envVars.KAFKA_BROKER;   // e.g., 'localhost:54321'
 * process.env.KAFKA_BROKERS = envVars.KAFKA_BROKERS; // e.g., 'localhost:54321'
 *
 * // Use with NestJS microservices
 * const app = await NestFactory.createMicroservice(AppModule, {
 *   transport: Transport.KAFKA,
 *   options: {
 *     client: {
 *       brokers: [process.env.KAFKA_BROKER]
 *     }
 *   }
 * });
 * ```
 */
export function getKafkaConnectionEnvVars(name: string): {
  KAFKA_BROKER: string;
  KAFKA_BROKERS: string;
} {
  const brokerUrl = getKafkaBrokerUrl(name);

  return {
    KAFKA_BROKER: brokerUrl,
    KAFKA_BROKERS: brokerUrl // Single broker for tests
  };
}

/**
 * Gets the raw Kafka container instance by name.
 *
 * Returns the underlying Testcontainers instance for advanced use cases
 * such as accessing container logs, executing commands, or inspecting state.
 *
 * @param name - Container identifier
 * @returns The started container instance, or undefined if not started
 *
 * @example
 * ```ts
 * await startKafkaContainer('main');
 * const container = getKafkaContainer('main');
 *
 * if (container) {
 *   const host = container.getHost();
 *   const port = await container.getMappedPort(9093);
 *   console.log(`Kafka running at ${host}:${port}`);
 * }
 * ```
 */
export function getKafkaContainer(name: string): KafkaStartedContainer | undefined {
  return kafkaContainers.get(name);
}

/**
 * Gets all started Kafka container names.
 *
 * Returns an array of container identifiers that have been started and
 * are currently running. Useful for cleanup operations or debugging.
 *
 * @returns Array of container names that are currently running
 *
 * @example
 * ```ts
 * await startKafkaContainer('events');
 * await startKafkaContainer('commands');
 *
 * const names = getKafkaContainerNames();
 * console.log(names); // ['events', 'commands']
 *
 * // Clean up all containers
 * for (const name of names) {
 *   await stopKafkaContainer(name);
 * }
 * ```
 */
export function getKafkaContainerNames(): string[] {
  return Array.from(kafkaContainers.keys());
}
