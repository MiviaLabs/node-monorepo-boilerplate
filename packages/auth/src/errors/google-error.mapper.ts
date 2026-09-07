/**
 * Google Error Mapper
 *
 * Maps Google OAuth 2.0 error codes and HTTP status codes to application-specific error types.
 * Provides consistent error handling across all Google auth provider methods.
 */

import {
  AuthenticationError,
  TokenValidationError,
  UserInfoRetrievalError,
  InvalidAuthProviderConfigError,
  AuthProviderConnectionError
} from '../errors';

/**
 * Google error response structure
 */
interface GoogleErrorResponse {
  error?: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * HTTP status to error type mapping
 */
const HTTP_STATUS_MAP: Record<number, new (message: string, cause?: Error | unknown) => Error> = {
  400: InvalidAuthProviderConfigError,
  401: AuthenticationError,
  403: AuthenticationError,
  404: UserInfoRetrievalError,
  429: TokenValidationError
};

/**
 * Google-specific error code to error type mapping
 *
 * Reference: https://developers.google.com/identity/protocols/oauth2/errors
 */
const GOOGLE_ERROR_MAP: Record<string, new (message: string) => Error> = {
  // Authentication errors
  invalid_grant: AuthenticationError,
  invalid_client: InvalidAuthProviderConfigError,
  unauthorized_client: InvalidAuthProviderConfigError,
  invalid_credentials: AuthenticationError,
  authentication_failed: AuthenticationError,

  // Token errors
  expired_token: TokenValidationError,
  invalid_token: TokenValidationError,
  token_expired: TokenValidationError,
  invalid_token_signature: TokenValidationError,

  // Authorization errors
  access_denied: AuthenticationError,
  permission_denied: AuthenticationError,
  insufficient_permissions: AuthenticationError,

  // Configuration errors
  invalid_request: InvalidAuthProviderConfigError,
  redirect_uri_mismatch: InvalidAuthProviderConfigError,
  unsupported_grant_type: InvalidAuthProviderConfigError,
  unsupported_response_type: InvalidAuthProviderConfigError,

  // Resource errors
  not_found: UserInfoRetrievalError,
  resource_not_found: UserInfoRetrievalError,

  // Rate limiting
  rate_limit_exceeded: TokenValidationError,
  too_many_requests: TokenValidationError,

  // Server errors
  server_error: AuthProviderConnectionError,
  temporarily_unavailable: AuthProviderConnectionError,
  internal_error: AuthProviderConnectionError,

  // Google-specific errors
  invalid_client_metadata: InvalidAuthProviderConfigError,
  invalid_scope: InvalidAuthProviderConfigError
};

/**
 * Google error mapper class
 */
export class GoogleErrorMapper {
  /**
   * Map HTTP response to application error
   *
   * @param status - HTTP status code
   * @param body - Response body (optional)
   * @param context - Context information for error message
   * @returns Mapped error
   */
  static fromHttpResponse(
    status: number,
    body: unknown,
    context: string
  ):
    | AuthenticationError
    | TokenValidationError
    | UserInfoRetrievalError
    | InvalidAuthProviderConfigError {
    const errorBody = body as GoogleErrorResponse;
    const errorCode = errorBody.error;
    const errorDescription = errorBody.error_description;

    // Try Google-specific error code mapping first
    if (errorCode && errorCode in GOOGLE_ERROR_MAP) {
      const ErrorClass = GOOGLE_ERROR_MAP[errorCode];
      if (!ErrorClass) {
        throw new Error(`Error class not found for Google error code: ${errorCode}`);
      }
      const message = errorDescription ?? `${context}: ${errorCode}`;
      return new ErrorClass(message) as
        | AuthenticationError
        | TokenValidationError
        | UserInfoRetrievalError
        | InvalidAuthProviderConfigError;
    }

    // Fall back to HTTP status code mapping
    const ErrorClass = HTTP_STATUS_MAP[status] ?? AuthProviderConnectionError;
    const message = errorDescription ?? `${context}: ${status} ${this.getStatusText(status)}`;

    return new ErrorClass(message) as
      | AuthenticationError
      | TokenValidationError
      | UserInfoRetrievalError
      | InvalidAuthProviderConfigError;
  }

  /**
   * Map network/connection error to application error
   *
   * @param error - Original error
   * @param context - Context information for error message
   * @returns Mapped error
   */
  static fromNetworkError(error: Error | unknown, context: string): AuthProviderConnectionError {
    const message = error instanceof Error ? error.message : String(error);
    return new AuthProviderConnectionError('google', `${context}: ${message}`);
  }

  /**
   * Map fetch error to application error
   *
   * Handles common fetch error scenarios including:
   * - Network errors
   * - Timeout errors
   * - Abort errors
   *
   * @param error - Fetch error
   * @param context - Context information for error message
   * @returns Mapped error
   */
  static fromFetchError(error: Error | unknown, context: string): Error {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      // Network error (e.g., ECONNREFUSED, DNS lookup failed)
      return this.fromNetworkError(error, context);
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      // Timeout error
      return new AuthProviderConnectionError('google', `${context}: Request timeout`);
    }

    if (error instanceof Error) {
      // Other fetch-related errors
      return new AuthProviderConnectionError('google', `${context}: ${error.message}`);
    }

    // Unknown error type
    return new AuthProviderConnectionError('google', `${context}: ${String(error)}`);
  }

  /**
   * Get HTTP status text
   *
   * @param status - HTTP status code
   * @returns Status text
   */
  private static getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout'
    };

    return statusTexts[status] ?? 'Unknown Status';
  }
}

/**
 * Helper function to map Google errors
 *
 * Convenience wrapper for GoogleErrorMapper.fromHttpResponse
 *
 * @param status - HTTP status code
 * @param body - Response body
 * @param context - Context information
 * @returns Mapped error
 */
export function mapGoogleError(
  status: number,
  body: unknown,
  context: string
):
  | AuthenticationError
  | TokenValidationError
  | UserInfoRetrievalError
  | InvalidAuthProviderConfigError {
  return GoogleErrorMapper.fromHttpResponse(status, body, context);
}

/**
 * Helper function to map fetch errors
 *
 * Convenience wrapper for GoogleErrorMapper.fromFetchError
 *
 * @param error - Fetch error
 * @param context - Context information
 * @returns Mapped error
 */
export function mapGoogleFetchError(error: Error | unknown, context: string): Error {
  return GoogleErrorMapper.fromFetchError(error, context);
}
