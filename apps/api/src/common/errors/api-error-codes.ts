/**
 * API Error Codes Registry
 *
 * API-specific error codes with HTTP status mappings.
 * These codes are registered with the generic errors package but
 * defined here to keep API-specific concerns within the API app.
 *
 * Error Code Pattern: API_XXX
 * - API_001-020: General API errors
 *
 * @packageDocumentation
 */

/**
 * API Error Definition
 *
 * Each error code includes:
 * - code: Unique error code identifier (e.g., API_001)
 * - httpStatus: HTTP status code for API responses
 * - message: Default error message (supports parameter interpolation with {param} syntax)
 * - parameters: Optional array of expected parameters with validation
 */
export interface ApiErrorDefinition {
  /** Unique error code identifier */
  readonly code: string;
  /** HTTP status code for API responses */
  readonly httpStatus: number;
  /** Default error message template (supports {param} interpolation) */
  readonly message: string;
  /** Expected parameters for message interpolation */
  readonly parameters?: readonly {
    /** Parameter name */
    readonly name: string;
    /** Whether the parameter is required */
    readonly required: boolean;
    /** Parameter type for validation */
    readonly type: ParameterType;
  }[];
}

/** Parameter type enum for validation */
const enum ParameterType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Date = 'date',
  Object = 'object'
}

/**
 * API Error Codes Registry
 *
 * Complete registry of API-specific error codes with their HTTP status
 * mappings and default messages.
 *
 * HTTP Status Categories:
 * - 400: Bad Request (client error, invalid input)
 * - 401: Unauthorized (authentication required)
 * - 404: Not Found (resource doesn't exist)
 * - 408: Request Timeout
 * - 409: Conflict (concurrent modification)
 * - 413: Payload Too Large
 * - 429: Too Many Requests (rate limiting)
 * - 500: Internal Server Error
 * - 503: Service Unavailable
 */
export const API_ERROR_CODES: Record<string, ApiErrorDefinition> = {
  /**
   * API_001: Tenant context missing
   *
   * Raised when a request requires tenant context but none was provided.
   * Typically when x-tenant-id header is missing.
   *
   * HTTP Status: 400 Bad Request
   * Required Parameters: none
   */
  API_001: {
    code: 'API_001',
    httpStatus: 400,
    message: 'Tenant context is required for this request',
    parameters: []
  },

  /**
   * API_002: Tenant context invalid
   *
   * Raised when the provided tenant context is invalid or malformed.
   * Typically when x-tenant-id header has invalid format.
   *
   * HTTP Status: 400 Bad Request
   * Required Parameters: none
   */
  API_002: {
    code: 'API_002',
    httpStatus: 400,
    message: 'Invalid tenant context provided',
    parameters: []
  },

  /**
   * API_003: API version not found
   *
   * Raised when the requested API version does not exist or is not supported.
   *
   * HTTP Status: 404 Not Found
   * Optional Parameters:
   * - version: The requested API version (string)
   */
  API_003: {
    code: 'API_003',
    httpStatus: 404,
    message: 'API version {version} not found',
    parameters: [{ name: 'version', required: false, type: ParameterType.String }]
  },

  /**
   * API_004: API version deprecated
   *
   * Raised when the requested API version is deprecated and should not be used.
   *
   * HTTP Status: 400 Bad Request
   * Optional Parameters:
   * - version: The deprecated API version (string)
   * - sunsetDate: Date when version will be removed (string)
   */
  API_004: {
    code: 'API_004',
    httpStatus: 400,
    message: 'API version {version} is deprecated and will be sunset on {sunsetDate}',
    parameters: [
      { name: 'version', required: false, type: ParameterType.String },
      { name: 'sunsetDate', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_005: Rate limit exceeded
   *
   * Raised when the client has exceeded the allowed rate limit.
   *
   * HTTP Status: 429 Too Many Requests
   * Optional Parameters:
   * - limit: Rate limit threshold (number)
   * - window: Time window in seconds (number)
   * - retryAfter: Seconds until client can retry (number)
   */
  API_005: {
    code: 'API_005',
    httpStatus: 429,
    message:
      'Rate limit exceeded. Maximum {limit} requests per {window} seconds. Retry after {retryAfter} seconds',
    parameters: [
      { name: 'limit', required: false, type: ParameterType.Number },
      { name: 'window', required: false, type: ParameterType.Number },
      { name: 'retryAfter', required: false, type: ParameterType.Number }
    ]
  },

  /**
   * API_006: Request validation failed
   *
   * Raised when request validation fails for one or more fields.
   *
   * HTTP Status: 400 Bad Request
   * Optional Parameters:
   * - field: The field that failed validation (string)
   * - constraint: The validation constraint that failed (string)
   */
  API_006: {
    code: 'API_006',
    httpStatus: 400,
    message: 'Request validation failed for field {field}: {constraint}',
    parameters: [
      { name: 'field', required: false, type: ParameterType.String },
      { name: 'constraint', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_007: Invalid query parameter
   *
   * Raised when a query parameter has an invalid value or format.
   *
   * HTTP Status: 400 Bad Request
   * Required Parameters:
   * - param: The parameter name (string)
   * Optional Parameters:
   * - value: The invalid value provided (string)
   */
  API_007: {
    code: 'API_007',
    httpStatus: 400,
    message: 'Invalid query parameter {param}: {value}',
    parameters: [
      { name: 'param', required: true, type: ParameterType.String },
      { name: 'value', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_008: Missing required header
   *
   * Raised when a required HTTP header is missing from the request.
   *
   * HTTP Status: 400 Bad Request
   * Required Parameters:
   * - header: The missing header name (string)
   */
  API_008: {
    code: 'API_008',
    httpStatus: 400,
    message: 'Missing required header: {header}',
    parameters: [{ name: 'header', required: true, type: ParameterType.String }]
  },

  /**
   * API_009: Invalid request body format
   *
   * Raised when the request body is malformed or cannot be parsed.
   *
   * HTTP Status: 400 Bad Request
   * Optional Parameters:
   * - format: Expected format (e.g., JSON) (string)
   */
  API_009: {
    code: 'API_009',
    httpStatus: 400,
    message: 'Invalid request body format. Expected {format}',
    parameters: [{ name: 'format', required: false, type: ParameterType.String }]
  },

  /**
   * API_010: Feature not enabled
   *
   * Raised when attempting to access a feature that is not enabled
   * for the current tenant or application.
   *
   * HTTP Status: 503 Service Unavailable
   * Required Parameters:
   * - feature: The feature name (string)
   */
  API_010: {
    code: 'API_010',
    httpStatus: 503,
    message: 'Feature {feature} is not enabled',
    parameters: [{ name: 'feature', required: true, type: ParameterType.String }]
  },

  /**
   * API_011: Service temporarily unavailable
   *
   * Raised when a required service is temporarily unavailable.
   *
   * HTTP Status: 503 Service Unavailable
   * Required Parameters:
   * - service: The service name (string)
   * Optional Parameters:
   * - retryAfter: Seconds until service may be available (number)
   */
  API_011: {
    code: 'API_011',
    httpStatus: 503,
    message: 'Service {service} is temporarily unavailable. Retry after {retryAfter} seconds',
    parameters: [
      { name: 'service', required: true, type: ParameterType.String },
      { name: 'retryAfter', required: false, type: ParameterType.Number }
    ]
  },

  /**
   * API_012: Configuration error
   *
   * Raised when there is a configuration error preventing the operation.
   * This is typically a server-side misconfiguration.
   *
   * HTTP Status: 500 Internal Server Error
   * Optional Parameters:
   * - setting: The configuration setting (string)
   */
  API_012: {
    code: 'API_012',
    httpStatus: 500,
    message: 'Configuration error: {setting}',
    parameters: [{ name: 'setting', required: false, type: ParameterType.String }]
  },

  /**
   * API_013: Invalid API key
   *
   * Raised when an API key is invalid or not recognized.
   *
   * HTTP Status: 401 Unauthorized
   * Optional Parameters:
   * - keyId: The API key identifier (string)
   */
  API_013: {
    code: 'API_013',
    httpStatus: 401,
    message: 'Invalid API key: {keyId}',
    parameters: [{ name: 'keyId', required: false, type: ParameterType.String }]
  },

  /**
   * API_014: API key expired
   *
   * Raised when an API key has expired and can no longer be used.
   *
   * HTTP Status: 401 Unauthorized
   * Optional Parameters:
   * - keyId: The API key identifier (string)
   * - expiredAt: Expiration date (string)
   */
  API_014: {
    code: 'API_014',
    httpStatus: 401,
    message: 'API key {keyId} expired on {expiredAt}',
    parameters: [
      { name: 'keyId', required: false, type: ParameterType.String },
      { name: 'expiredAt', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_015: Webhook delivery failed
   *
   * Raised when a webhook delivery fails after all retries.
   *
   * HTTP Status: 500 Internal Server Error
   * Required Parameters:
   * - webhookUrl: The webhook URL (string)
   * Optional Parameters:
   * - attempt: Delivery attempt number (number)
   * - reason: Failure reason (string)
   */
  API_015: {
    code: 'API_015',
    httpStatus: 500,
    message: 'Webhook delivery failed to {webhookUrl} after {attempt} attempts: {reason}',
    parameters: [
      { name: 'webhookUrl', required: true, type: ParameterType.String },
      { name: 'attempt', required: false, type: ParameterType.Number },
      { name: 'reason', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_016: Batch request too large
   *
   * Raised when a batch request exceeds the maximum allowed size.
   *
   * HTTP Status: 413 Payload Too Large
   * Required Parameters:
   * - maxSize: Maximum allowed size (number)
   * Optional Parameters:
   * - actualSize: Actual request size (number)
   * - unit: Size unit (e.g., MB, items) (string)
   */
  API_016: {
    code: 'API_016',
    httpStatus: 413,
    message: 'Batch request too large. Maximum {maxSize} {unit}, got {actualSize} {unit}',
    parameters: [
      { name: 'maxSize', required: true, type: ParameterType.Number },
      { name: 'actualSize', required: false, type: ParameterType.Number },
      { name: 'unit', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_017: Request timeout
   *
   * Raised when a request takes longer than the allowed timeout.
   *
   * HTTP Status: 408 Request Timeout
   * Optional Parameters:
   * - timeout: Timeout duration in seconds (number)
   */
  API_017: {
    code: 'API_017',
    httpStatus: 408,
    message: 'Request timeout after {timeout} seconds',
    parameters: [{ name: 'timeout', required: false, type: ParameterType.Number }]
  },

  /**
   * API_018: Invalid pagination parameters
   *
   * Raised when pagination parameters are invalid.
   *
   * HTTP Status: 400 Bad Request
   * Optional Parameters:
   * - page: Invalid page number (number)
   * - pageSize: Invalid page size (number)
   * - maxPageSize: Maximum allowed page size (number)
   */
  API_018: {
    code: 'API_018',
    httpStatus: 400,
    message:
      'Invalid pagination parameters. Page: {page}, PageSize: {pageSize}. Maximum page size: {maxPageSize}',
    parameters: [
      { name: 'page', required: false, type: ParameterType.Number },
      { name: 'pageSize', required: false, type: ParameterType.Number },
      { name: 'maxPageSize', required: false, type: ParameterType.Number }
    ]
  },

  /**
   * API_019: Invalid sort parameters
   *
   * Raised when sort parameters are invalid or refer to non-existent fields.
   *
   * HTTP Status: 400 Bad Request
   * Optional Parameters:
   * - field: Invalid sort field (string)
   * - direction: Invalid sort direction (string)
   */
  API_019: {
    code: 'API_019',
    httpStatus: 400,
    message: 'Invalid sort parameters. Field: {field}, Direction: {direction}',
    parameters: [
      { name: 'field', required: false, type: ParameterType.String },
      { name: 'direction', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_020: Concurrent modification conflict
   *
   * Raised when attempting to update a resource that has been modified
   * by another process (optimistic locking failure).
   *
   * HTTP Status: 409 Conflict
   * Optional Parameters:
   * - resource: The resource type (string)
   * - id: The resource identifier (string)
   */
  API_020: {
    code: 'API_020',
    httpStatus: 409,
    message:
      'Concurrent modification conflict for {resource} {id}. The resource was modified by another process',
    parameters: [
      { name: 'resource', required: false, type: ParameterType.String },
      { name: 'id', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_021: Tenant not found
   *
   * Raised when the specified tenant does not exist or cannot be accessed.
   *
   * HTTP Status: 404 Not Found
   * Required Parameters:
   * - tenantId: The tenant ID (string)
   */
  API_021: {
    code: 'API_021',
    httpStatus: 404,
    message: 'Tenant with ID {tenantId} not found',
    parameters: [{ name: 'tenantId', required: true, type: ParameterType.String }]
  },

  /**
   * API_022: Tenant suspended
   *
   * Raised when the specified tenant is suspended and cannot be accessed.
   *
   * HTTP Status: 403 Forbidden
   * Required Parameters:
   * - tenantId: The tenant ID (string)
   */
  API_022: {
    code: 'API_022',
    httpStatus: 403,
    message: 'Tenant with ID {tenantId} is suspended and cannot be accessed',
    parameters: [{ name: 'tenantId', required: true, type: ParameterType.String }]
  },

  /**
   * API_023: Tenant ID invalid format
   *
   * Raised when the tenant ID format is invalid.
   *
   * HTTP Status: 400 Bad Request
   * Required Parameters:
   * - tenantId: The tenant ID (string)
   * Optional Parameters:
   * - reason: The reason for invalid format (string)
   */
  API_023: {
    code: 'API_023',
    httpStatus: 400,
    message: 'Tenant ID {tenantId} has invalid format: {reason}',
    parameters: [
      { name: 'tenantId', required: true, type: ParameterType.String },
      { name: 'reason', required: false, type: ParameterType.String }
    ]
  },

  /**
   * API_024: Endpoint not found
   *
   * Raised when the requested API endpoint does not exist.
   *
   * HTTP Status: 404 Not Found
   * Required Parameters: none
   */
  API_024: {
    code: 'API_024',
    httpStatus: 404,
    message: 'Requested endpoint was not found',
    parameters: []
  }
};

/**
 * Type-safe error code union type
 *
 * Extracts all error code strings from the registry for type safety.
 */
export type ApiErrorCode = keyof typeof API_ERROR_CODES;

/**
 * Get API error definition by code
 *
 * @param code - The error code (e.g., 'API_001')
 * @returns The error definition or undefined if not found
 *
 * @example
 * ```ts
 * const def = getApiErrorDefinition('API_001');
 * console.log(def.httpStatus); // 400
 * ```
 */
export function getApiErrorDefinition(code: string): ApiErrorDefinition | undefined {
  return API_ERROR_CODES[code];
}

/**
 * Check if a code is a valid API error code
 *
 * @param code - The code to check
 * @returns True if the code exists in the registry
 *
 * @example
 * ```ts
 * if (isApiErrorCode('API_001')) {
 *   // Handle API-specific error
 * }
 * ```
 */
export function isApiErrorCode(code: string): code is ApiErrorCode {
  return code in API_ERROR_CODES;
}
