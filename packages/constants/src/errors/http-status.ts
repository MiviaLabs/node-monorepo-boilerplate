/**
 * HTTP status code constants
 *
 * Reference constants for HTTP response status codes as defined by RFC 7231
 * and related specifications. These constants serve as a type-safe alternative
 * to magic numbers when comparing or documenting expected HTTP responses.
 *
 * **Important:** In NestJS controllers and exception filters, prefer using
 * the `HttpStatus` enum from `@nestjs/common` which provides the same values
 * with better framework integration. These constants are useful for:
 * - Documentation and comments
 * - Test assertions
 * - Non-NestJS code (utilities, shared packages)
 *
 * HTTP status code categories:
 * - 1xx Informational: Request received, continuing process
 * - 2xx Success: Request successfully received, understood, and accepted
 * - 3xx Redirection: Further action needed to complete request
 * - 4xx Client Error: Request contains bad syntax or cannot be fulfilled
 * - 5xx Server Error: Server failed to fulfill valid request
 *
 * @see {@link https://tools.ietf.org/html/rfc7231} - HTTP/1.1 Semantics and Content
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Status} - MDN HTTP Status Codes
 *
 * @example Using HTTP_STATUS in response handling
 * ```typescript
 * import { HTTP_STATUS } from '@package/constants/errors';
 *
 * // Manual response construction (utilities, non-NestJS code)
 * function buildResponse(data: unknown, statusCode: number) {
 *   return {
 *     status: statusCode,
 *     success: statusCode >= HTTP_STATUS.OK && statusCode < HTTP_STATUS.BAD_REQUEST,
 *     data
 *   };
 * }
 *
 * // Success response
 * return buildResponse(user, HTTP_STATUS.CREATED);
 *
 * // Error response
 * return buildResponse({ error: 'Not found' }, HTTP_STATUS.NOT_FOUND);
 * ```
 *
 * @example HTTP status checks in middleware
 * ```typescript
 * import { HTTP_STATUS } from '@package/constants/errors';
 *
 * async function retryOnTransientError(fn: () => Promise<Response>) {
 *   const response = await fn();
 *
 *   // Retry on server errors (5xx)
 *   if (response.status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
 *     await delay(1000);
 *     return fn();
 *   }
 *
 *   // Handle rate limiting
 *   if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
 *     const retryAfter = response.headers.get('Retry-After');
 *     await delay(parseInt(retryAfter || '60') * 1000);
 *     return fn();
 *   }
 *
 *   return response;
 * }
 * ```
 *
 * @example Test assertions
 * ```typescript
 * import { HTTP_STATUS } from '@package/constants/errors';
 *
 * describe('UserController', () => {
 *   it('should return 201 when user is created', async () => {
 *     const response = await request(app).post('/users').send(validUserDto);
 *     expect(response.status).toBe(HTTP_STATUS.CREATED);
 *   });
 *
 *   it('should return 404 when user not found', async () => {
 *     const response = await request(app).get('/users/nonexistent');
 *     expect(response.status).toBe(HTTP_STATUS.NOT_FOUND);
 *   });
 * });
 * ```
 *
 * @example In NestJS - prefer HttpStatus from @nestjs/common
 * ```typescript
 * import { HttpStatus } from '@nestjs/common';
 * @HttpCode(HttpStatus.CREATED)
 * async create() { ... }
 * ```
 */

export const HTTP_STATUS = {
  // ──────────────────────────────────────────────────────────────────────────
  // 2xx Success
  // The request was successfully received, understood, and accepted
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * 200 OK
   *
   * Standard response for successful HTTP requests. The actual response
   * depends on the request method:
   * - GET: Resource returned in response body
   * - POST: Result of action returned in response body
   * - PUT/PATCH: Updated resource or confirmation
   */
  OK: 200,

  /**
   * 201 Created
   *
   * Request succeeded and a new resource was created. The response body
   * should contain the created resource. Use for POST requests that create
   * new entities (users, organizations, etc.).
   *
   * Common pattern: Return created resource with Location header pointing
   * to the new resource URL.
   */
  CREATED: 201,

  /**
   * 202 Accepted
   *
   * Request accepted for processing but not yet completed. Use for
   * async operations where the result will be available later.
   *
   * Common pattern: Return job ID or status URL for polling.
   */
  ACCEPTED: 202,

  /**
   * 204 No Content
   *
   * Request succeeded but no content to return. The response body is empty.
   * Use for DELETE operations or updates where returning the resource is
   * not needed.
   *
   * Common pattern: DELETE /users/:id returns 204 on success.
   */
  NO_CONTENT: 204,

  // ──────────────────────────────────────────────────────────────────────────
  // 3xx Redirection
  // Further action needed to complete the request
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * 301 Moved Permanently
   *
   * Resource has been permanently moved to a new URL. Clients should update
   * their bookmarks. Search engines will update their index.
   *
   * Use with Location header pointing to new URL.
   */
  MOVED_PERMANENTLY: 301,

  /**
   * 302 Found (Temporary Redirect)
   *
   * Resource temporarily at different URL. Client should continue using
   * the original URL for future requests.
   *
   * Common pattern: OAuth callback redirects, form submission redirects.
   */
  FOUND: 302,

  /**
   * 304 Not Modified
   *
   * Resource has not been modified since the version specified by
   * If-Modified-Since or If-None-Match headers. No body returned.
   *
   * Used for caching - client can use cached version.
   */
  NOT_MODIFIED: 304,

  // ──────────────────────────────────────────────────────────────────────────
  // 4xx Client Errors
  // The request contains bad syntax or cannot be fulfilled
  // Client should modify request before retrying
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * 400 Bad Request
   *
   * Server cannot process request due to client error (malformed syntax,
   * invalid request message framing, deceptive routing).
   *
   * Common causes: Invalid JSON, missing required fields, invalid data types.
   * Maps to: ValidationError
   */
  BAD_REQUEST: 400,

  /**
   * 401 Unauthorized
   *
   * Authentication required or authentication credentials invalid.
   * Despite the name, this is about authentication (identity), not
   * authorization (permissions).
   *
   * Common causes: Missing token, expired token, invalid credentials.
   * Maps to: AuthenticationError
   */
  UNAUTHORIZED: 401,

  /**
   * 403 Forbidden
   *
   * Server understood the request but refuses to authorize it.
   * Unlike 401, re-authenticating will not help - the user simply
   * doesn't have permission.
   *
   * Common causes: Insufficient role/permissions, IP blocked, cross-tenant access.
   * Maps to: AuthorizationError
   */
  FORBIDDEN: 403,

  /**
   * 404 Not Found
   *
   * Server cannot find the requested resource. May also be used to mask
   * 403 when the server doesn't want to reveal resource existence.
   *
   * Common causes: Invalid ID, deleted resource, wrong endpoint.
   * Maps to: NotFoundError
   */
  NOT_FOUND: 404,

  /**
   * 405 Method Not Allowed
   *
   * Request method (GET, POST, etc.) not supported for this resource.
   * Response must include Allow header listing valid methods.
   *
   * Example: DELETE /users (collection) when only DELETE /users/:id is allowed.
   */
  METHOD_NOT_ALLOWED: 405,

  /**
   * 409 Conflict
   *
   * Request conflicts with current state of the resource.
   *
   * Common causes: Duplicate email, optimistic lock failure, concurrent edit.
   * Maps to: ConflictError
   */
  CONFLICT: 409,

  /**
   * 422 Unprocessable Entity
   *
   * Request is well-formed but contains semantic errors or violates
   * business rules.
   *
   * Common causes: Business rule violation, invalid state transition,
   * entity relationship constraint.
   * Maps to: BusinessLogicError
   */
  UNPROCESSABLE_ENTITY: 422,

  /**
   * 429 Too Many Requests
   *
   * User has sent too many requests in a given time period (rate limiting).
   * Response should include Retry-After header.
   *
   * Common pattern: Return retry delay in response body and Retry-After header.
   */
  TOO_MANY_REQUESTS: 429,

  // ──────────────────────────────────────────────────────────────────────────
  // 5xx Server Errors
  // Server failed to fulfill a valid request
  // These errors may be transient and retryable
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * 500 Internal Server Error
   *
   * Generic server error when no more specific message is suitable.
   * Indicates unexpected condition that prevented request fulfillment.
   *
   * Should trigger alerts and investigation. Never expose internal details.
   * Maps to: InternalError
   */
  INTERNAL_SERVER_ERROR: 500,

  /**
   * 501 Not Implemented
   *
   * Server does not support functionality required to fulfill request.
   * Unlike 405, this indicates the method is recognized but not implemented.
   *
   * Use for planned but not-yet-implemented features.
   */
  NOT_IMPLEMENTED: 501,

  /**
   * 502 Bad Gateway
   *
   * Server acting as gateway received invalid response from upstream server.
   *
   * Common causes: Upstream service down, invalid upstream response.
   * Maps to: ExternalServiceError
   */
  BAD_GATEWAY: 502,

  /**
   * 503 Service Unavailable
   *
   * Server currently unable to handle request due to maintenance or overload.
   * Should include Retry-After header if possible.
   *
   * Common causes: Database down, maintenance mode, resource exhaustion.
   * Maps to: DatabaseError (when caused by DB issues)
   */
  SERVICE_UNAVAILABLE: 503,

  /**
   * 504 Gateway Timeout
   *
   * Server acting as gateway did not receive timely response from upstream.
   *
   * Common causes: Upstream service timeout, slow dependency.
   * Often retryable with exponential backoff.
   */
  GATEWAY_TIMEOUT: 504
} as const;

export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
