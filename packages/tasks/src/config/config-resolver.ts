/**
 * Configuration resolver for Cloud Tasks
 *
 * Resolves configuration from environment variables and defaults
 */

import { InvalidTaskConfigError } from '../errors';
import { DEFAULT_CLIENT_CONFIG, DEFAULT_QUEUE_OPTIONS, ENV_VARS } from './defaults';

import type { CloudTasksConfig, QueueOptions } from './interfaces';

/**
 * Generate queue path for Cloud Tasks API
 *
 * Constructs the full resource path for a Cloud Tasks queue.
 * Format: projects/{PROJECT_ID}/locations/{LOCATION}/queues/{QUEUE_NAME}
 *
 * @param config - Cloud Tasks configuration containing projectId and location
 * @param queueName - Name of the queue
 * @returns Full queue resource path
 *
 * @example Generating a queue path
 * ```typescript
 * const config: CloudTasksConfig = {
 *   projectId: 'my-project',
 *   location: 'us-central1',
 * };
 *
 * const path = getQueuePath(config, 'email-queue');
 * // Returns: 'projects/my-project/locations/us-central1/queues/email-queue'
 * ```
 */
export function getQueuePath(config: CloudTasksConfig, queueName: string): string {
  return `projects/${config.projectId}/locations/${config.location}/queues/${queueName}`;
}

/**
 * Generate location path for Cloud Tasks API
 *
 * Constructs the full resource path for a Cloud Tasks location.
 * Used as the parent path when creating queues.
 * Format: projects/{PROJECT_ID}/locations/{LOCATION}
 *
 * @param config - Cloud Tasks configuration containing projectId and location
 * @returns Full location resource path
 *
 * @example Generating a location path
 * ```typescript
 * const config: CloudTasksConfig = {
 *   projectId: 'my-project',
 *   location: 'us-central1',
 * };
 *
 * const path = getLocationPath(config);
 * // Returns: 'projects/my-project/locations/us-central1'
 * ```
 */
export function getLocationPath(config: CloudTasksConfig): string {
  return `projects/${config.projectId}/locations/${config.location}`;
}

/**
 * Resolve Cloud Tasks configuration from environment variables
 *
 * Reads configuration from environment variables and applies defaults.
 * Required environment variables: CLOUD_TASKS_PROJECT_ID, CLOUD_TASKS_LOCATION.
 *
 * @returns Resolved Cloud Tasks configuration
 * @throws {InvalidTaskConfigError} If required environment variables are missing
 *
 * @example Resolving configuration from environment
 * ```typescript
 * // Set environment variables:
 * // CLOUD_TASKS_PROJECT_ID=my-project
 * // CLOUD_TASKS_LOCATION=us-central1
 * // CLOUD_TASKS_KEY_FILE=/path/to/service-account.json
 *
 * const config = resolveConfig();
 * console.log(config.projectId); // 'my-project'
 * console.log(config.location);  // 'us-central1'
 * ```
 *
 * @example Using resolved config to create a provider
 * ```typescript
 * const config = resolveConfig();
 * const provider = new CloudTasksProvider(config);
 * ```
 *
 * @see ENV_VARS for the list of supported environment variables
 */
export function resolveConfig(): CloudTasksConfig {
  const projectId = process.env[ENV_VARS.PROJECT_ID];
  const location = process.env[ENV_VARS.LOCATION];

  if (!projectId) {
    throw new InvalidTaskConfigError(
      `Missing required environment variable: ${ENV_VARS.PROJECT_ID}`
    );
  }

  if (!location) {
    throw new InvalidTaskConfigError(`Missing required environment variable: ${ENV_VARS.LOCATION}`);
  }

  const credentials = resolveCredentials();

  const config: CloudTasksConfig = {
    projectId,
    location,
    timeout: parseNumber(process.env[ENV_VARS.TIMEOUT], DEFAULT_CLIENT_CONFIG.timeout ?? 60000),
    maxRetries: parseNumber(
      process.env[ENV_VARS.MAX_RETRIES],
      DEFAULT_CLIENT_CONFIG.maxRetries ?? 3
    ),
    enableTracing: parseBoolean(
      process.env[ENV_VARS.ENABLE_TRACING],
      DEFAULT_CLIENT_CONFIG.enableTracing ?? true
    ),
    testMode: parseBoolean(
      process.env[ENV_VARS.TEST_MODE],
      DEFAULT_CLIENT_CONFIG.testMode ?? false
    ),
    queueOptions: resolveQueueOptions()
  };

  // Add queueName only if it's defined (exactOptionalPropertyTypes compatibility)
  const queueNameEnv = process.env[ENV_VARS.QUEUE_NAME];
  if (queueNameEnv) {
    config.queueName = queueNameEnv;
  }

  // Add credentials only if defined (exactOptionalPropertyTypes compatibility)
  if (credentials) {
    config.credentials = credentials;
  }

  return config;
}

/**
 * Resolve credentials from environment variables
 *
 * SECURITY WARNING: Passing private keys via environment variables is not recommended.
 * Private keys may be exposed in:
 * - Process listings (ps, top, etc.)
 * - Shell history files
 * - Debug logs and error messages
 * - CI/CD system logs
 *
 * Strongly prefer using a keyFile instead. If you must use environment variables,
 * ensure your environment is properly secured and access is restricted.
 */
function resolveCredentials(): CloudTasksConfig['credentials'] {
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
    // Warn about security implications of using environment variables for private key
    console.warn(
      '[Cloud Tasks] Security: Using PRIVATE_KEY from environment variable is not recommended. ' +
        'Private keys may be exposed in process listings, shell history, or logs. ' +
        'Strongly prefer using a keyFile instead.'
    );

    // Validate PEM format (basic check for PEM headers)
    if (!privateKey.includes('-----BEGIN') || !privateKey.includes('PRIVATE KEY-----')) {
      throw new InvalidTaskConfigError(
        'Invalid private key format. Private key must be in PEM format (-----BEGIN ... PRIVATE KEY-----)'
      );
    }

    return { clientEmail, privateKey };
  }

  throw new InvalidTaskConfigError(
    'Must provide either CLOUD_TASKS_KEY_FILE or both CLOUD_TASKS_CLIENT_EMAIL and CLOUD_TASKS_PRIVATE_KEY'
  );
}

/**
 * Resolve queue options from environment variables
 */
function resolveQueueOptions(): QueueOptions {
  // For now, use defaults. Can be extended with more env vars if needed
  return DEFAULT_QUEUE_OPTIONS;
}

/**
 * Parse a number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Parse a boolean from environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value === 'true' || value === '1';
}

/**
 * Validate Cloud Tasks configuration
 *
 * Validates that the configuration has all required fields and valid values.
 * Called automatically by CloudTasksProvider constructor.
 *
 * @param config - Cloud Tasks configuration to validate
 * @throws {InvalidTaskConfigError} If configuration is invalid
 *
 * @example Validating configuration before use
 * ```typescript
 * const config: CloudTasksConfig = {
 *   projectId: 'my-project',
 *   location: 'us-central1',
 *   timeout: 30000,
 * };
 *
 * try {
 *   validateConfig(config);
 *   console.log('Configuration is valid');
 * } catch (error) {
 *   if (error instanceof InvalidTaskConfigError) {
 *     console.error('Invalid config:', error.message);
 *   }
 * }
 * ```
 *
 * @example Configuration validation failures
 * ```typescript
 * // Missing projectId
 * validateConfig({ location: 'us-central1' });
 * // Throws: InvalidTaskConfigError: projectId is required
 *
 * // Negative timeout
 * validateConfig({ projectId: 'my-project', location: 'us-central1', timeout: -1 });
 * // Throws: InvalidTaskConfigError: timeout must be positive
 * ```
 */
export function validateConfig(config: CloudTasksConfig): void {
  if (!config.projectId) {
    throw new InvalidTaskConfigError('projectId is required');
  }

  if (!config.location) {
    throw new InvalidTaskConfigError('location is required');
  }

  if (config.timeout && config.timeout < 0) {
    throw new InvalidTaskConfigError('timeout must be positive');
  }

  if (config.maxRetries && config.maxRetries < 0) {
    throw new InvalidTaskConfigError('maxRetries must be positive');
  }
}
