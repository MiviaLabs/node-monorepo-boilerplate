/**
 * Core type definitions for the Error Registry system.
 *
 * This module defines the TypeScript types and interfaces used throughout
 * the error handling package, ensuring type safety and consistency.
 */

/**
 * Error severity levels for categorizing errors
 */
export enum ErrorSeverity {
  /** Low severity - informational, does not block operation */
  LOW = 'LOW',

  /** Medium severity - warning, operation may continue */
  MEDIUM = 'MEDIUM',

  /** High severity - error, operation cannot continue */
  HIGH = 'HIGH',

  /** Critical severity - system failure, requires immediate attention */
  CRITICAL = 'CRITICAL'
}

/**
 * Error type categories for grouping errors by domain
 */
export enum ErrorType {
  /** User-related errors (USER_001-099) */
  USER = 'USER',

  /** Authentication/authorization errors (AUTH_001-099) */
  AUTH = 'AUTH',

  /** Validation errors (VAL_001-099) */
  VALIDATION = 'VALIDATION',

  /** Database errors (DB_001-099) */
  DATABASE = 'DATABASE',

  /** Business logic errors (BIZ_001-099) */
  BUSINESS = 'BUSINESS',

  /** External service errors (EXT_001-099) */
  EXTERNAL = 'EXTERNAL',

  /** File operation errors (FILE_001-099) */
  FILE = 'FILE',

  /** System errors (SYS_001-099) */
  SYSTEM = 'SYSTEM'
}

/**
 * HTTP status codes for error responses
 */
export type HttpStatusCode =
  | 400 // Bad Request
  | 401 // Unauthorized
  | 403 // Forbidden
  | 404 // Not Found
  | 409 // Conflict
  | 422 // Unprocessable Entity
  | 429 // Too Many Requests
  | 500 // Internal Server Error
  | 502 // Bad Gateway
  | 503 // Service Unavailable
  | 504 // Gateway Timeout
  | 507; // Insufficient Storage

/**
 * Parameter type for error message interpolation
 */
export enum ErrorParameterType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  OBJECT = 'object'
}

/**
 * Parameter definition for error message interpolation
 *
 * @example
 * ```ts
 * const param: ErrorParameter = {
 *   name: 'userId',
 *   type: ErrorParameterType.STRING,
 *   required: true,
 *   description: 'ID of the user'
 * };
 * ```
 */
export interface ErrorParameter {
  /** Parameter name for interpolation */
  name: string;

  /** Parameter type for validation */
  type: ErrorParameterType;

  /** Whether this parameter is required (cannot be undefined) */
  required: boolean;

  /** Human-readable description of the parameter */
  description?: string;

  /** Default value if parameter is optional and not provided */
  defaultValue?: unknown;
}

/**
 * Error definition in the registry
 *
 * Each error code has a complete definition including metadata,
 * HTTP status, parameters, and translations.
 *
 * @example
 * ```ts
 * const errorDef: ErrorDefinition = {
 *   code: 'USER_001',
 *   type: ErrorType.USER,
 *   severity: ErrorSeverity.HIGH,
 *   httpStatus: 404,
 *   message: 'User with ID {userId} not found',
 *   parameters: [
 *     { name: 'userId', type: 'string', required: true, description: 'User ID' }
 *   ],
 *   description: 'User could not be found in the database',
 *   deprecationMessage: undefined
 * };
 * ```
 */
export interface ErrorDefinition {
  /** Unique error code (e.g., USER_001, AUTH_002) */
  code: string;

  /** Error category/domain */
  type: ErrorType;

  /** Error severity level */
  severity: ErrorSeverity;

  /** HTTP status code for API responses */
  httpStatus: HttpStatusCode;

  /** Error message template with parameter placeholders */
  message: string;

  /** Parameters for message interpolation */
  readonly parameters?: readonly ErrorParameter[];

  /** Detailed description of the error */
  description?: string;

  /** Deprecation warning if this error is deprecated */
  deprecationMessage?: string;

  /** Whether this error is safe to show to end users */
  safeForUser: boolean;

  /** Suggested resolution steps */
  resolution?: string;
}

/**
 * Error registry mapping error codes to their definitions
 */
export type ErrorRegistryMap = Readonly<Record<string, ErrorDefinition>>;

// [AUTO-GENERATED:ErrorCode] DO NOT EDIT BETWEEN MARKERS
/**
 * Union type of all registered error codes.
 * Auto-generated from ERROR_REGISTRY by generate-types.ts.
 *
 * Provides compile-time type safety and IDE autocomplete for error codes.
 * The `(string & {})` fallback allows dynamic error codes while
 * still providing autocomplete for known codes.
 */
export type ErrorCode =
  | 'AUTH_001'
  | 'AUTH_002'
  | 'AUTH_003'
  | 'AUTH_004'
  | 'AUTH_005'
  | 'AUTH_006'
  | 'AUTH_007'
  | 'AUTH_008'
  | 'AUTH_009'
  | 'AUTH_010'
  | 'BIZ_001'
  | 'BIZ_002'
  | 'BIZ_003'
  | 'BIZ_004'
  | 'BIZ_005'
  | 'BIZ_006'
  | 'BIZ_007'
  | 'BIZ_008'
  | 'DB_001'
  | 'DB_002'
  | 'DB_003'
  | 'DB_004'
  | 'DB_005'
  | 'DB_006'
  | 'DB_007'
  | 'DB_008'
  | 'DB_009'
  | 'DB_010'
  | 'EXT_001'
  | 'EXT_002'
  | 'EXT_003'
  | 'EXT_004'
  | 'EXT_005'
  | 'EXT_006'
  | 'EXT_007'
  | 'FILE_001'
  | 'FILE_002'
  | 'FILE_003'
  | 'FILE_004'
  | 'FILE_005'
  | 'FILE_006'
  | 'FILE_007'
  | 'FILE_008'
  | 'SYS_001'
  | 'SYS_002'
  | 'SYS_003'
  | 'SYS_004'
  | 'SYS_005'
  | 'SYS_006'
  | 'SYS_007'
  | 'SYS_008'
  | 'SYS_009'
  | 'SYS_010'
  | 'USER_001'
  | 'USER_002'
  | 'USER_003'
  | 'USER_004'
  | 'USER_005'
  | 'USER_006'
  | 'USER_007'
  | 'USER_008'
  | 'USER_009'
  | 'USER_010'
  | 'VAL_001'
  | 'VAL_002'
  | 'VAL_003'
  | 'VAL_004'
  | 'VAL_005'
  | 'VAL_006'
  | 'VAL_007'
  | 'VAL_008'
  | 'VAL_009'
  | (string & {}); // Allow arbitrary strings for extensibility
// [/AUTO-GENERATED:ErrorCode]

/**
 * Context information for error occurrences
 * This metadata is used for debugging and logging, NOT for user-facing messages
 */
export interface ErrorContext {
  /** Tenant ID for multi-tenancy */
  tenantId?: string;

  /** Organization ID for multi-tenancy */
  organizationId?: string;

  /** User ID who triggered the error */
  userId?: string;

  /** Unique request ID for tracing */
  requestId?: string;

  /** Timestamp when error occurred */
  timestamp?: string;

  /** Stack trace for debugging */
  stack?: string;

  /** Additional debugging context */
  [key: string]: unknown;
}

/**
 * Error metadata for internal debugging
 * Separate from parameters which are for message interpolation
 */
export interface ErrorMetadata extends ErrorContext {
  /** Source file where error was thrown */
  sourceFile?: string;

  /** Function/method where error was thrown */
  sourceFunction?: string;

  /** Line number where error was thrown */
  lineNumber?: number;

  /** Additional context-specific data */
  [key: string]: unknown;
}

/**
 * Error parameters for message interpolation
 * These are user-facing values that get inserted into error messages
 */
export type ErrorParameters = Readonly<Record<string, unknown>>;

/**
 * Transformed error data for API responses
 * Aligns with BaseResponseDto pattern
 */
export interface ErrorData {
  /** Error code */
  code: string;

  /** Translated error message with parameters interpolated */
  message: string;

  /** HTTP status code */
  statusCode: number;

  /** Error severity */
  severity: string;

  /** Error type/category */
  type: string;

  /** Request ID for tracing */
  requestId?: string;

  /** Timestamp when error occurred */
  timestamp: string;

  /** Additional error context (for debugging) */
  context?: Record<string, unknown>;

  /** Suggested resolution steps */
  resolution?: string;
}

/**
 * Type guard to check if an object is ErrorData
 *
 * @param obj - Object to check
 * @returns True if the object has the ErrorData structure
 */
export function isErrorData(obj: unknown): obj is ErrorData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    'message' in obj &&
    'statusCode' in obj
  );
}

/**
 * Type guard to check if a legacy response is an error response
 *
 * @deprecated Use isErrorResponse from error-data.types.ts instead for BaseResponseDto pattern
 * @param obj - Object to check
 * @returns True if the object has the legacy error response structure
 */
export function isLegacyErrorResponse(
  obj: unknown
): obj is { data: ErrorData; metadata?: Record<string, unknown> } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'data' in obj &&
    isErrorData((obj as { data: unknown }).data)
  );
}
