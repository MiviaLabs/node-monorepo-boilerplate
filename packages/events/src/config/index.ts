/**
 * Configuration module for events package
 *
 * This module provides a flexible configuration system that:
 * - Allows overriding all config options via input options
 * - Falls back to environment variables
 * - Provides sensible defaults for all options
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/events/config';
 *
 * const config = resolveConfig({
 *   kafka: {
 *     brokers: ['localhost:9092'],
 *     ssl: true,
 *   },
 *   consumer: {
 *     sessionTimeout: 60000,
 *   },
 *   outbox: {
 *     enabled: true,
 *     pollInterval: 5000,
 *   },
 * });
 *
 * // Use resolved configuration
 * console.log(config.kafka.brokers); // ['localhost:9092']
 * console.log(config.consumer.sessionTimeout); // 60000
 * ```
 */

export * from './interfaces';
export * from './defaults';
export * from './config-resolver';
