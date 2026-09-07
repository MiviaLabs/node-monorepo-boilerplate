/**
 * Error type constants
 *
 * Error types provide a high-level categorization of errors that determines:
 * - HTTP status code mapping (4xx client errors vs 5xx server errors)
 * - Logging severity (info, warn, error, critical)
 * - Retry behavior (retryable vs non-retryable)
 * - User-facing vs internal error handling
 *
 * Error type taxonomy:
 *
 * **Client Errors (4xx)**
 * - ValidationError: Invalid input data → 400 Bad Request
 * - AuthenticationError: Identity verification failed → 401 Unauthorized
 * - AuthorizationError: Insufficient permissions → 403 Forbidden
 * - NotFoundError: Resource doesn't exist → 404 Not Found
 * - ConflictError: State conflict (duplicate, concurrent update) → 409 Conflict
 * - BusinessLogicError: Business rule violation → 422 Unprocessable Entity
 *
 * **Server Errors (5xx)**
 * - ExternalServiceError: Third-party API failure → 502 Bad Gateway
 * - DatabaseError: Database operation failure → 503 Service Unavailable
 * - InternalError: Unexpected system failure → 500 Internal Server Error
 *
 * The `RegisteredError` class uses these types to determine error handling
 * behavior in exception filters and error response formatters.
 *
 * @see packages/errors/src/exceptions/registered-error.exception.ts - Error type handling
 * @see packages/errors/src/registry/error-registry.types.ts - ErrorType enum definition
 *
 * @example
 * ```typescript
 * import { ERROR_TYPE } from '@package/constants/errors';
 *
 * // In exception filter - determine response format by error type
 * if (error.definition.type === ERROR_TYPE.VALIDATION_ERROR) {
 *   return formatValidationErrorResponse(error);
 * }
 *
 * // In error handler - determine retry strategy
 * const isRetryable =
 *   error.type === ERROR_TYPE.EXTERNAL_SERVICE_ERROR ||
 *   error.type === ERROR_TYPE.DATABASE_ERROR;
 * ```
 */

export const ERROR_TYPE = {
  // ──────────────────────────────────────────────────────────────────────────
  // Client errors - caused by invalid client input or state
  // These errors indicate the client should modify the request before retrying
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Input validation failure
   *
   * Thrown when request data fails schema validation (Zod), type coercion,
   * or business rule validation. Always maps to HTTP 400 Bad Request.
   *
   * Examples: missing required field, invalid email format, string too long
   */
  VALIDATION_ERROR: 'ValidationError',

  /**
   * Identity verification failure
   *
   * Thrown when user identity cannot be verified (missing/invalid token,
   * expired session, invalid credentials). Maps to HTTP 401 Unauthorized.
   *
   * Examples: bad password, expired JWT, missing Authorization header
   */
  AUTHENTICATION_ERROR: 'AuthenticationError',

  /**
   * Permission denial
   *
   * Thrown when authenticated user lacks permission for the requested operation.
   * User identity is known but access is forbidden. Maps to HTTP 403 Forbidden.
   *
   * Examples: non-admin accessing admin route, cross-tenant access attempt
   */
  AUTHORIZATION_ERROR: 'AuthorizationError',

  /**
   * Resource not found
   *
   * Thrown when requested resource does not exist or has been deleted.
   * Maps to HTTP 404 Not Found.
   *
   * Examples: invalid user ID, deleted organization, non-existent endpoint
   */
  NOT_FOUND_ERROR: 'NotFoundError',

  /**
   * State conflict
   *
   * Thrown when operation conflicts with current resource state.
   * Maps to HTTP 409 Conflict.
   *
   * Examples: duplicate email registration, optimistic lock failure,
   * concurrent modification detected
   */
  CONFLICT_ERROR: 'ConflictError',

  /**
   * Business rule violation
   *
   * Thrown when request is technically valid but violates business rules.
   * Maps to HTTP 422 Unprocessable Entity.
   *
   * Examples: insufficient account balance, subscription required,
   * invalid workflow state transition
   */
  BUSINESS_LOGIC_ERROR: 'BusinessLogicError',

  // ──────────────────────────────────────────────────────────────────────────
  // Server errors - caused by system/infrastructure failures
  // These errors may be transient and retryable
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * External service failure
   *
   * Thrown when third-party API call fails (timeout, 5xx response, network error).
   * Maps to HTTP 502 Bad Gateway. Often retryable with exponential backoff.
   *
   * Examples: payment gateway timeout, email service unavailable,
   * SMS provider rate limited
   */
  EXTERNAL_SERVICE_ERROR: 'ExternalServiceError',

  /**
   * Database operation failure
   *
   * Thrown when PostgreSQL operation fails (connection lost, query timeout,
   * transaction deadlock). Maps to HTTP 503 Service Unavailable.
   * May be retryable depending on cause.
   *
   * Examples: connection pool exhausted, deadlock detected, replication lag
   */
  DATABASE_ERROR: 'DatabaseError',

  /**
   * Unexpected system error
   *
   * Catch-all for unhandled exceptions and unexpected system failures.
   * Maps to HTTP 500 Internal Server Error. Should trigger alerts.
   *
   * Examples: null pointer, out of memory, unhandled promise rejection
   */
  INTERNAL_ERROR: 'InternalError'
} as const;

export type ErrorType = (typeof ERROR_TYPE)[keyof typeof ERROR_TYPE];
