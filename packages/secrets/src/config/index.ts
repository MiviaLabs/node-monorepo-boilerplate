/**
 * Infrastructure Secrets Configuration Module
 * ===========================================
 * This module provides configuration resolution for the secrets package.
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/secrets/config';
 *
 * const config = resolveConfig({
 *   provider: 'gcp',
 *   gcp: {
 *     projectId: 'my-project',
 *   }
 * });
 *
 * console.log(config.gcp.projectId); // 'my-project'
 * console.log(config.gcp.kmsKeyLocation); // 'global' (default)
 * ```
 */

// Export all interfaces
export * from './interfaces';

// Export all defaults
export * from './defaults';

// Export the ConfigResolver class and helper function
export { ConfigResolver, resolveConfig } from './config-resolver';
