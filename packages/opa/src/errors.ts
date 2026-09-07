/**
 * OPA Error Classes
 *
 * Typed error classes for OPA-related failures, providing consistent
 * error handling across the OPA module.
 *
 * @module @package/opa
 */

/**
 * Base error class for all OPA-related errors.
 *
 * Provides a common structure for OPA errors with cause chaining support.
 *
 * @example Handling OPA errors
 * ```typescript
 * try {
 *   await opaService.isAuthorized(request);
 * } catch (error) {
 *   if (error instanceof OpaError) {
 *     console.error('OPA error:', error.message);
 *     console.error('Cause:', error.cause);
 *   }
 * }
 * ```
 */
export class OpaError extends Error {
  /** The underlying error that caused this OPA error */
  override cause?: unknown;

  /**
   * Creates a new OPA error.
   *
   * @param message - Human-readable error description
   * @param cause - Original error that triggered this failure
   */
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'OpaError';
    this.cause = cause;
  }
}

/**
 * Error thrown when OPA configuration is invalid.
 *
 * This error is thrown during module initialization when configuration
 * validation fails. It provides clear error messages to help diagnose
 * configuration issues.
 *
 * @example Configuration validation
 * ```typescript
 * try {
 *   validateOpaConfig(config);
 * } catch (error) {
 *   if (error instanceof OpaConfigError) {
 *     console.error('Invalid OPA config:', error.message);
 *     process.exit(1);
 *   }
 * }
 * ```
 *
 * @example Common config errors
 * ```typescript
 * // Missing URL
 * throw new OpaConfigError('OPA URL is required and must be a string');
 *
 * // Invalid URL format
 * throw new OpaConfigError('OPA URL is invalid: not-a-url');
 *
 * // Invalid timeout
 * throw new OpaConfigError('OPA timeout must be a positive finite number');
 * ```
 */
export class OpaConfigError extends Error {
  /**
   * Creates a new OPA configuration error.
   *
   * @param message - Description of the configuration problem
   */
  constructor(message: string) {
    super(message);
    this.name = 'OpaConfigError';
  }
}

/**
 * Error thrown when an authorization request fails validation.
 *
 * This error is thrown before sending a request to OPA when the request
 * structure is invalid (missing required fields, wrong types, etc.).
 *
 * @example Request validation
 * ```typescript
 * try {
 *   await opaService.isAuthorized(request);
 * } catch (error) {
 *   if (error instanceof OpaValidationError) {
 *     console.error('Invalid request:', error.message);
 *     console.error('Field:', error.field);
 *   }
 * }
 * ```
 *
 * @example Common validation errors
 * ```typescript
 * // Missing user ID
 * throw new OpaValidationError('user.id is required', 'user.id');
 *
 * // Invalid resource type
 * throw new OpaValidationError('resource.type must be a string', 'resource.type');
 *
 * // Missing action
 * throw new OpaValidationError('action is required', 'action');
 * ```
 */
export class OpaValidationError extends Error {
  /** The field that failed validation (optional) */
  readonly field?: string;

  /**
   * Creates a new OPA validation error.
   *
   * @param message - Description of the validation failure
   * @param field - Optional field name that failed validation
   */
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'OpaValidationError';
    this.field = field;
  }
}
