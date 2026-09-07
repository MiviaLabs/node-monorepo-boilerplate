/**
 * @fileoverview Configuration resolver for Google Cloud Pub/Sub provider.
 *
 * This module provides utilities for resolving configuration from environment
 * variables, validating configuration objects, and constructing GCP resource paths.
 * It implements a "convention over configuration" approach with sensible defaults.
 *
 * @module @package/pubsub/config/config-resolver
 *
 * @example Automatic configuration from environment
 * ```typescript
 * import { resolveConfig, createPubSubProvider } from '@package/pubsub';
 *
 * // Set environment variables:
 * // PUBSUB_PROJECT_ID=my-project
 * // PUBSUB_KEY_FILE=/path/to/key.json
 *
 * const config = resolveConfig();
 * const provider = createPubSubProvider(config);
 * ```
 *
 * @example Manual configuration with validation
 * ```typescript
 * import { validateConfig, createPubSubProvider } from '@package/pubsub';
 *
 * const config = {
 *   projectId: 'my-project',
 *   timeout: 30000,
 *   maxRetries: 5
 * };
 *
 * validateConfig(config); // Throws if invalid
 * const provider = createPubSubProvider(config);
 * ```
 */

import { Logger, LogLevel } from '@package/observability';

import { InvalidPubSubConfigError } from '../errors';
import { DEFAULT_CLIENT_CONFIG, DEFAULT_SUBSCRIPTION_OPTIONS, ENV_VARS } from './defaults';

import type { IPubSubConfig, ISubscriptionOptions } from './interfaces';

/**
 * Internal logger for configuration resolution.
 * @internal
 */
const logger = new Logger({
  level: LogLevel.INFO,
  isDevelopment: process.env['NODE_ENV'] === 'development',
  environment: process.env['NODE_ENV'] ?? 'development',
  serviceName: 'pubsub-config-resolver',
  prettyOptions: {
    colorize: true,
    translateTime: 'HH:MM:ss Z',
    ignore: 'pid,hostname'
  }
});

/**
 * Minimum allowed timeout value in milliseconds.
 * @internal
 */
const MIN_TIMEOUT_MS = 100;

/**
 * Maximum allowed timeout value in milliseconds (30 minutes).
 * @internal
 */
const MAX_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Minimum allowed ack deadline in seconds (GCP minimum).
 * @internal
 */
const MIN_ACK_DEADLINE_SECONDS = 10;

/**
 * Maximum allowed ack deadline in seconds (GCP maximum).
 * @internal
 */
const MAX_ACK_DEADLINE_SECONDS = 600;

/**
 * Resolves Pub/Sub configuration from environment variables.
 *
 * This function reads configuration values from environment variables defined
 * in {@link ENV_VARS} and applies {@link DEFAULT_CLIENT_CONFIG} defaults for
 * any missing optional values. The function validates and bounds-checks
 * numeric values, logging warnings when values are adjusted.
 *
 * @returns Fully resolved {@link IPubSubConfig} object
 * @throws {@link InvalidPubSubConfigError} When PUBSUB_PROJECT_ID is missing
 * @throws {@link InvalidPubSubConfigError} When credentials are partially provided
 *
 * @example Basic usage
 * ```typescript
 * // Set required env var: PUBSUB_PROJECT_ID=my-project
 * const config = resolveConfig();
 * console.log(config.projectId); // 'my-project'
 * console.log(config.timeout);   // 60000 (default)
 * ```
 *
 * @example With all environment variables
 * ```bash
 * export PUBSUB_PROJECT_ID="my-project"
 * export PUBSUB_KEY_FILE="/path/to/key.json"
 * export PUBSUB_TIMEOUT="30000"
 * export PUBSUB_MAX_RETRIES="5"
 * export PUBSUB_ENABLE_TRACING="true"
 * export PUBSUB_ACK_DEADLINE="120"
 * ```
 *
 * ```typescript
 * const config = resolveConfig();
 * // {
 * //   projectId: 'my-project',
 * //   credentials: { keyFile: '/path/to/key.json' },
 * //   timeout: 30000,
 * //   maxRetries: 5,
 * //   enableTracing: true,
 * //   defaultAckDeadlineSeconds: 120,
 * //   ...
 * // }
 * ```
 */
export function resolveConfig(): IPubSubConfig {
  const projectId = process.env[ENV_VARS.PROJECT_ID];

  if (!projectId) {
    throw new InvalidPubSubConfigError(
      `Missing required environment variable: ${ENV_VARS.PROJECT_ID}`
    );
  }

  const config: IPubSubConfig = {
    projectId,
    timeout: parseNumber(process.env[ENV_VARS.TIMEOUT], DEFAULT_CLIENT_CONFIG.timeout ?? 60000, {
      min: MIN_TIMEOUT_MS,
      max: MAX_TIMEOUT_MS,
      name: 'timeout'
    }),
    maxRetries: parseNumber(
      process.env[ENV_VARS.MAX_RETRIES],
      DEFAULT_CLIENT_CONFIG.maxRetries ?? 3,
      { min: 0, max: 10, name: 'maxRetries' }
    ),
    enableTracing: parseBoolean(
      process.env[ENV_VARS.ENABLE_TRACING],
      DEFAULT_CLIENT_CONFIG.enableTracing ?? true
    ),
    testMode: parseBoolean(
      process.env[ENV_VARS.TEST_MODE],
      DEFAULT_CLIENT_CONFIG.testMode ?? false
    ),
    defaultAckDeadlineSeconds: parseNumber(
      process.env[ENV_VARS.ACK_DEADLINE],
      DEFAULT_CLIENT_CONFIG.defaultAckDeadlineSeconds ?? 60,
      { min: MIN_ACK_DEADLINE_SECONDS, max: MAX_ACK_DEADLINE_SECONDS, name: 'ackDeadline' }
    ),
    defaultMessageRetentionSeconds: DEFAULT_CLIENT_CONFIG.defaultMessageRetentionSeconds ?? 604800
  };

  const topicName = process.env[ENV_VARS.TOPIC_NAME];
  if (topicName !== undefined) {
    config.topicName = topicName;
  }

  const subscriptionName = process.env[ENV_VARS.SUBSCRIPTION_NAME];
  if (subscriptionName !== undefined) {
    config.subscriptionName = subscriptionName;
  }

  const credentials = resolveCredentials();
  if (credentials !== undefined) {
    config.credentials = credentials;
  }

  return config;
}

/**
 * Resolves authentication credentials from environment variables.
 *
 * Supports two credential methods:
 * 1. Key file path (PUBSUB_KEY_FILE)
 * 2. Inline credentials (PUBSUB_CLIENT_EMAIL + PUBSUB_PRIVATE_KEY)
 *
 * If no credentials are provided, returns undefined to use Application
 * Default Credentials (ADC).
 *
 * @returns Credentials object or undefined for ADC
 * @throws {@link InvalidPubSubConfigError} When only one of clientEmail/privateKey is set
 * @internal
 */
function resolveCredentials(): IPubSubConfig['credentials'] {
  const keyFile = process.env[ENV_VARS.KEY_FILE];
  const clientEmail = process.env[ENV_VARS.CLIENT_EMAIL];
  const privateKey = process.env[ENV_VARS.PRIVATE_KEY];

  if (!keyFile && !clientEmail && !privateKey) {
    // Use default Google Cloud credentials
    return undefined;
  }

  if (keyFile) {
    return { keyFile };
  }

  if (clientEmail && privateKey) {
    return { clientEmail, privateKey };
  }

  throw new InvalidPubSubConfigError(
    'Must provide either PUBSUB_KEY_FILE or both PUBSUB_CLIENT_EMAIL and PUBSUB_PRIVATE_KEY'
  );
}

/**
 * Resolves subscription options from environment variables.
 *
 * Reads PUBSUB_ACK_DEADLINE to override the default acknowledgment deadline.
 * Other subscription options use their defaults from {@link DEFAULT_SUBSCRIPTION_OPTIONS}.
 *
 * @returns Resolved {@link ISubscriptionOptions} with environment overrides
 *
 * @example Using resolved subscription options
 * ```typescript
 * // Set: PUBSUB_ACK_DEADLINE=120
 * const options = resolveSubscriptionOptions();
 * console.log(options.ackDeadlineSeconds); // 120
 * console.log(options.messageRetentionSeconds); // 604800 (default)
 * ```
 */
export function resolveSubscriptionOptions(): ISubscriptionOptions {
  const ackDeadline = parseNumber(
    process.env[ENV_VARS.ACK_DEADLINE],
    DEFAULT_SUBSCRIPTION_OPTIONS.ackDeadlineSeconds ?? 60,
    { min: MIN_ACK_DEADLINE_SECONDS, max: MAX_ACK_DEADLINE_SECONDS, name: 'ackDeadline' }
  );

  return {
    ...DEFAULT_SUBSCRIPTION_OPTIONS,
    ackDeadlineSeconds: ackDeadline
  };
}

/**
 * Parses a numeric value from an environment variable string.
 *
 * Applies bounds validation and returns the default value for invalid
 * or missing input. Logs warnings when values are clamped to bounds.
 *
 * @param value - Environment variable value (may be undefined)
 * @param defaultValue - Value to use if parsing fails or value is missing
 * @param bounds - Optional min/max bounds with parameter name for logging
 * @returns Parsed number within bounds, or default value
 * @internal
 */
function parseNumber(
  value: string | undefined,
  defaultValue: number,
  bounds?: { min?: number; max?: number; name?: string }
): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  // Apply bounds validation if provided
  if (bounds) {
    const { min, max, name } = bounds;

    if (min !== undefined && parsed < min) {
      logger.warn(
        `Config value for ${name || 'parameter'} (${parsed}) is below minimum (${min}), using minimum`
      );
      return min;
    }

    if (max !== undefined && parsed > max) {
      logger.warn(
        `Config value for ${name || 'parameter'} (${parsed}) exceeds maximum (${max}), using maximum`
      );
      return max;
    }
  }

  return parsed;
}

/**
 * Parses a boolean value from an environment variable string.
 *
 * Recognizes "true" and "1" as truthy values. All other values
 * (including "false", "0", or any other string) are treated as false.
 *
 * @param value - Environment variable value (may be undefined)
 * @param defaultValue - Value to use if variable is not set
 * @returns Parsed boolean or default value
 * @internal
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === '1';
}

/**
 * Validates a Pub/Sub configuration object.
 *
 * Checks for required fields and valid value ranges. Call this function
 * to validate manually constructed configuration before creating a provider.
 *
 * @param config - Configuration object to validate
 * @throws {@link InvalidPubSubConfigError} When projectId is missing
 * @throws {@link InvalidPubSubConfigError} When timeout is negative
 * @throws {@link InvalidPubSubConfigError} When maxRetries is negative
 * @throws {@link InvalidPubSubConfigError} When defaultAckDeadlineSeconds is negative
 *
 * @example Validating manual configuration
 * ```typescript
 * const config: IPubSubConfig = {
 *   projectId: 'my-project',
 *   timeout: 30000
 * };
 *
 * try {
 *   validateConfig(config);
 *   const provider = createPubSubProvider(config);
 * } catch (error) {
 *   if (error instanceof InvalidPubSubConfigError) {
 *     console.error('Invalid config:', error.message);
 *   }
 * }
 * ```
 */
export function validateConfig(config: IPubSubConfig): void {
  if (!config.projectId) {
    throw new InvalidPubSubConfigError('projectId is required');
  }

  if (config.timeout !== undefined) {
    if (config.timeout < MIN_TIMEOUT_MS) {
      throw new InvalidPubSubConfigError(
        `timeout must be at least ${MIN_TIMEOUT_MS}ms, got ${config.timeout}ms`
      );
    }
    if (config.timeout > MAX_TIMEOUT_MS) {
      throw new InvalidPubSubConfigError(
        `timeout must not exceed ${MAX_TIMEOUT_MS}ms, got ${config.timeout}ms`
      );
    }
  }

  if (config.maxRetries !== undefined) {
    if (config.maxRetries < 0) {
      throw new InvalidPubSubConfigError(
        `maxRetries must be non-negative, got ${config.maxRetries}`
      );
    }
    if (config.maxRetries > 10) {
      throw new InvalidPubSubConfigError(`maxRetries must not exceed 10, got ${config.maxRetries}`);
    }
  }

  if (config.defaultAckDeadlineSeconds !== undefined) {
    if (config.defaultAckDeadlineSeconds < MIN_ACK_DEADLINE_SECONDS) {
      throw new InvalidPubSubConfigError(
        `defaultAckDeadlineSeconds must be at least ${MIN_ACK_DEADLINE_SECONDS}s, got ${config.defaultAckDeadlineSeconds}s`
      );
    }
    if (config.defaultAckDeadlineSeconds > MAX_ACK_DEADLINE_SECONDS) {
      throw new InvalidPubSubConfigError(
        `defaultAckDeadlineSeconds must not exceed ${MAX_ACK_DEADLINE_SECONDS}s, got ${config.defaultAckDeadlineSeconds}s`
      );
    }
  }
}

/**
 * Constructs the full GCP resource path for a topic.
 *
 * Topic paths follow the format: `projects/{project}/topics/{topic}`
 *
 * @param config - Configuration containing the project ID
 * @param topicName - Short topic name (not the full path)
 * @returns Full GCP topic resource path
 *
 * @example Getting a topic path
 * ```typescript
 * const config = { projectId: 'my-project' };
 * const path = getTopicPath(config, 'my-topic');
 * // Returns: 'projects/my-project/topics/my-topic'
 * ```
 */
export function getTopicPath(config: IPubSubConfig, topicName: string): string {
  return `projects/${config.projectId}/topics/${topicName}`;
}

/**
 * Constructs the full GCP resource path for a subscription.
 *
 * Subscription paths follow the format: `projects/{project}/subscriptions/{subscription}`
 *
 * @param config - Configuration containing the project ID
 * @param subscriptionName - Short subscription name (not the full path)
 * @returns Full GCP subscription resource path
 *
 * @example Getting a subscription path
 * ```typescript
 * const config = { projectId: 'my-project' };
 * const path = getSubscriptionPath(config, 'my-sub');
 * // Returns: 'projects/my-project/subscriptions/my-sub'
 * ```
 */
export function getSubscriptionPath(config: IPubSubConfig, subscriptionName: string): string {
  return `projects/${config.projectId}/subscriptions/${subscriptionName}`;
}

/**
 * Extracts the topic name from a full GCP topic path.
 *
 * Parses paths in the format `projects/{project}/topics/{topic}` and
 * returns just the topic name portion.
 *
 * @param topicPath - Full GCP topic resource path
 * @returns Short topic name
 * @throws {InvalidPubSubConfigError} If the path format is invalid
 *
 * @example Parsing a topic path
 * ```typescript
 * const name = parseTopicName('projects/my-project/topics/my-topic');
 * // Returns: 'my-topic'
 * ```
 */
export function parseTopicName(topicPath: string): string {
  const parts = topicPath.split('/');
  // Expected format: projects/{project}/topics/{topic}
  if (
    parts.length !== 4 ||
    parts[0] !== 'projects' ||
    parts[2] !== 'topics' ||
    !parts[1] ||
    !parts[3]
  ) {
    throw new InvalidPubSubConfigError(`Invalid topic path: ${topicPath}`);
  }
  return parts[3];
}

/**
 * Extracts the subscription name from a full GCP subscription path.
 *
 * Parses paths in the format `projects/{project}/subscriptions/{subscription}`
 * and returns just the subscription name portion.
 *
 * @param subscriptionPath - Full GCP subscription resource path
 * @returns Short subscription name
 * @throws {InvalidPubSubConfigError} If the path format is invalid
 *
 * @example Parsing a subscription path
 * ```typescript
 * const name = parseSubscriptionName('projects/my-project/subscriptions/my-sub');
 * // Returns: 'my-sub'
 * ```
 */
export function parseSubscriptionName(subscriptionPath: string): string {
  const parts = subscriptionPath.split('/');
  // Expected format: projects/{project}/subscriptions/{subscription}
  if (
    parts.length !== 4 ||
    parts[0] !== 'projects' ||
    parts[2] !== 'subscriptions' ||
    !parts[1] ||
    !parts[3]
  ) {
    throw new InvalidPubSubConfigError(`Invalid subscription path: ${subscriptionPath}`);
  }
  return parts[3];
}
