/**
 * HTTP Status Constants
 *
 * Centralized HTTP status code constants for type safety and maintainability.
 * Eliminates magic numbers throughout the codebase.
 *
 * @packageDocumentation
 */

/**
 * HTTP Status Code Constants
 */
export const HttpStatus = {
  // Client Error (4xx)
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // Server Error (5xx)
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
} as const;

/**
 * HTTP Status Boundaries
 * Used for determining error severity and categorization
 */
export const HttpStatusBoundaries = {
  /** Maximum status code for client errors */
  CLIENT_ERROR_MAX: 499,
  /** Minimum status code for server errors */
  SERVER_ERROR_MIN: 500
} as const;

/**
 * Retryable HTTP status codes
 * Status codes where the client can retry the request after a delay
 */
export const RetryableStatusCodes = [408, 429, 500, 503] as const;

/**
 * Type guard to check if status is a client error (4xx).
 *
 * @param status - HTTP status code to check
 * @returns True if status is between 400 and 499 inclusive
 */
export function isClientError(status: number): boolean {
  return status >= 400 && status < HttpStatusBoundaries.SERVER_ERROR_MIN;
}

/**
 * Type guard to check if status is a server error (5xx).
 *
 * @param status - HTTP status code to check
 * @returns True if status is between 500 and 599 inclusive
 */
export function isServerError(status: number): boolean {
  return status >= HttpStatusBoundaries.SERVER_ERROR_MIN && status < 600;
}

/**
 * Type guard to check if status is retryable.
 *
 * @param status - HTTP status code to check
 * @returns True if status is one of the retryable codes (408, 429, 500, 503)
 */
export function isRetryableStatus(status: number): boolean {
  return RetryableStatusCodes.includes(status as (typeof RetryableStatusCodes)[number]);
}
