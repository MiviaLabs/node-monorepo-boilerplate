/**
 * Application error code constants
 *
 * Error codes follow the format: {PREFIX}_{NUMBER} where:
 * - PREFIX identifies the error category/domain
 * - NUMBER is a sequential identifier within that category (001-999)
 *
 * Error code categories:
 * - AUTH_xxx: Authentication and authorization failures (login, tokens, permissions)
 * - VAL_xxx / VALIDATION_xxx: Input validation and data format errors
 * - DB_xxx: Database operations (connections, queries, constraints)
 * - API_xxx / EXT_xxx: External service communication failures
 * - USER_xxx: User-specific business logic errors
 * - ORG_xxx: Organization-specific business logic errors
 * - RESOURCE_xxx: Generic resource operation errors
 * - SYS_xxx: System-level infrastructure errors
 * - BIZ_xxx: General business rule violations
 * - FILE_xxx: File upload and storage errors
 *
 * These constants serve as reference values for error identification.
 * The primary error system uses `Errors.*` factory methods from `@package/errors`
 * which provide type-safe error creation with parameter interpolation.
 *
 * @see packages/errors/src/registry/definitions/ - Error definitions with messages and HTTP status codes
 * @see packages/errors/src/exceptions/errors.factory.ts - Type-safe error factory methods
 *
 * @example Using ERROR_CODES in exception filter
 * ```typescript
 * import { ERROR_CODES, HTTP_STATUS } from '@package/constants/errors';
 *
 * @Catch()
 * export class GlobalExceptionFilter implements ExceptionFilter {
 *   catch(exception: AppException, host: ArgumentsHost) {
 *     const response = host.switchToHttp().getResponse();
 *
 *     if (exception.code === ERROR_CODES.USER_NOT_FOUND) {
 *       return response.status(HTTP_STATUS.NOT_FOUND).json({
 *         code: exception.code,
 *         message: 'The requested user does not exist'
 *       });
 *     }
 *
 *     if (exception.code === ERROR_CODES.AUTH_TOKEN_EXPIRED) {
 *       return response.status(HTTP_STATUS.UNAUTHORIZED).json({
 *         code: exception.code,
 *         message: 'Session expired, please login again'
 *       });
 *     }
 *   }
 * }
 * ```
 *
 * @example Handling validation errors in service layer
 * ```typescript
 * import { ERROR_CODES } from '@package/constants/errors';
 *
 * async function handleUserOperation(result: OperationResult) {
 *   if (!result.success) {
 *     switch (result.error.code) {
 *       case ERROR_CODES.VALIDATION_REQUIRED_FIELD:
 *         logger.warn('Missing required field', { field: result.error.field });
 *         break;
 *       case ERROR_CODES.DB_CONSTRAINT_VIOLATION:
 *         logger.error('Database constraint failed', { constraint: result.error.constraint });
 *         break;
 *       case ERROR_CODES.API_RATE_LIMIT:
 *         await delay(result.error.retryAfter);
 *         return retry(result.operation);
 *     }
 *   }
 * }
 * ```
 *
 * @example For throwing errors - prefer Errors factory from @package/errors
 * ```typescript
 * import { Errors } from '@package/errors';
 * throw Errors.authinvalidEmailOr001({});
 * ```
 */

export const ERROR_CODES = {
  // ──────────────────────────────────────────────────────────────────────────
  // Authentication errors (AUTH_xxx)
  // Errors related to user identity verification, tokens, and access control
  // ──────────────────────────────────────────────────────────────────────────

  /** Login failed due to incorrect email or password combination */
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',

  /** JWT or session token has exceeded its validity period */
  AUTH_TOKEN_EXPIRED: 'AUTH_002',

  /** Token signature verification failed or token is malformed */
  AUTH_TOKEN_INVALID: 'AUTH_003',

  /** User lacks sufficient permissions for the requested operation */
  AUTH_UNAUTHORIZED: 'AUTH_004',

  /** Multi-tenant context header (X-Tenant-ID) missing from request */
  AUTH_TENANT_CONTEXT_NOT_SET: 'AUTH_005',

  // ──────────────────────────────────────────────────────────────────────────
  // Validation errors (VALIDATION_xxx)
  // Errors from input validation, schema parsing, or data format checks
  // ──────────────────────────────────────────────────────────────────────────

  /** Generic validation failure when input does not match schema */
  VALIDATION_FAILED: 'VALIDATION_001',

  /** Required field is missing from request payload */
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_002',

  /** Field value does not match expected format (email, UUID, URL, etc.) */
  VALIDATION_INVALID_FORMAT: 'VALIDATION_003',

  /** String length outside allowed min/max bounds */
  VALIDATION_INVALID_LENGTH: 'VALIDATION_004',

  // ──────────────────────────────────────────────────────────────────────────
  // Database errors (DB_xxx)
  // Errors from PostgreSQL operations via Drizzle ORM
  // ──────────────────────────────────────────────────────────────────────────

  /** Cannot establish connection to database server */
  DB_CONNECTION_ERROR: 'DB_001',

  /** SQL query execution failed (syntax error, timeout, etc.) */
  DB_QUERY_ERROR: 'DB_002',

  /** Unique, foreign key, or check constraint violation */
  DB_CONSTRAINT_VIOLATION: 'DB_003',

  /** SELECT query returned no rows when at least one was expected */
  DB_NOT_FOUND: 'DB_004',

  // ──────────────────────────────────────────────────────────────────────────
  // External service errors (API_xxx)
  // Errors from third-party API calls (payment providers, email services, etc.)
  // ──────────────────────────────────────────────────────────────────────────

  /** External service endpoint is not responding or returned 5xx */
  API_UNAVAILABLE: 'API_001',

  /** Request to external service exceeded timeout threshold */
  API_TIMEOUT: 'API_002',

  /** External service rate limit (429) exceeded */
  API_RATE_LIMIT: 'API_003',

  // ──────────────────────────────────────────────────────────────────────────
  // User domain errors (USER_xxx)
  // Business logic errors specific to user operations
  // ──────────────────────────────────────────────────────────────────────────

  /** User with specified ID does not exist in database */
  USER_NOT_FOUND: 'USER_001',

  /** Attempting to create user with email that already exists */
  USER_ALREADY_EXISTS: 'USER_002',

  /** User account is disabled, suspended, or deleted */
  USER_INACTIVE: 'USER_003',

  // ──────────────────────────────────────────────────────────────────────────
  // Organization domain errors (ORG_xxx)
  // Business logic errors specific to tenant/organization operations
  // ──────────────────────────────────────────────────────────────────────────

  /** Organization with specified ID does not exist */
  ORG_NOT_FOUND: 'ORG_001',

  /** Organization is suspended or deactivated */
  ORG_INACTIVE: 'ORG_002',

  /** Attempting to create organization with slug that already exists */
  ORG_ALREADY_EXISTS: 'ORG_003',

  // ──────────────────────────────────────────────────────────────────────────
  // Crypto errors (CRYPTO_xxx)
  // Cryptographic operations, key management, and encryption errors
  // ──────────────────────────────────────────────────────────────────────────

  /** Key rotation operation failed */
  CRYPTO_KEY_ROTATION_FAILED: 'CRYPTO_001',

  /** Failed to cancel key rotation operation */
  CRYPTO_KEY_ROTATION_CANCEL_FAILED: 'CRYPTO_002',

  /** Failed to resume key rotation operation */
  CRYPTO_KEY_ROTATION_RESUME_FAILED: 'CRYPTO_003',

  // ──────────────────────────────────────────────────────────────────────────
  // Generic resource errors (RESOURCE_xxx)
  // General-purpose errors for any entity type
  // ──────────────────────────────────────────────────────────────────────────

  /** Requested resource does not exist */
  RESOURCE_NOT_FOUND: 'RESOURCE_001',

  /** Attempting to create resource that already exists (conflict) */
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_002',

  /** Resource is locked by another operation or user */
  RESOURCE_LOCKED: 'RESOURCE_003'
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
