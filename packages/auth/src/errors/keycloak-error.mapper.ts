/**
 * Keycloak Error Mapper
 *
 * Maps Keycloak error codes and HTTP status codes to application-specific error types.
 * Provides consistent error handling across all Keycloak provider methods.
 */

import {
  AuthenticationError,
  TokenValidationError,
  UserInfoRetrievalError,
  InvalidAuthProviderConfigError,
  AuthProviderConnectionError
} from '../errors';

/**
 * Keycloak error response structure
 */
interface KeycloakErrorResponse {
  error?: string;
  error_description?: string;
  error_code?: string;
}

/**
 * HTTP status to error type mapping
 */
const HTTP_STATUS_MAP: Record<number, new (message: string, cause?: Error | unknown) => Error> = {
  400: InvalidAuthProviderConfigError,
  401: AuthenticationError,
  403: AuthenticationError,
  404: UserInfoRetrievalError,
  409: AuthenticationError,
  429: TokenValidationError
};

/**
 * Keycloak-specific error code to error type mapping
 */
const KEYCLOAK_ERROR_MAP: Record<string, new (message: string) => Error> = {
  // Authentication errors
  invalid_grant: AuthenticationError,
  invalid_client: InvalidAuthProviderConfigError,
  unauthorized_client: InvalidAuthProviderConfigError,
  invalid_credentials: AuthenticationError,
  user_not_found: UserInfoRetrievalError,
  account_disabled: AuthenticationError,

  // Token errors
  expired_token: TokenValidationError,
  invalid_token: TokenValidationError,
  token_expired: TokenValidationError,
  token_not_active: TokenValidationError,

  // Authorization errors
  access_denied: AuthenticationError,
  forbidden: AuthenticationError,
  insufficient_scope: AuthenticationError,

  // Configuration errors
  invalid_request: InvalidAuthProviderConfigError,
  invalid_request_uri: InvalidAuthProviderConfigError,
  unsupported_grant_type: InvalidAuthProviderConfigError,

  // Resource errors
  not_found: UserInfoRetrievalError,
  conflict: AuthenticationError,

  // Rate limiting
  rate_limit_exceeded: TokenValidationError,

  // Server errors
  server_error: AuthProviderConnectionError,
  temporarily_unavailable: AuthProviderConnectionError
};

/**
 * Keycloak error mapper class
 */
export class KeycloakErrorMapper {
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
    const errorBody = body as KeycloakErrorResponse;
    const errorCode = errorBody.error ?? errorBody.error_code;
    const errorDescription = errorBody.error_description;

    // Try Keycloak-specific error code mapping first
    if (errorCode && errorCode in KEYCLOAK_ERROR_MAP) {
      const ErrorClass = KEYCLOAK_ERROR_MAP[errorCode];
      if (!ErrorClass) {
        throw new Error(`Error class not found for Keycloak error code: ${errorCode}`);
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
    return new AuthProviderConnectionError('keycloak', `${context}: ${message}`);
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
      return new AuthProviderConnectionError('keycloak', `${context}: Request timeout`);
    }

    if (error instanceof Error) {
      // Other fetch-related errors
      return new AuthProviderConnectionError('keycloak', `${context}: ${error.message}`);
    }

    // Unknown error type
    return new AuthProviderConnectionError('keycloak', `${context}: ${String(error)}`);
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
 * Helper function to map Keycloak errors
 *
 * Convenience wrapper for KeycloakErrorMapper.fromHttpResponse
 *
 * @param status - HTTP status code
 * @param body - Response body
 * @param context - Context information
 * @returns Mapped error
 */
export function mapKeycloakError(
  status: number,
  body: unknown,
  context: string
):
  | AuthenticationError
  | TokenValidationError
  | UserInfoRetrievalError
  | InvalidAuthProviderConfigError {
  return KeycloakErrorMapper.fromHttpResponse(status, body, context);
}

/**
 * Helper function to map fetch errors
 *
 * Convenience wrapper for KeycloakErrorMapper.fromFetchError
 *
 * @param error - Fetch error
 * @param context - Context information
 * @returns Mapped error
 */
export function mapFetchError(error: Error | unknown, context: string): Error {
  return KeycloakErrorMapper.fromFetchError(error, context);
}
