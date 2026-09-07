/**
 * Configuration module for auth package
 *
 * This module provides a flexible configuration system that:
 * - Allows overriding all config options via input options
 * - Falls back to environment variables
 * - Provides sensible defaults for all options
 *
 * @example
 * ```typescript
 * import { resolveConfig } from '@package/auth/config';
 *
 * const config = resolveConfig({
 *   keycloak: {
 *     authServerUrl: 'http://localhost:8080',
 *     realm: 'my-realm',
 *     clientId: 'my-client',
 *   },
 *   jwt: {
 *     secret: 'my-secret',
 *     algorithm: 'HS256',
 *   },
 *   tokenStorage: {
 *     enabled: true,
 *     enableRotation: true,
 *   },
 * });
 *
 * // Use resolved configuration
 * console.log(config.keycloak.authServerUrl); // 'http://localhost:8080'
 * console.log(config.jwt.algorithm); // 'HS256'
 * console.log(config.tokenStorage.enabled); // true
 * ```
 */

export * from './interfaces';
export * from './defaults';
export * from './config-resolver';
