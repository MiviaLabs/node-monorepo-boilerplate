import { InfrastructureError } from './infrastructure-error';

/**
 * Error thrown when infrastructure configuration is invalid, missing, or malformed.
 *
 * This is the base class for all configuration-related errors, providing a common
 * structure for identifying configuration problems during application startup or
 * runtime configuration changes. Configuration errors typically indicate problems
 * with environment variables, configuration files, or programmatic configuration.
 *
 * Configuration errors are generally non-recoverable and require operator
 * intervention to resolve. The application should fail fast with clear error
 * messages when configuration errors occur.
 *
 * **Error Hierarchy:**
 * ```
 * InfrastructureError
 * └── ConfigurationError
 *     ├── MissingConfigurationError  (required value not provided)
 *     └── InvalidConfigurationError  (value provided but invalid)
 * ```
 *
 * @example Basic configuration error
 * ```typescript
 * // Generic configuration error with field context
 * throw new ConfigurationError(
 *   'Database configuration is incomplete',
 *   'database'
 * );
 * ```
 *
 * @example Configuration error with cause
 * ```typescript
 * // Wrap a parsing error with configuration context
 * try {
 *   const config = JSON.parse(configFile);
 * } catch (parseError) {
 *   throw new ConfigurationError(
 *     'Failed to parse configuration file',
 *     'config.json',
 *     parseError
 *   );
 * }
 * ```
 *
 * @example Configuration validation workflow
 * ```typescript
 * function validateDatabaseConfig(config: unknown): DatabaseConfig {
 *   if (!config || typeof config !== 'object') {
 *     throw new ConfigurationError('Database configuration must be an object');
 *   }
 *   // ... validation logic
 *   return config as DatabaseConfig;
 * }
 * ```
 *
 * @see {@link MissingConfigurationError} - When a required configuration value is not provided
 * @see {@link InvalidConfigurationError} - When a configuration value fails validation
 * @see {@link InfrastructureError} - Parent class providing error code and serialization
 */
export class ConfigurationError extends InfrastructureError {
  /**
   * Creates a new ConfigurationError instance.
   *
   * @param message - Human-readable description of the configuration problem.
   *   Should clearly describe what configuration is wrong and, if possible,
   *   hint at how to fix it. Avoid including sensitive values in the message.
   * @param field - Optional name of the configuration field that caused the error.
   *   Use dot notation for nested fields (e.g., 'database.host', 'redis.password').
   *   This helps operators quickly locate the problematic configuration.
   * @param cause - Optional original error that led to this configuration error.
   *   Useful when wrapping parsing errors, validation library errors, or
   *   file system errors encountered during configuration loading.
   *
   * @example
   * ```typescript
   * // Simple configuration error
   * throw new ConfigurationError('SSL certificates not configured');
   *
   * // With field context
   * throw new ConfigurationError(
   *   'Invalid connection string format',
   *   'DATABASE_URL'
   * );
   *
   * // With cause for debugging
   * throw new ConfigurationError(
   *   'Failed to load secrets',
   *   'secrets.vault',
   *   vaultError
   * );
   * ```
   */
  constructor(
    message: string,
    public readonly field?: string,
    cause?: Error | unknown
  ) {
    super(message, 'CONFIGURATION_ERROR', cause);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when a required configuration value is not provided.
 *
 * This specialized configuration error indicates that a mandatory configuration
 * field was not found in any configuration source (environment variables,
 * configuration files, default values, etc.). The application cannot proceed
 * without this value.
 *
 * Use this error when:
 * - An environment variable is not set
 * - A required configuration file is missing
 * - A required field in a configuration object is undefined
 *
 * @throws {MissingConfigurationError} When required configuration is absent
 *
 * @example Missing environment variable
 * ```typescript
 * const apiKey = process.env.API_KEY;
 * if (!apiKey) {
 *   throw new MissingConfigurationError('API_KEY');
 * }
 * ```
 *
 * @example Missing configuration with context
 * ```typescript
 * // Provide context about where the configuration is needed
 * const redisHost = config.redis?.host;
 * if (!redisHost) {
 *   throw new MissingConfigurationError(
 *     'redis.host',
 *     'Redis cache service'
 *   );
 * }
 * // Error message: "Missing required configuration 'redis.host' for Redis cache service"
 * ```
 *
 * @example Environment variable resolution failures
 * ```typescript
 * function requireEnv(name: string): string {
 *   const value = process.env[name];
 *   if (value === undefined || value === '') {
 *     throw new MissingConfigurationError(name, 'environment variables');
 *   }
 *   return value;
 * }
 *
 * // Usage
 * const dbUrl = requireEnv('DATABASE_URL');
 * const secret = requireEnv('JWT_SECRET');
 * ```
 *
 * @see {@link ConfigurationError} - Parent class for all configuration errors
 * @see {@link InvalidConfigurationError} - When a value exists but is invalid
 */
export class MissingConfigurationError extends ConfigurationError {
  /**
   * Creates a new MissingConfigurationError instance.
   *
   * @param field - The name of the missing configuration field. Use the exact
   *   name as it appears in the configuration source (e.g., 'DATABASE_URL' for
   *   environment variables, 'server.port' for config file fields).
   * @param context - Optional context describing where this configuration is
   *   required. Helps operators understand why this configuration is needed
   *   and what component depends on it (e.g., 'PostgreSQL connection',
   *   'JWT authentication', 'Redis cache service').
   *
   * @example
   * ```typescript
   * // Without context
   * throw new MissingConfigurationError('SMTP_HOST');
   * // Message: "Missing required configuration 'SMTP_HOST'"
   *
   * // With context
   * throw new MissingConfigurationError('SMTP_HOST', 'email notifications');
   * // Message: "Missing required configuration 'SMTP_HOST' for email notifications"
   * ```
   */
  constructor(field: string, context?: string) {
    const message = context
      ? `Missing required configuration '${field}' for ${context}`
      : `Missing required configuration '${field}'`;
    super(message, field);
    this.name = 'MissingConfigurationError';
  }
}

/**
 * Error thrown when a configuration value exists but fails validation.
 *
 * This specialized configuration error indicates that a configuration value
 * was provided but does not meet the required constraints or format. The value
 * might be the wrong type, out of valid range, malformed, or semantically invalid.
 *
 * Use this error when:
 * - A value has the wrong type (expected number, got string)
 * - A value is outside valid bounds (port > 65535)
 * - A value has invalid format (malformed URL, invalid email)
 * - A value references non-existent resources (invalid file path)
 *
 * @throws {InvalidConfigurationError} When configuration value fails validation
 *
 * @example Invalid type
 * ```typescript
 * const port = process.env.PORT;
 * const portNum = Number(port);
 * if (isNaN(portNum)) {
 *   throw new InvalidConfigurationError(
 *     'PORT',
 *     port,
 *     'must be a valid number'
 *   );
 * }
 * ```
 *
 * @example Invalid range
 * ```typescript
 * const maxRetries = config.maxRetries;
 * if (maxRetries < 1 || maxRetries > 100) {
 *   throw new InvalidConfigurationError(
 *     'maxRetries',
 *     maxRetries,
 *     'must be between 1 and 100'
 *   );
 * }
 * ```
 *
 * @example Invalid format
 * ```typescript
 * const dbUrl = process.env.DATABASE_URL;
 * try {
 *   new URL(dbUrl);
 * } catch {
 *   throw new InvalidConfigurationError(
 *     'DATABASE_URL',
 *     dbUrl,
 *     'must be a valid URL (e.g., postgresql://user:pass@host:5432/db)'
 *   );
 * }
 * ```
 *
 * @see {@link ConfigurationError} - Parent class for all configuration errors
 * @see {@link MissingConfigurationError} - When a required value is not provided
 */
export class InvalidConfigurationError extends ConfigurationError {
  /**
   * Creates a new InvalidConfigurationError instance.
   *
   * @param field - The name of the invalid configuration field. Use the exact
   *   name as it appears in the configuration source.
   * @param value - The actual invalid value that was provided. This is included
   *   in the error message for debugging purposes. Be cautious with sensitive
   *   values - consider masking passwords or tokens before passing them here.
   * @param reason - A description of why the value is invalid and what the
   *   valid format or constraints are. Should be actionable - tell the operator
   *   exactly what needs to be fixed (e.g., 'must be a positive integer',
   *   'must be one of: development, staging, production').
   *
   * @example
   * ```typescript
   * // Type validation
   * throw new InvalidConfigurationError(
   *   'timeout',
   *   'five seconds',
   *   'must be a number in milliseconds'
   * );
   * // Message: "Invalid configuration 'timeout': must be a number in milliseconds. Got: "five seconds""
   *
   * // Enum validation
   * throw new InvalidConfigurationError(
   *   'LOG_LEVEL',
   *   'VERBOSE',
   *   'must be one of: debug, info, warn, error'
   * );
   *
   * // Sensitive value (masked)
   * throw new InvalidConfigurationError(
   *   'API_KEY',
   *   '***MASKED***',
   *   'must be a valid 32-character hexadecimal string'
   * );
   * ```
   */
  constructor(field: string, value: unknown, reason: string) {
    super(`Invalid configuration '${field}': ${reason}. Got: ${JSON.stringify(value)}`, field);
    this.name = 'InvalidConfigurationError';
  }
}
