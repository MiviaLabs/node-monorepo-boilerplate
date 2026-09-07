/**
 * Firebase Error Mapper
 *
 * Maps Firebase Identity Platform error codes to application-specific error types.
 * Provides consistent error handling across all Firebase/Google Identity Platform provider methods.
 *
 * References:
 * - Firebase Auth error codes: https://firebase.google.com/docs/auth/admin/errors
 * - Identity Platform error codes: https://cloud.google.com/identity-platform/docs/error-codes
 */

import {
  AuthenticationError,
  TokenValidationError,
  UserInfoRetrievalError,
  InvalidAuthProviderConfigError,
  AuthProviderConnectionError
} from '../errors';

/**
 * Firebase error response structure
 */
interface FirebaseErrorResponse {
  error?: {
    code?: number | string;
    message?: string;
    status?: number | string;
    details?: unknown[];
  };
  errorInfo?: {
    code?: string;
    message?: string;
  };
}

/**
 * HTTP status to error type mapping
 *
 * Note: AuthProviderConnectionError has a different signature (providerName, reason)
 * and is handled specially in fromHttpResponse
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
 * Firebase-specific error code to error type mapping
 *
 * Reference: https://firebase.google.com/docs/auth/admin/errors
 */
const FIREBASE_ERROR_MAP: Record<string, new (message: string) => Error> = {
  // Authentication errors
  'auth/invalid-credential': AuthenticationError,
  'auth/user-not-found': UserInfoRetrievalError,
  'auth/invalid-password': AuthenticationError,
  'auth/email-already-exists': AuthenticationError,
  'auth/invalid-email': InvalidAuthProviderConfigError,
  'auth/user-disabled': AuthenticationError,
  'auth/user-mismatch': AuthenticationError,
  'auth/account-exists-with-different-credential': AuthenticationError,
  'auth/credential-already-in-use': AuthenticationError,
  'auth/invalid-verification-code': AuthenticationError,
  'auth/invalid-verification-id': AuthenticationError,
  'auth/missing-verification-code': AuthenticationError,
  'auth/missing-verification-id': AuthenticationError,
  'auth/phone-number-already-exists': AuthenticationError,
  'auth/invalid-phone-number': InvalidAuthProviderConfigError,
  'auth/missing-phone-number': InvalidAuthProviderConfigError,
  'auth/quota-exceeded': TokenValidationError,

  // Token errors
  'auth/invalid-id-token': TokenValidationError,
  'auth/invalid-refresh-token': TokenValidationError,
  'auth/expired-refresh-token': TokenValidationError,
  'auth/invalid-session-cookie': TokenValidationError,
  'auth/expired-session-cookie': TokenValidationError,
  'auth/invalid-custom-token': TokenValidationError,
  'auth/session-cookie-expired': TokenValidationError,
  'auth/session-cookie-revoked': TokenValidationError,
  'auth/invalid-token': TokenValidationError,
  'auth/token-expired': TokenValidationError,
  'auth/recent-login-required': TokenValidationError,
  'auth/uid-already-exists': AuthenticationError,

  // Authorization errors
  'auth/insufficient-permission': AuthenticationError,
  'auth/unauthorized-domain': InvalidAuthProviderConfigError,
  'auth/operation-not-allowed': InvalidAuthProviderConfigError,
  'auth/id-token-revoked': TokenValidationError,
  'auth/refresh-token-revoked': TokenValidationError,

  // Configuration errors
  'auth/invalid-api-key': InvalidAuthProviderConfigError,
  'auth/invalid-project-id': InvalidAuthProviderConfigError,
  'auth/invalid-app-id': InvalidAuthProviderConfigError,
  'auth/invalid-provider-id': InvalidAuthProviderConfigError,
  'auth/invalid-oauth-client-id': InvalidAuthProviderConfigError,
  'auth/invalid-oauth-provider': InvalidAuthProviderConfigError,
  'auth/missing-android-pkg-name': InvalidAuthProviderConfigError,
  'auth/missing-ios-bundle-id': InvalidAuthProviderConfigError,
  'auth/missing-app-credential': InvalidAuthProviderConfigError,
  'auth/invalid-continue-uri': InvalidAuthProviderConfigError,
  'auth/missing-continue-uri': InvalidAuthProviderConfigError,
  'auth/missing-or-invalid-nonce': InvalidAuthProviderConfigError,
  'auth/invalid-dynamic-link-domain': InvalidAuthProviderConfigError,
  'auth/invalid-persistence-type': InvalidAuthProviderConfigError,
  'auth/unsupported-persistence-type': InvalidAuthProviderConfigError,
  'auth/invalid-recipient-email': InvalidAuthProviderConfigError,

  // Network/Server errors
  'auth/network-request-failed': AuthProviderConnectionError,
  'auth/too-many-requests': TokenValidationError,
  'auth/web-storage-unsupported': InvalidAuthProviderConfigError,
  'auth/timeout': AuthProviderConnectionError,
  'auth/internal-error': AuthProviderConnectionError,
  'auth/unknown-error': AuthProviderConnectionError,

  // Tenant-specific errors
  'auth/tenant-id-not-found': UserInfoRetrievalError,
  'auth/invalid-tenant-id': InvalidAuthProviderConfigError,
  'auth/tenant-id-mismatch': AuthenticationError
};

/**
 * Firebase error mapper class
 */
export class FirebaseErrorMapper {
  /**
   * Map Firebase Auth error to application error
   *
   * @param error - Firebase error object
   * @param context - Context information for error message
   * @returns Mapped error
   */
  static fromFirebaseError(
    error: unknown,
    context: string
  ):
    | AuthenticationError
    | TokenValidationError
    | UserInfoRetrievalError
    | InvalidAuthProviderConfigError
    | AuthProviderConnectionError {
    // Extract error code from various Firebase error formats
    let errorCode: string | undefined;
    let errorMessage: string | undefined;

    if (this.isFirebaseError(error)) {
      errorCode = error.code;
      errorMessage = error.message;
    } else if (this.isFirebaseErrorResponse(error)) {
      errorCode =
        error.errorInfo?.code ||
        (typeof error.error?.code === 'string' ? error.error.code : undefined);
      errorMessage = error.errorInfo?.message || error.error?.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
      // Try to extract error code from message
      const match = errorMessage.match(/\[auth\/([^\]]+)\]/);
      if (match) {
        errorCode = `auth/${match[1]}`;
      }
    }

    // Try Firebase-specific error code mapping
    if (errorCode && errorCode in FIREBASE_ERROR_MAP) {
      const ErrorClass = FIREBASE_ERROR_MAP[errorCode];
      if (!ErrorClass) {
        throw new Error(`Error class not found for Firebase error code: ${errorCode}`);
      }
      const message = errorMessage ?? `${context}: ${errorCode}`;
      return new ErrorClass(message) as
        | AuthenticationError
        | TokenValidationError
        | UserInfoRetrievalError
        | InvalidAuthProviderConfigError
        | AuthProviderConnectionError;
    }

    // Fall back to generic authentication error
    const message = errorMessage ?? `${context}: Unknown Firebase error`;
    return new AuthenticationError(message);
  }

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
    | InvalidAuthProviderConfigError
    | AuthProviderConnectionError {
    const errorBody = body as FirebaseErrorResponse;
    const errorDescription = errorBody.error?.message ?? errorBody.errorInfo?.message;

    // Handle connection errors (500, 502, 503, 504) separately
    if (status >= 500) {
      return new AuthProviderConnectionError(
        'firebase',
        errorDescription ?? `${context}: ${status} ${this.getStatusText(status)}`
      ) as
        | AuthenticationError
        | TokenValidationError
        | UserInfoRetrievalError
        | InvalidAuthProviderConfigError
        | AuthProviderConnectionError;
    }

    // Use HTTP status code mapping for other errors
    const ErrorClass = HTTP_STATUS_MAP[status] ?? InvalidAuthProviderConfigError;
    const message = errorDescription ?? `${context}: ${status} ${this.getStatusText(status)}`;

    return new ErrorClass(message) as
      | AuthenticationError
      | TokenValidationError
      | UserInfoRetrievalError
      | InvalidAuthProviderConfigError
      | AuthProviderConnectionError;
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
    return new AuthProviderConnectionError('firebase', `${context}: ${message}`);
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
      return new AuthProviderConnectionError('firebase', `${context}: Request timeout`);
    }

    if (error instanceof Error) {
      // Other fetch-related errors
      return new AuthProviderConnectionError('firebase', `${context}: ${error.message}`);
    }

    // Unknown error type
    return new AuthProviderConnectionError('firebase', `${context}: ${String(error)}`);
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

  /**
   * Type guard for Firebase error object
   *
   * @param error - Value to check
   * @returns True if error is a Firebase error object
   */
  private static isFirebaseError(error: unknown): error is { code: string; message: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      'message' in error &&
      typeof error.message === 'string'
    );
  }

  /**
   * Type guard for Firebase error response
   *
   * @param error - Value to check
   * @returns True if error is a Firebase error response
   */
  private static isFirebaseErrorResponse(error: unknown): error is FirebaseErrorResponse {
    return (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object'
    );
  }
}

/**
 * Helper function to map Firebase errors
 *
 * Convenience wrapper for FirebaseErrorMapper.fromFirebaseError
 *
 * @param error - Firebase error
 * @param context - Context information
 * @returns Mapped error
 */
export function mapFirebaseError(
  error: unknown,
  context: string
):
  | AuthenticationError
  | TokenValidationError
  | UserInfoRetrievalError
  | InvalidAuthProviderConfigError
  | AuthProviderConnectionError {
  return FirebaseErrorMapper.fromFirebaseError(error, context);
}

/**
 * Helper function to map Firebase HTTP errors
 *
 * Convenience wrapper for FirebaseErrorMapper.fromHttpResponse
 *
 * @param status - HTTP status code
 * @param body - Response body
 * @param context - Context information
 * @returns Mapped error
 */
export function mapFirebaseHttpError(
  status: number,
  body: unknown,
  context: string
):
  | AuthenticationError
  | TokenValidationError
  | UserInfoRetrievalError
  | InvalidAuthProviderConfigError
  | AuthProviderConnectionError {
  return FirebaseErrorMapper.fromHttpResponse(status, body, context);
}

/**
 * Helper function to map Firebase fetch errors
 *
 * Convenience wrapper for FirebaseErrorMapper.fromFetchError
 *
 * @param error - Fetch error
 * @param context - Context information
 * @returns Mapped error
 */
export function mapFirebaseFetchError(error: Error | unknown, context: string): Error {
  return FirebaseErrorMapper.fromFetchError(error, context);
}
