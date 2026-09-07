/**
 * Environment Utility
 *
 * Provides utility functions for checking the application runtime environment.
 * This centralizes environment checks and makes them more robust and testable.
 */

/**
 * Check if the application is running in production mode
 *
 * This function checks the NODE_ENV environment variable and determines
 * if the application is running in production mode. It provides a more
 * robust check than directly accessing process.env.NODE_ENV.
 *
 * Production is detected when NODE_ENV is exactly 'production' (case-sensitive).
 * Any other value (including undefined, 'development', 'test', 'staging', etc.)
 * is considered non-production.
 *
 * @returns true if running in production, false otherwise
 *
 * @example
 * ```ts
 * if (isProduction()) {
 *   // Production-specific code (e.g., hide error details)
 * } else {
 *   // Development/testing code (e.g., show stack traces)
 * }
 * ```
 */
export function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

/**
 * Check if the application is running in development mode
 *
 * @returns true if running in development, false otherwise
 */
export function isDevelopment(): boolean {
  return process.env['NODE_ENV'] === 'development';
}

/**
 * Check if the application is running in test mode
 *
 * @returns true if running in test mode, false otherwise
 */
export function isTest(): boolean {
  return process.env['NODE_ENV'] === 'test';
}

/**
 * Check if the application is running in staging mode
 *
 * @returns true if running in staging, false otherwise
 */
export function isStaging(): boolean {
  return process.env['NODE_ENV'] === 'staging';
}

/**
 * Check if debug mode is enabled
 *
 * Debug mode can be explicitly enabled via DEBUG environment variable,
 * or it can be implicitly enabled when not in production.
 *
 * @returns true if debug mode is enabled, false otherwise
 */
export function isDebugEnabled(): boolean {
  // Explicit debug flag
  if (process.env['DEBUG'] === 'true' || process.env['DEBUG'] === '1') {
    return true;
  }

  // Implicit debug mode when not in production
  return !isProduction();
}
