/**
 * Base error class for all infrastructure-layer errors in the Node Monorepo Boilerplate.
 *
 * This class serves as the foundation for the infrastructure error hierarchy,
 * providing consistent error handling, identification, and serialization across
 * all infrastructure operations including database connections, external services,
 * configuration management, and queue processing.
 *
 * All infrastructure-specific errors should extend this class to ensure:
 * - Consistent error code identification for monitoring and alerting
 * - Proper error chaining for root cause analysis
 * - JSON serialization for API responses and logging
 * - Stack trace preservation for debugging
 *
 * @example Basic error creation
 * ```typescript
 * // Create a simple infrastructure error
 * const error = new InfrastructureError(
 *   'Failed to initialize cache layer',
 *   'CACHE_INIT_ERROR'
 * );
 * console.log(error.code); // 'CACHE_INIT_ERROR'
 * console.log(error.message); // 'Failed to initialize cache layer'
 * ```
 *
 * @example Error chaining with cause
 * ```typescript
 * // Wrap a lower-level error with context
 * try {
 *   await redisClient.connect();
 * } catch (originalError) {
 *   throw new InfrastructureError(
 *     'Redis connection failed during startup',
 *     'REDIS_CONNECTION_ERROR',
 *     originalError
 *   );
 * }
 * // The original error is preserved in error.cause
 * ```
 *
 * @example JSON serialization for API responses
 * ```typescript
 * const error = new InfrastructureError(
 *   'Database query failed',
 *   'DB_QUERY_ERROR',
 *   new Error('Connection timeout')
 * );
 *
 * const json = error.toJSON();
 * // {
 * //   name: 'InfrastructureError',
 * //   message: 'Database query failed',
 * //   code: 'DB_QUERY_ERROR',
 * //   cause: 'Connection timeout'
 * // }
 * ```
 *
 * @see {@link ConfigurationError} - For configuration-related errors
 * @see {@link ConnectionError} - For service connection failures
 * @see {@link NotFoundError} - For resource not found errors
 * @see {@link OperationError} - For operation execution failures
 * @see {@link TimeoutError} - For timeout-related errors
 * @see {@link MaxRetriesExceededError} - For retry exhaustion errors
 */
export class InfrastructureError extends Error {
  /**
   * Type discriminator for identifying InfrastructureError instances.
   * Used for type guards and error handling logic.
   */
  public readonly isInfrastructureError = true;

  /**
   * Error code for categorization and monitoring.
   * Private field to ensure immutability after construction.
   */
  readonly #code: string;

  /**
   * Original error that caused this infrastructure error.
   * Stored separately from the standard Error.cause for type safety.
   */
  readonly #internalCause?: Error | unknown;

  /**
   * Creates a new InfrastructureError instance.
   *
   * @param message - Human-readable description of the error. Should be concise
   *   but provide enough context to understand what failed. This message may be
   *   logged or displayed to operators, so avoid including sensitive information.
   * @param code - Unique error identifier for categorization, monitoring, and alerting.
   *   Use SCREAMING_SNAKE_CASE format (e.g., 'CONNECTION_ERROR', 'TIMEOUT_ERROR').
   *   This code should be stable across versions to enable reliable error tracking.
   * @param cause - Optional original error that triggered this infrastructure error.
   *   Preserving the cause enables root cause analysis and debugging. Can be an
   *   Error instance or any unknown value caught during execution.
   *
   * @example
   * ```typescript
   * // Simple error without cause
   * throw new InfrastructureError('Service unavailable', 'SERVICE_DOWN');
   *
   * // Error with cause for debugging
   * throw new InfrastructureError(
   *   'Failed to process message',
   *   'MESSAGE_PROCESSING_ERROR',
   *   originalException
   * );
   * ```
   */
  constructor(message: string, code: string, cause?: Error | unknown) {
    super(message);
    this.#code = code;
    this.#internalCause = cause;
    this.name = this.constructor.name;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Gets the original error that caused this infrastructure error.
   *
   * This getter overrides the standard Error.cause property to provide
   * type-safe access to the wrapped error. The cause is preserved for
   * debugging and root cause analysis.
   *
   * @returns The original error if one was provided, or undefined if this
   *   error was created without a cause.
   *
   * @example
   * ```typescript
   * try {
   *   throw new InfrastructureError('Wrapper', 'CODE', new Error('Root cause'));
   * } catch (error) {
   *   if (error instanceof InfrastructureError && error.cause) {
   *     console.log('Root cause:', error.cause);
   *   }
   * }
   * ```
   */
  override get cause(): Error | unknown | undefined {
    return this.#internalCause;
  }

  /**
   * Gets the error code for categorization and monitoring.
   *
   * The code is immutable after construction and should be used for:
   * - Error categorization in monitoring systems
   * - Alerting rule configuration
   * - Client-side error handling decisions
   * - Log aggregation and analysis
   *
   * @returns The error code string in SCREAMING_SNAKE_CASE format.
   *
   * @example
   * ```typescript
   * const error = new InfrastructureError('Failed', 'QUEUE_PUBLISH_ERROR');
   * metrics.incrementCounter('infrastructure_errors', { code: error.code });
   * ```
   */
  get code(): string {
    return this.#code;
  }

  /**
   * Serializes the error to a plain object for JSON responses and logging.
   *
   * This method creates a structured representation of the error suitable for:
   * - API error responses
   * - Structured logging systems
   * - Error tracking services
   * - Debug output
   *
   * The cause is serialized as a string message to prevent circular references
   * and sensitive data leakage in serialized output.
   *
   * @returns A plain object containing the error details:
   *   - `name`: The error class name (e.g., 'InfrastructureError')
   *   - `message`: The error message
   *   - `code`: The error code for categorization
   *   - `cause`: The cause message as a string, or 'undefined' if no cause
   *
   * @example
   * ```typescript
   * const error = new InfrastructureError(
   *   'Connection lost',
   *   'CONN_LOST',
   *   new Error('Socket closed')
   * );
   *
   * // For API response
   * res.status(500).json({ error: error.toJSON() });
   *
   * // For structured logging
   * logger.error('Infrastructure failure', error.toJSON());
   * ```
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      cause: this.cause instanceof Error ? this.cause.message : String(this.cause)
    };
  }
}
