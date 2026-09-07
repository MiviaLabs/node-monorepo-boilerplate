/**
 * @package/constants
 *
 * Type-safe, immutable constants for the Node Monorepo Boilerplate. All constants
 * use `as const` assertions to enable TypeScript literal type inference, ensuring
 * compile-time safety and IDE autocompletion across the monorepo.
 *
 * ## Features
 *
 * - **Error Constants**: HTTP status codes ({@link HTTP_STATUS}), application error codes
 *   ({@link ERROR_CODES}), and error type classifications ({@link ERROR_TYPE})
 * - **Domain Constants**: User roles ({@link USER_ROLE}), organization types
 *   ({@link ORGANIZATION_TYPE}), entity statuses ({@link ENTITY_STATUS}), pagination
 *   defaults ({@link PAGINATION}), time durations ({@link TIME}), and system limits
 *   ({@link LIMITS})
 * - **Environment Constants**: Environment identifiers ({@link ENVIRONMENT}), feature
 *   flags ({@link FEATURE_FLAGS}), and supported regions ({@link REGIONS})
 * - **API Constants**: HTTP headers ({@link API_HEADERS}), MIME content types
 *   ({@link CONTENT_TYPES}), rate limiting values ({@link RATE_LIMITS}), and timeout
 *   configurations ({@link TIMEOUTS})
 *
 * ## Type Inference with `as const`
 *
 * All constants use `as const` to create readonly literal types:
 *
 * ```typescript
 * import { HTTP_STATUS, USER_ROLE, ENVIRONMENT } from '@package/constants';
 *
 * // TypeScript infers literal types, not just 'number' or 'string'
 * const status = HTTP_STATUS.OK;        // type: 200 (not number)
 * const role = USER_ROLE.ADMIN;         // type: 'admin' (not string)
 * const env = ENVIRONMENT.PRODUCTION;   // type: 'production' (not string)
 *
 * // Derive union types from constants
 * type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
 * // Result: 200 | 201 | 202 | 204 | 301 | 302 | 304 | 400 | 401 | ...
 *
 * type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
 * // Result: 'admin' | 'user' | 'guest'
 * ```
 *
 * ## Usage Examples
 *
 * ### Error Handling
 *
 * ```typescript
 * import { HTTP_STATUS, ERROR_CODES } from '@package/constants';
 *
 * // In test assertions
 * expect(response.status).toBe(HTTP_STATUS.CREATED);
 * expect(error.code).toBe(ERROR_CODES.USER_NOT_FOUND);
 *
 * // In error handling
 * if (response.status === HTTP_STATUS.UNAUTHORIZED) {
 *   // Redirect to login
 * }
 * ```
 *
 * ### Domain Configuration
 *
 * ```typescript
 * import { PAGINATION, TIME, USER_ROLE } from '@package/constants';
 *
 * // Pagination with type-safe defaults
 * const page = query.page ?? PAGINATION.DEFAULT_PAGE;      // 1
 * const limit = Math.min(query.limit, PAGINATION.MAX_LIMIT); // cap at 100
 *
 * // Time-based calculations (milliseconds)
 * const accessTokenExpiry = Date.now() + TIME.HOUR;
 * const refreshTokenExpiry = Date.now() + 7 * TIME.DAY;
 * const cacheTTL = TIME.MINUTE / 1000; // Convert to seconds for Redis
 *
 * // Role-based authorization
 * if (user.role === USER_ROLE.ADMIN) {
 *   // Grant admin privileges
 * }
 * ```
 *
 * ### Environment Detection
 *
 * ```typescript
 * import { ENVIRONMENT, FEATURE_FLAGS } from '@package/constants';
 *
 * // Environment-aware configuration
 * const isProduction = process.env.NODE_ENV === ENVIRONMENT.PRODUCTION;
 * const isDevelopment = process.env.NODE_ENV === ENVIRONMENT.DEVELOPMENT;
 *
 * // Feature flag checks
 * if (config.features[FEATURE_FLAGS.MULTI_TENANT]) {
 *   // Enable multi-tenancy features
 * }
 * ```
 *
 * ### API Request Configuration
 *
 * ```typescript
 * import { API_HEADERS, CONTENT_TYPES, TIMEOUTS } from '@package/constants';
 *
 * // HTTP request setup
 * const headers = {
 *   [API_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
 *   [API_HEADERS.X_TENANT_ID]: tenantId,
 *   [API_HEADERS.X_REQUEST_ID]: requestId,
 * };
 *
 * // Timeout configuration
 * const fetchOptions = {
 *   headers,
 *   signal: AbortSignal.timeout(TIMEOUTS.REQUEST),
 * };
 * ```
 *
 * @see {@link HTTP_STATUS} for HTTP response status codes
 * @see {@link ERROR_CODES} for application error code identifiers
 * @see {@link PAGINATION} for pagination defaults and limits
 * @see {@link TIME} for duration constants in milliseconds
 *
 * Related packages:
 * - `@package/types` - CQRS and entity type definitions
 * - `@package/schema` - Zod validation schemas using these constants
 *
 * @packageDocumentation
 */

// Error constants
export * from './errors';

// Domain constants
export * from './domain';

// Address type constants
export * from './address-types';

// Environment constants
export * from './environment';

// API constants
export * from './api';
