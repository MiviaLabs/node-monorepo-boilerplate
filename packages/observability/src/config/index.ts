/**
 * Configuration module for observability package
 *
 * This module provides a flexible configuration system that:
 * - Allows overriding all config options via input options
 * - Falls back to environment variables
 * - Provides sensible defaults for all options
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/observability/config';
 *
 * const config = resolveConfig({
 *   logger: {
 *     level: 'debug',
 *     serviceName: 'my-app',
 *   },
 *   telemetry: {
 *     serviceName: 'my-app',
 *     serviceVersion: '1.0.0',
 *     environment: 'production',
 *     enabled: true,
 *   },
 * });
 *
 * // Use resolved configuration
 * console.log(config.logger.level); // 'debug'
 * console.log(config.telemetry.serviceName); // 'my-app'
 * ```
 */

export * from './interfaces';
export * from './defaults';
export * from './config-resolver';
