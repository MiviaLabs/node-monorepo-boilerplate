/**
 * Cloud Tasks provider factory
 *
 * Creates the appropriate provider based on configuration.
 *
 * @example
 * ```typescript
 * // Create provider from environment/config
 * const provider = createCloudTasksProvider();
 *
 * // Create mock provider for testing
 * const mockProvider = createMockCloudTasksProvider({
 *   projectId: 'test-project',
 * });
 * ```
 */

import { CloudTasksProvider } from './cloud-tasks.provider';
import { MockCloudTasksProvider } from './mock-provider';
import { resolveConfig } from '../config/config-resolver';

import type { CloudTasksConfig } from '../config';

/**
 * Provider type enum
 *
 * Defines the available provider implementations.
 */
const enum CloudTasksProviderType {
  CLOUD_TASKS = 'cloud-tasks',
  MOCK = 'mock'
}

/**
 * Create a Cloud Tasks provider based on configuration
 *
 * Creates the appropriate provider (real or mock) based on the
 * testMode flag in the configuration.
 *
 * @param config - Optional configuration (uses environment defaults if not provided)
 * @returns CloudTasksProvider or MockCloudTasksProvider instance
 *
 * @example
 * ```typescript
 * // Uses environment configuration
 * const provider = createCloudTasksProvider();
 *
 * // With explicit configuration
 * const provider = createCloudTasksProvider({
 *   projectId: 'my-project',
 *   location: 'us-central1',
 * });
 *
 * // Mock provider for testing
 * const mockProvider = createCloudTasksProvider({
 *   testMode: true,
 * });
 * ```
 */
export function createCloudTasksProvider(
  config?: CloudTasksConfig
): CloudTasksProvider | MockCloudTasksProvider {
  const resolvedConfig = config ?? resolveConfig();

  if (resolvedConfig.testMode) {
    return new MockCloudTasksProvider(resolvedConfig);
  }

  return new CloudTasksProvider(resolvedConfig);
}

/**
 * Create a Mock Cloud Tasks provider
 *
 * Creates an in-memory mock provider for testing purposes.
 *
 * @param config - Partial configuration (uses test defaults for missing values)
 * @param mockOptions - Optional mock-specific options (delay configuration)
 * @returns MockCloudTasksProvider instance
 *
 * @example
 * ```typescript
 * // Create mock provider with defaults
 * const mock = createMockCloudTasksProvider();
 *
 * // Create mock provider with custom config
 * const mock = createMockCloudTasksProvider({
 *   projectId: 'my-test-project',
 *   location: 'europe-west1',
 * });
 *
 * // Create mock provider with no delay for fast tests
 * const mock = createMockCloudTasksProvider(
 *   { projectId: 'test-project' },
 *   { delayMs: 0 }
 * );
 * ```
 */
export function createMockCloudTasksProvider(
  config?: Partial<CloudTasksConfig>,
  mockOptions?: import('./mock-provider').MockCloudTasksProviderOptions
): MockCloudTasksProvider {
  const mockConfig: CloudTasksConfig = {
    ...config,
    projectId: config?.projectId ?? 'test-project',
    location: config?.location ?? 'us-central1',
    queueName: config?.queueName ?? 'test-queue',
    // The mock factory must always produce a test-mode configuration,
    // regardless of any testMode field on the caller's partial config.
    testMode: true
  };

  return new MockCloudTasksProvider(mockConfig, mockOptions);
}

// Re-export const enums for use in user code
export { CloudTasksProviderType };
