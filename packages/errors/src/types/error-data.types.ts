/**
 * Error data types for unified response patterns
 *
 * These types enable consistent error responses across frameworks
 * (NestJS, Next.js/tRPC) by using the BaseResponseDto pattern.
 */

/**
 * Error severity levels (for error responses)
 */
export const enum ResponseErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Error categories (for error responses)
 */
export const enum ResponseErrorCategory {
  VALIDATION = 'VALIDATION',
  AUTH = 'AUTH',
  AUTHORIZATION = 'AUTHORIZATION',
  USER = 'USER',
  DATABASE = 'DATABASE',
  BUSINESS = 'BUSINESS',
  EXTERNAL = 'EXTERNAL',
  FILE = 'FILE',
  SYSTEM = 'SYSTEM',
  AGGREGATED = 'AGGREGATED'
}

/**
 * Core error response data structure
 *
 * Used in BaseResponseDto<ErrorResponseData> for unified error responses
 */
export interface ErrorResponseData {
  /** Error code (e.g., "VAL_001", "USER_001") */
  code: string;
  /** Original error message (untranslated) */
  message: string;
  /** Translated error message (in requested locale) */
  translated: string;
  /** Translation key for i18n lookup (e.g., "errors.validation.required") */
  translationKey?: string;
  /** Interpolation parameters for translation */
  parameters?: Readonly<Record<string, unknown>>;
  /** Additional flexible properties (e.g., field, minLength, etc.) */
  [key: string]: unknown;
}

/**
 * Error response metadata included in response
 *
 * Provides debugging and context information for errors
 */
export interface ErrorResponseMetadata {
  /** Response timestamp */
  timestamp: string;
  /** Unique request ID for tracing */
  requestId?: string;
  /** Error-specific metadata */
  error: ResponseErrorMetadata;
}

/**
 * Error-specific metadata for responses
 *
 * Contains information about the error that occurred
 */
export interface ResponseErrorMetadata {
  /** Error category */
  category: ResponseErrorCategory;
  /** Error severity */
  severity: ResponseErrorSeverity;
  /** HTTP status code */
  httpStatus: number;
  /** Debug information (only in non-production) */
  debugInfo?: ResponseErrorDebugInfo;
  /** Detailed validation errors (if applicable) */
  errors?: string[];
  /** Stack trace (only in non-production) */
  stack?: string;
}

/**
 * Debug information for error responses
 *
 * Contains additional context for debugging
 */
export interface ResponseErrorDebugInfo {
  /** Request path */
  path?: string;
  /** Request method */
  method?: string;
  /** Additional error details */
  [key: string]: unknown;
}

/**
 * Type guard for ErrorResponseData
 *
 * @param value - Value to check
 * @returns True if value is ErrorResponseData
 */
export function isErrorResponseData(value: unknown): value is ErrorResponseData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const err = value as Record<string, unknown>;

  return (
    typeof err['code'] === 'string' &&
    typeof err['message'] === 'string' &&
    typeof err['translated'] === 'string'
  );
}

/**
 * Type guard for ErrorResponseMetadata
 *
 * @param value - Value to check
 * @returns True if value is ErrorResponseMetadata
 */
export function isErrorResponseMetadata(value: unknown): value is ErrorResponseMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const meta = value as Record<string, unknown>;

  return (
    typeof meta['timestamp'] === 'string' &&
    typeof meta['error'] === 'object' &&
    meta['error'] !== null &&
    typeof (meta['error'] as Record<string, unknown>)['category'] === 'string' &&
    typeof (meta['error'] as Record<string, unknown>)['severity'] === 'string' &&
    typeof (meta['error'] as Record<string, unknown>)['httpStatus'] === 'number'
  );
}

/**
 * Type guard for error response
 *
 * Checks if a response is an error response (has error field in metadata)
 *
 * @param response - BaseResponseDto to check
 * @returns True if response is an error response
 */
export function isErrorResponse(
  response: unknown
): response is BaseResponseDto<ErrorResponseData> & { metadata: ErrorResponseMetadata } {
  if (typeof response !== 'object' || response === null) {
    return false;
  }

  const resp = response as Record<string, unknown>;
  return (
    resp['data'] !== undefined &&
    typeof resp['data'] === 'object' &&
    resp['data'] !== null &&
    isErrorResponseData(resp['data']) &&
    resp['metadata'] !== undefined &&
    typeof resp['metadata'] === 'object' &&
    resp['metadata'] !== null &&
    'error' in resp['metadata'] &&
    isErrorResponseMetadata(resp['metadata'])
  );
}

/**
 * Base response DTO interface
 *
 * This matches the structure of the BaseResponseDto class
 */
export interface BaseResponseDto<T = unknown> {
  readonly data: T;
  readonly metadata?: ResponseMetadata;
}

/**
 * Response metadata interface
 */
export interface ResponseMetadata {
  timestamp?: string;
  version?: string;
  requestId?: string;
  error?: ResponseErrorMetadata;
}
