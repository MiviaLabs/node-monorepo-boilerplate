/**
 * OPA Configuration
 *
 * Configuration utilities for the OPA module, including defaults,
 * environment variable parsing, and validation.
 *
 * ## Policy Path and Rego Package Mapping
 *
 * The `policyPath` configuration maps directly to your Rego package structure:
 *
 * ```
 * policyPath: "/v1/data/authz/allow"
 *                      ↓     ↓
 *              package authz
 *              allow = true { ... }
 * ```
 *
 * ## Three-Tier Policy Organization
 *
 * This package is designed to work with a three-tier policy structure:
 *
 * 1. **Rego source** (`packages/opa/policies/authz/`) - Executable policy and tests
 * 2. **Human reference** (`docs/security/authorization.md`) - Explanatory documentation
 *
 * The `policyPath` points to the compiled policy in OPA, which is built
 * from the raw Rego files.
 *
 * @module @package/opa
 * @see {@link IOpaModuleOptions} for configuration interface
 * @see {@link validateOpaConfig} for validation rules
 */

import { OpaConfigError } from '../errors';

import type { IOpaModuleOptions } from '../types/opa.types';

/**
 * Default configuration values for OPA module.
 *
 * These defaults are suitable for local development. Override in production
 * using environment variables or explicit configuration.
 *
 * | Setting | Value | Description |
 * |---------|-------|-------------|
 * | `url` | `http://localhost:8181` | Local OPA server |
 * | `policyPath` | `/v1/data/authz/allow` | Default policy path |
 * | `timeout` | `5000` | 5 second timeout |
 *
 * @example Using defaults
 * ```typescript
 * import { DEFAULT_OPA_CONFIG } from '@package/opa';
 *
 * const config: IOpaModuleOptions = {
 *   ...DEFAULT_OPA_CONFIG,
 *   timeout: 3000 // Override just timeout
 * };
 * ```
 *
 * @see {@link opaConfigFromEnv} for environment-based configuration
 */
export const DEFAULT_OPA_CONFIG = Object.freeze({
  /**
   * Default OPA server URL for local development.
   *
   * In production, override with `OPA_URL` environment variable
   * to point to your deployed OPA instance.
   */
  url: 'http://localhost:8181',

  /**
   * Default policy path pointing to the `allow` rule in `authz` package.
   *
   * This maps to Rego code:
   * ```rego
   * package authz
   * allow = true { ... }
   * ```
   */
  policyPath: '/v1/data/authz/allow',

  /**
   * Default timeout of 5 seconds.
   *
   * Generous for development; consider reducing to 2-3 seconds
   * in production for faster failover.
   */
  timeout: 5000 // 5 seconds
} as const);

/**
 * Environment variable names for OPA configuration.
 *
 * Use these constants when reading environment variables to ensure
 * consistency across the codebase.
 *
 * @example Reading environment variables
 * ```typescript
 * import { OPA_ENV_VARS } from '@package/opa';
 *
 * const url = process.env[OPA_ENV_VARS.URL] || 'http://localhost:8181';
 * const timeout = parseInt(process.env[OPA_ENV_VARS.TIMEOUT] || '5000', 10);
 * ```
 *
 * @example Setting environment variables
 * ```bash
 * export OPA_URL="http://opa.example.com:8181"
 * export OPA_POLICY_PATH="/v1/data/enterprise/authz/allow"
 * export OPA_TIMEOUT="3000"
 * ```
 */
export const OPA_ENV_VARS = Object.freeze({
  /** Environment variable for OPA server URL */
  URL: 'OPA_URL',

  /** Environment variable for policy document path */
  POLICY_PATH: 'OPA_POLICY_PATH',

  /** Environment variable for request timeout (milliseconds) */
  TIMEOUT: 'OPA_TIMEOUT'
} as const);

/**
 * Validates OPA module options at runtime.
 *
 * Performs comprehensive validation to catch configuration errors early,
 * preventing runtime failures when trying to connect to OPA.
 *
 * ## Validation Rules
 *
 * | Field | Rule | Example Valid | Example Invalid |
 * |-------|------|---------------|-----------------|
 * | `url` | Must be valid URL | `http://opa:8181` | `not-a-url` |
 * | `policyPath` | Must start with `/` | `/v1/data/authz` | `v1/data/authz` |
 * | `timeout` | Must be finite 1-30000ms | `5000` | `0`, `50000`, `NaN`, `Infinity` |
 *
 * @param options - Configuration options to validate
 * @throws {OpaConfigError} When `url` is missing, not a string, or invalid URL format
 * @throws {OpaConfigError} When `policyPath` is missing, not a string, or doesn't start with `/`
 * @throws {OpaConfigError} When `timeout` is not a positive number or exceeds 30 seconds
 *
 * @example Validating configuration
 * ```typescript
 * import { validateOpaConfig, DEFAULT_OPA_CONFIG } from '@package/opa';
 *
 * const config = {
 *   url: process.env.OPA_URL || DEFAULT_OPA_CONFIG.url,
 *   policyPath: '/v1/data/authz/allow',
 *   timeout: 5000
 * };
 *
 * try {
 *   validateOpaConfig(config);
 *   console.log('Configuration is valid');
 * } catch (error) {
 *   console.error('Invalid OPA configuration:', error.message);
 *   process.exit(1);
 * }
 * ```
 *
 * @example Validation error messages
 * ```typescript
 * validateOpaConfig({ url: '', policyPath: '/v1/data', timeout: 5000 });
 * // Throws: "OPA URL is required and must be a string"
 *
 * validateOpaConfig({ url: 'not-a-url', policyPath: '/v1/data', timeout: 5000 });
 * // Throws: "OPA URL is invalid: not-a-url"
 *
 * validateOpaConfig({ url: 'http://opa:8181', policyPath: 'v1/data', timeout: 5000 });
 * // Throws: "OPA policy path must start with /"
 *
 * validateOpaConfig({ url: 'http://opa:8181', policyPath: '/v1/data', timeout: 60000 });
 * // Throws: "OPA timeout cannot exceed 30000ms (30 seconds)"
 * ```
 */
export function validateOpaConfig(options: IOpaModuleOptions): void {
  if (!options.url || typeof options.url !== 'string') {
    throw new OpaConfigError('OPA URL is required and must be a string');
  }

  try {
    new URL(options.url);
  } catch {
    throw new OpaConfigError(`OPA URL is invalid: ${options.url}`);
  }

  if (!options.policyPath || typeof options.policyPath !== 'string') {
    throw new OpaConfigError('OPA policy path is required and must be a string');
  }

  if (!options.policyPath.startsWith('/')) {
    throw new OpaConfigError('OPA policy path must start with /');
  }

  if (!Number.isFinite(options.timeout) || options.timeout <= 0) {
    throw new OpaConfigError('OPA timeout must be a positive finite number');
  }

  if (options.timeout > 30000) {
    throw new OpaConfigError('OPA timeout cannot exceed 30000ms (30 seconds)');
  }
}

/**
 * Creates OPA module options from environment variables.
 *
 * Reads configuration from environment variables, falling back to defaults
 * when not set. Automatically validates the resulting configuration.
 *
 * ## Environment Variables
 *
 * | Variable | Default | Description |
 * |----------|---------|-------------|
 * | `OPA_URL` | `http://localhost:8181` | OPA server URL |
 * | `OPA_POLICY_PATH` | `/v1/data/authz/allow` | Policy document path |
 * | `OPA_TIMEOUT` | `5000` | Request timeout (ms) |
 *
 * @param env - Environment variables object (typically `process.env`)
 * @returns Validated OPA configuration options
 * @throws {OpaConfigError} When validation fails (see {@link validateOpaConfig})
 *
 * @example Basic usage with process.env
 * ```typescript
 * import { opaConfigFromEnv } from '@package/opa';
 *
 * const config = opaConfigFromEnv(process.env);
 * // Uses OPA_URL, OPA_POLICY_PATH, OPA_TIMEOUT if set,
 * // otherwise falls back to defaults
 * ```
 *
 * @example In OpaModule.forRootAsync
 * ```typescript
 * import { OpaModule, opaConfigFromEnv } from '@package/opa';
 *
 * @Module({
 *   imports: [
 *     OpaModule.forRootAsync({
 *       useFactory: () => opaConfigFromEnv(process.env),
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Testing with custom environment
 * ```typescript
 * import { opaConfigFromEnv } from '@package/opa';
 *
 * const testEnv = {
 *   OPA_URL: 'http://test-opa:8181',
 *   OPA_POLICY_PATH: '/v1/data/test/authz/allow',
 *   OPA_TIMEOUT: '1000'
 * };
 *
 * const config = opaConfigFromEnv(testEnv);
 * expect(config.url).toBe('http://test-opa:8181');
 * expect(config.timeout).toBe(1000);
 * ```
 *
 * @see {@link OPA_ENV_VARS} for environment variable names
 * @see {@link DEFAULT_OPA_CONFIG} for default values
 * @see {@link validateOpaConfig} for validation rules
 */
export function opaConfigFromEnv(env: Record<string, string | undefined>): IOpaModuleOptions {
  const url = env[OPA_ENV_VARS.URL] ?? DEFAULT_OPA_CONFIG.url;
  const policyPath = env[OPA_ENV_VARS.POLICY_PATH] ?? DEFAULT_OPA_CONFIG.policyPath;
  const timeoutStr = env[OPA_ENV_VARS.TIMEOUT];
  const timeout = timeoutStr ? Number.parseInt(timeoutStr, 10) : DEFAULT_OPA_CONFIG.timeout;

  const options = { url, policyPath, timeout };
  validateOpaConfig(options);

  return options;
}
