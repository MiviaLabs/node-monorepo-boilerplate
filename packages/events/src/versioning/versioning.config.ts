/**
 * Event versioning configuration
 *
 * This module defines configuration options for event versioning behavior.
 * Configuration controls whether versioning is enabled, strict mode behavior,
 * and default version values.
 *
 * @module versioning/versioning-config
 */

/**
 * Event versioning configuration options
 *
 * Controls the behavior of event versioning in the events system.
 *
 * @example
 * ```typescript
 * const config: EventVersioningConfig = {
 *   enabled: true,
 *   strictMode: false,
 *   defaultVersion: '1.0',
 * };
 * ```
 */
export interface EventVersioningConfig {
  /**
   * Enable event versioning
   *
   * When enabled, events include schema version information and compatibility
   * checks are performed. When disabled, all events use the default version
   * and no compatibility validation occurs.
   *
   * @default true
   */
  readonly enabled?: boolean;

  /**
   * Enable strict mode
   *
   * In strict mode, events will be rejected if the consumer version is not
   * compatible with the producer version. In non-strict mode, a warning is
   * logged but the event is still processed.
   *
   * @default false
   */
  readonly strictMode?: boolean;

  /**
   * Default event schema version
   *
   * Used when events don't specify a version. Follows semantic versioning
   * format 'major.minor'.
   *
   * @default '1.0'
   */
  readonly defaultVersion?: string;
}

/**
 * Default event versioning configuration
 *
 * These defaults are designed for production use with balanced safety
 * and flexibility. Versioning is enabled by default to catch compatibility
 * issues early, but strict mode is disabled to allow gradual migration.
 *
 * Override these defaults via EventsModule.forRootAsync() when needed.
 *
 * @example
 * ```typescript
 * // Enable strict mode for production
 * const config: EventVersioningConfig = {
 *   ...DEFAULT_VERSIONING_CONFIG,
 *   strictMode: true,
 * };
 *
 * // Disable versioning during development
 * const devConfig: EventVersioningConfig = {
 *   ...DEFAULT_VERSIONING_CONFIG,
 *   enabled: false,
 * };
 * ```
 */
export const DEFAULT_VERSIONING_CONFIG: EventVersioningConfig = {
  /** Enable versioning by default to catch compatibility issues */
  enabled: true,

  /** Disable strict mode by default to allow gradual migration */
  strictMode: false,

  /** Default to version 1.0 for new event types */
  defaultVersion: '1.0'
} as const;

/**
 * Create event versioning configuration with custom settings
 *
 * Merges custom configuration with defaults, giving precedence to custom values.
 *
 * @param config - Custom configuration options
 * @returns Merged configuration object
 *
 * @example
 * ```typescript
 * const config = createEventVersioningConfig({
 *   strictMode: true,      // Enable strict mode
 *   defaultVersion: '2.0', // Use different default version
 * });
 *
 * // Result: { enabled: true, strictMode: true, defaultVersion: '2.0' }
 * ```
 */
export function createEventVersioningConfig(
  config: Partial<EventVersioningConfig>
): EventVersioningConfig {
  return {
    ...DEFAULT_VERSIONING_CONFIG,
    ...config
  };
}

/**
 * Validate event versioning configuration
 *
 * Checks that configuration values are valid. Throws an error if validation fails.
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 *
 * @example
 * ```typescript
 * try {
 *   validateEventVersioningConfig(config);
 * } catch (error) {
 *   console.error('Invalid configuration:', error.message);
 * }
 * ```
 */
export function validateEventVersioningConfig(config: EventVersioningConfig): void {
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
    throw new Error('enabled must be a boolean');
  }

  if (config.strictMode !== undefined && typeof config.strictMode !== 'boolean') {
    throw new Error('strictMode must be a boolean');
  }

  if (config.defaultVersion !== undefined) {
    // Validate semver format (major.minor)
    const semverPattern = /^\d+\.\d+$/;
    if (!semverPattern.test(config.defaultVersion)) {
      throw new Error('defaultVersion must be in semantic versioning format (major.minor)');
    }

    // Validate version numbers are reasonable
    const parts = config.defaultVersion.split('.');
    const major = Number(parts[0]);
    const minor = Number(parts[1]);

    if (major < 0 || major > 999) {
      throw new Error('defaultVersion major number must be between 0 and 999');
    }
    if (minor < 0 || minor > 999) {
      throw new Error('defaultVersion minor number must be between 0 and 999');
    }
  }
}
