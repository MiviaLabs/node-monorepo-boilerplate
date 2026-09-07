/**
 * Queue provider resolver
 *
 * Resolves the queue provider from environment variables
 */

import type { QueueProviderType } from './provider-config';

/**
 * Environment variable names for provider selection
 */
export const PROVIDER_ENV_VARS = {
  PROVIDER: 'QUEUE_PROVIDER'
} as const;

/**
 * Resolve queue provider type from environment
 *
 * @returns Provider type (defaults to 'bullmq' for backward compatibility)
 */
export function resolveProviderType(): QueueProviderType {
  const providerType = process.env[PROVIDER_ENV_VARS.PROVIDER];

  if (!providerType) {
    return 'bullmq'; // Default to BullMQ for backward compatibility
  }

  const validProviders: QueueProviderType[] = ['bullmq', 'cloud-tasks', 'pubsub'];

  if (!validProviders.includes(providerType as QueueProviderType)) {
    throw new Error(
      `Invalid QUEUE_PROVIDER: ${providerType}. Must be one of: ${validProviders.join(', ')}`
    );
  }

  return providerType as QueueProviderType;
}

/**
 * Get all queue provider environment variables
 *
 * @returns Object containing all queue provider env vars
 */
export function getProviderEnvVars(): Record<string, string | undefined> {
  return {
    // Provider selection
    QUEUE_PROVIDER: process.env[PROVIDER_ENV_VARS.PROVIDER],

    // BullMQ (Redis)
    REDIS_HOST: process.env['REDIS_HOST'],
    REDIS_PORT: process.env['REDIS_PORT'],
    REDIS_DB: process.env['REDIS_DB'],
    REDIS_PASSWORD: process.env['REDIS_PASSWORD'],

    // Cloud Tasks
    CLOUD_TASKS_PROJECT_ID: process.env['CLOUD_TASKS_PROJECT_ID'],
    CLOUD_TASKS_LOCATION: process.env['CLOUD_TASKS_LOCATION'],
    CLOUD_TASKS_HTTP_BASE_URL: process.env['CLOUD_TASKS_HTTP_BASE_URL'],
    CLOUD_TASKS_API_KEY: process.env['CLOUD_TASKS_API_KEY'],
    CLOUD_TASKS_KEY_FILE: process.env['CLOUD_TASKS_KEY_FILE'],

    // Pub/Sub
    PUBSUB_PROJECT_ID: process.env['PUBSUB_PROJECT_ID'],
    PUBSUB_SUBSCRIPTION_PREFIX: process.env['PUBSUB_SUBSCRIPTION_PREFIX'],
    PUBSUB_KEY_FILE: process.env['PUBSUB_KEY_FILE']
  };
}
