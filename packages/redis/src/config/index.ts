/**
 * Configuration module for redis package
 *
 * This module provides a flexible configuration system that:
 * - Allows overriding all config options via input options
 * - Falls back to environment variables
 * - Provides sensible defaults for all options
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/redis/config';
 *
 * const config = resolveConfig({
 *   connection: {
 *     host: 'localhost',
 *     port: 6379,
 *     db: 0,
 *   },
 *   cache: {
 *     defaultTtl: 600,
 *   },
 * });
 *
 * // Use resolved configuration
 * console.log(config.connection.host); // 'localhost'
 * console.log(config.cache.defaultTtl); // 600
 * ```
 */

export * from './interfaces';
export * from './defaults';
export * from './config-resolver';
