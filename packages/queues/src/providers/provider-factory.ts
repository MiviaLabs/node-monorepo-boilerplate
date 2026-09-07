/**
 * Queue provider factory
 *
 * Factory for creating queue providers based on configuration
 */

import type {
  QueueProviderType,
  BullMQProviderConfig,
  CloudTasksProviderConfig,
  PubSubProviderConfig
} from '../config/provider-config';
import { resolveProviderType } from '../config/provider-resolver';

import { BullMQAdapter } from './bullmq.adapter';
import { CloudTasksAdapter } from './cloud-tasks.adapter';
import { PubSubAdapter } from './pubsub.adapter';
import type { IQueueProvider } from './queue-provider.interface';

// Lazy import providers to avoid circular dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createCloudTasksProviderFn: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createMockCloudTasksProviderFn: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createPubSubProviderFn: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createMockPubSubProviderFn: any = null;

function lazyImportCloudTasks() {
  if (!createCloudTasksProviderFn || !createMockCloudTasksProviderFn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tasks = require(/* webpackIgnore: true */ '@package/tasks');
    createCloudTasksProviderFn = tasks.createCloudTasksProvider;
    createMockCloudTasksProviderFn = tasks.createMockCloudTasksProvider;
  }
}

function lazyImportPubSub() {
  if (!createPubSubProviderFn || !createMockPubSubProviderFn) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pubsub = require(/* webpackIgnore: true */ '@package/pubsub');
    createPubSubProviderFn = pubsub.createPubSubProvider;
    createMockPubSubProviderFn = pubsub.createMockPubSubProvider;
  }
}

/**
 * Create a queue provider based on configuration
 *
 * @param config - Provider configuration (optional, will use environment variables if not provided)
 * @returns Queue provider instance
 */
export function createQueueProvider(config?: {
  type?: QueueProviderType;
  config?: BullMQProviderConfig | CloudTasksProviderConfig | PubSubProviderConfig;
}): IQueueProvider {
  const providerType = config?.type ?? resolveProviderType();
  const providerConfig = config?.config;
  const isTestMode = process.env['TEST_MODE'] === 'true';

  switch (providerType) {
    case 'bullmq':
      return createBullMQProvider(providerConfig as BullMQProviderConfig);

    case 'cloud-tasks':
      return createCloudTasksProvider(providerConfig as CloudTasksProviderConfig, isTestMode);

    case 'pubsub':
      return createPubSubProvider(providerConfig as PubSubProviderConfig, isTestMode);

    default:
      throw new Error(`Unsupported queue provider type: ${providerType}`);
  }
}

/**
 * Create a BullMQ provider
 */
function createBullMQProvider(config?: BullMQProviderConfig): IQueueProvider {
  return new BullMQAdapter(config);
}

/**
 * Create a Cloud Tasks provider
 */
function createCloudTasksProvider(
  config?: CloudTasksProviderConfig,
  isTestMode?: boolean
): IQueueProvider {
  lazyImportCloudTasks();

  if (!config) {
    throw new Error('Cloud Tasks provider requires configuration');
  }

  // Resolve Cloud Tasks configuration
  const tasksConfig = {
    projectId: config.projectId,
    location: config.location,
    credentials: config.credentials,
    testMode: isTestMode ?? false
  };

  // Create Cloud Tasks provider (use mock in test mode)
  let provider;
  if (isTestMode) {
    if (!createMockCloudTasksProviderFn) {
      throw new Error('Mock Cloud Tasks provider not initialized');
    }
    provider = createMockCloudTasksProviderFn(tasksConfig);
  } else {
    if (!createCloudTasksProviderFn) {
      throw new Error('Cloud Tasks provider not initialized');
    }
    provider = createCloudTasksProviderFn(tasksConfig);
  }

  // Create adapter
  const adapterConfig: { httpBaseUrl: string; apiKey?: string } = {
    httpBaseUrl: config.httpBaseUrl
  };

  if (config.apiKey !== undefined) {
    adapterConfig.apiKey = config.apiKey;
  }

  return new CloudTasksAdapter(provider, adapterConfig);
}

/**
 * Create a Pub/Sub provider
 */
function createPubSubProvider(config?: PubSubProviderConfig, isTestMode?: boolean): IQueueProvider {
  lazyImportPubSub();

  if (!config) {
    throw new Error('Pub/Sub provider requires configuration');
  }

  // Resolve Pub/Sub configuration
  const pubsubConfig = {
    projectId: config.projectId,
    credentials: config.credentials,
    testMode: isTestMode ?? false
  };

  // Create Pub/Sub provider (use mock in test mode)
  let provider;
  if (isTestMode) {
    if (!createMockPubSubProviderFn) {
      throw new Error('Mock Pub/Sub provider not initialized');
    }
    provider = createMockPubSubProviderFn(pubsubConfig);
  } else {
    if (!createPubSubProviderFn) {
      throw new Error('Pub/Sub provider not initialized');
    }
    provider = createPubSubProviderFn(pubsubConfig);
  }

  // Create adapter
  const adapterConfig: { subscriptionPrefix?: string } = {};

  if (config.subscriptionPrefix !== undefined) {
    adapterConfig.subscriptionPrefix = config.subscriptionPrefix;
  }

  return new PubSubAdapter(provider, adapterConfig);
}

/**
 * Get the current queue provider type from environment
 *
 * @returns Queue provider type
 */
export function getQueueProviderType(): QueueProviderType {
  return resolveProviderType();
}
