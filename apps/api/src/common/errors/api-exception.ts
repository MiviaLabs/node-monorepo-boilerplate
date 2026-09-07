/**
 * API Exception Class
 *
 * API-specific exception class that provides type-safe access to API error codes
 * and automatic HTTP status mapping.
 *
 * NOTE: ApiException does NOT extend RegisteredError because API error codes
 * are API-specific and don't exist in the central registry. This class provides
 * the same interface as RegisteredError but uses the API_ERROR_CODES registry.
 *
 * @packageDocumentation
 */

import { isRetryableStatus } from '../constants';
import {
  getApiErrorDefinition,
  isApiErrorCode,
  type ApiErrorCode,
  type ApiErrorDefinition
} from './api-error-codes';

import type { ErrorDefinition, ErrorParameters, ErrorMetadata } from '@package/errors';

/**
 * ApiException - API-specific exception
 *
 * This class provides API-specific error handling with proper HTTP status codes.
 *
 * Key features:
 * - Type-safe error codes (API_001-020)
 * - Automatic HTTP status mapping from error registry
 * - Parameter interpolation for message formatting
 * - Metadata for debugging (not shown to users)
 * - Full compatibility with NestJS exception filters
 */
export class ApiException extends Error {
  /**
   * Unique error code from the registry (e.g., API_001)
   */
  public readonly code: ApiErrorCode;

  /**
   * Error definition from the registry (immutable reference)
   */
  public readonly definition: ErrorDefinition;

  /**
   * Parameters for message interpolation (user-facing values)
   */
  public readonly parameters: ErrorParameters;

  /**
   * Additional metadata for debugging and logging
   */
  public readonly metadata: ErrorMetadata;

  /**
   * HTTP status code for API responses
   */
  public readonly httpStatus: number;

  /**
   * Timestamp when the error was created
   */
  public readonly timestamp: string;

  /**
   * Creates a new ApiException instance
   */
  constructor(code: ApiErrorCode, parameters: ErrorParameters = {}, metadata: ErrorMetadata = {}) {
    // Get error definition from API-specific registry
    const definition = getApiErrorDefinition(code);

    if (!definition) {
      throw new Error(`Error code "${code}" not found in API error registry`);
    }

    // Validate that the code is an API error code
    if (!isApiErrorCode(code)) {
      throw new Error(`Invalid API error code: ${String(code)}. Expected API_001-020`);
    }

    // Call parent Error constructor with interpolated message
    super(ApiException.interpolateMessage(definition.message, parameters));

    // Set error name to the code for easy identification
    this.name = code;

    // Set properties
    this.code = code;
    this.definition = definition as unknown as ErrorDefinition;
    this.parameters = { ...parameters };
    this.metadata = { ...metadata };
    this.httpStatus = definition.httpStatus;
    this.timestamp = new Date().toISOString();

    // Make properties read-only
    Object.defineProperty(this, 'code', { value: this.code, writable: false, configurable: false });
    Object.defineProperty(this, 'definition', {
      value: this.definition,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, 'parameters', {
      value: this.parameters,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, 'metadata', {
      value: this.metadata,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, 'httpStatus', {
      value: this.httpStatus,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, 'timestamp', {
      value: this.timestamp,
      writable: false,
      configurable: false
    });

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiException);
    }
  }

  /**
   * Interpolates parameters into the error message template
   */
  private static interpolateMessage(template: string, parameters: ErrorParameters): string {
    let message = template;

    for (const [key, value] of Object.entries(parameters)) {
      const placeholder = `{${key}}`;
      let valueStr: string;
      if (typeof value === 'object') {
        valueStr = JSON.stringify(value);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        valueStr = String(value);
      }
      message = message.replace(new RegExp(placeholder, 'g'), valueStr);
    }

    return message;
  }

  /**
   * Gets the HTTP status code for this error
   */
  getStatus(): number {
    return this.httpStatus;
  }

  /**
   * Gets the error definition from the registry
   */
  getDefinition(): ApiErrorDefinition | undefined {
    return getApiErrorDefinition(this.code);
  }

  /**
   * Converts the error to a plain object for serialization
   */
  toJSON(): {
    code: string;
    message: string;
    parameters: ErrorParameters;
    metadata: ErrorMetadata;
    httpStatus: number;
    timestamp: string;
    stack?: string | undefined;
  } {
    const result: {
      code: string;
      message: string;
      parameters: ErrorParameters;
      metadata: ErrorMetadata;
      httpStatus: number;
      timestamp: string;
      stack?: string;
    } = {
      code: this.code,
      message: this.message,
      parameters: this.parameters,
      metadata: this.metadata,
      httpStatus: this.httpStatus,
      timestamp: this.timestamp
    };

    if (this.stack !== undefined) {
      result.stack = this.stack;
    }

    return result;
  }

  /**
   * Checks if this is a client error (4xx status codes)
   */
  isClientError(): boolean {
    return this.httpStatus >= 400 && this.httpStatus < 500;
  }

  /**
   * Checks if this is a server error (5xx status codes)
   */
  isServerError(): boolean {
    return this.httpStatus >= 500 && this.httpStatus < 600;
  }

  /**
   * Checks if this error is retryable
   */
  isRetryable(): boolean {
    return isRetryableStatus(this.httpStatus);
  }

  // Static factory methods for each error code

  /**
   * Creates an exception for missing tenant context (API_001).
   *
   * @returns ApiException with code API_001 and HTTP status 400
   */
  static tenantContextMissing(): ApiException {
    return new ApiException('API_001');
  }

  /**
   * Creates an exception for invalid tenant context (API_002).
   *
   * @returns ApiException with code API_002 and HTTP status 400
   */
  static tenantContextInvalid(): ApiException {
    return new ApiException('API_002');
  }

  /**
   * Creates an exception for API version not found (API_003).
   *
   * @param version - The requested API version that was not found
   * @returns ApiException with code API_003 and HTTP status 404
   */
  static apiVersionNotFound(version: string): ApiException {
    return new ApiException('API_003', { version });
  }

  /**
   * Creates an exception for deprecated API version (API_004).
   *
   * @param version - The deprecated API version
   * @param sunsetDate - Date when the version will be removed
   * @returns ApiException with code API_004 and HTTP status 400
   */
  static apiVersionDeprecated(version: string, sunsetDate: string): ApiException {
    return new ApiException('API_004', { version, sunsetDate });
  }

  /**
   * Creates an exception for rate limit exceeded (API_005).
   *
   * @param limit - Maximum number of requests allowed
   * @param window - Time window in seconds
   * @param retryAfter - Seconds until client can retry
   * @returns ApiException with code API_005 and HTTP status 429
   */
  static rateLimitExceeded(limit: number, window: number, retryAfter: number): ApiException {
    return new ApiException('API_005', { limit, window, retryAfter });
  }

  /**
   * Creates an exception for request validation failure (API_006).
   *
   * @param field - The field that failed validation
   * @param constraint - The validation constraint that failed
   * @returns ApiException with code API_006 and HTTP status 400
   */
  static requestValidationFailed(field: string, constraint: string): ApiException {
    return new ApiException('API_006', { field, constraint });
  }

  /**
   * Creates an exception for invalid query parameter (API_007).
   *
   * @param param - The parameter name that is invalid
   * @param value - Optional invalid value provided
   * @returns ApiException with code API_007 and HTTP status 400
   */
  static invalidQueryParameter(param: string, value?: string): ApiException {
    return new ApiException('API_007', { param, value });
  }

  /**
   * Creates an exception for missing required header (API_008).
   *
   * @param header - The name of the missing required header
   * @returns ApiException with code API_008 and HTTP status 400
   */
  static missingRequiredHeader(header: string): ApiException {
    return new ApiException('API_008', { header });
  }

  /**
   * Creates an exception for invalid request body format (API_009).
   *
   * @param format - The expected format (e.g., 'JSON')
   * @returns ApiException with code API_009 and HTTP status 400
   */
  static invalidRequestBodyFormat(format: string): ApiException {
    return new ApiException('API_009', { format });
  }

  /**
   * Creates an exception for feature not enabled (API_010).
   *
   * @param feature - The name of the feature that is not enabled
   * @returns ApiException with code API_010 and HTTP status 503
   */
  static featureNotEnabled(feature: string): ApiException {
    return new ApiException('API_010', { feature });
  }

  /**
   * Creates an exception for service unavailable (API_011).
   *
   * @param service - The name of the unavailable service
   * @param retryAfter - Optional seconds until service may be available
   * @returns ApiException with code API_011 and HTTP status 503
   */
  static serviceUnavailable(service: string, retryAfter?: number): ApiException {
    return new ApiException('API_011', { service, retryAfter });
  }

  /**
   * Creates an exception for configuration error (API_012).
   *
   * @param setting - Optional name of the misconfigured setting
   * @returns ApiException with code API_012 and HTTP status 500
   */
  static configurationError(setting?: string): ApiException {
    return new ApiException('API_012', { setting });
  }

  /**
   * Creates an exception for invalid API key (API_013).
   *
   * @param keyId - Optional API key identifier
   * @returns ApiException with code API_013 and HTTP status 401
   */
  static invalidApiKey(keyId?: string): ApiException {
    return new ApiException('API_013', { keyId });
  }

  /**
   * Creates an exception for expired API key (API_014).
   *
   * @param keyId - Optional API key identifier
   * @param expiredAt - Optional expiration date string
   * @returns ApiException with code API_014 and HTTP status 401
   */
  static apiKeyExpired(keyId?: string, expiredAt?: string): ApiException {
    return new ApiException('API_014', { keyId, expiredAt });
  }

  /**
   * Creates an exception for webhook delivery failure (API_015).
   *
   * @param webhookUrl - The webhook URL that failed
   * @param attempt - Optional delivery attempt number
   * @param reason - Optional failure reason
   * @returns ApiException with code API_015 and HTTP status 500
   */
  static webhookDeliveryFailed(
    webhookUrl: string,
    attempt?: number,
    reason?: string
  ): ApiException {
    return new ApiException('API_015', { webhookUrl, attempt, reason });
  }

  /**
   * Creates an exception for batch request too large (API_016).
   *
   * @param maxSize - Maximum allowed size
   * @param actualSize - Optional actual request size
   * @param unit - Optional size unit (e.g., 'MB', 'items')
   * @returns ApiException with code API_016 and HTTP status 413
   */
  static batchRequestTooLarge(maxSize: number, actualSize?: number, unit?: string): ApiException {
    return new ApiException('API_016', { maxSize, actualSize, unit });
  }

  /**
   * Creates an exception for request timeout (API_017).
   *
   * @param timeout - Optional timeout duration in seconds
   * @returns ApiException with code API_017 and HTTP status 408
   */
  static requestTimeout(timeout?: number): ApiException {
    return new ApiException('API_017', { timeout });
  }

  /**
   * Creates an exception for invalid pagination parameters (API_018).
   *
   * @param page - Optional invalid page number
   * @param pageSize - Optional invalid page size
   * @param maxPageSize - Optional maximum allowed page size
   * @returns ApiException with code API_018 and HTTP status 400
   */
  static invalidPaginationParameters(
    page?: number,
    pageSize?: number,
    maxPageSize?: number
  ): ApiException {
    return new ApiException('API_018', { page, pageSize, maxPageSize });
  }

  /**
   * Creates an exception for invalid sort parameters (API_019).
   *
   * @param field - Optional invalid sort field
   * @param direction - Optional invalid sort direction
   * @returns ApiException with code API_019 and HTTP status 400
   */
  static invalidSortParameters(field?: string, direction?: string): ApiException {
    return new ApiException('API_019', { field, direction });
  }

  /**
   * Creates an exception for concurrent modification conflict (API_020).
   *
   * @param resource - Optional resource type
   * @param id - Optional resource identifier
   * @returns ApiException with code API_020 and HTTP status 409
   */
  static concurrentModificationConflict(resource?: string, id?: string): ApiException {
    return new ApiException('API_020', { resource, id });
  }

  /**
   * Creates an exception for tenant not found (API_021).
   *
   * @param tenantId - The tenant ID that was not found
   * @returns ApiException with code API_021 and HTTP status 404
   */
  static tenantNotFound(tenantId: string): ApiException {
    return new ApiException('API_021', { tenantId });
  }

  /**
   * Creates an exception for suspended tenant (API_022).
   *
   * @param tenantId - The suspended tenant ID
   * @returns ApiException with code API_022 and HTTP status 403
   */
  static tenantSuspended(tenantId: string): ApiException {
    return new ApiException('API_022', { tenantId });
  }

  /**
   * Creates an exception for invalid tenant ID format (API_023).
   *
   * @param tenantId - The invalid tenant ID
   * @param reason - Optional reason for invalid format
   * @returns ApiException with code API_023 and HTTP status 400
   */
  static tenantIdInvalidFormat(tenantId: string, reason?: string): ApiException {
    return new ApiException('API_023', { tenantId, reason });
  }
}
