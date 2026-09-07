/**
 * AsyncLocalStorage-based Request Context Propagation
 *
 * This module provides request-scoped context propagation using Node.js AsyncLocalStorage.
 * It enables automatic context sharing across async boundaries without explicit parameter
 * passing, making it ideal for logging, tracing, and multi-tenancy scenarios.
 *
 * ## How It Works
 *
 * AsyncLocalStorage creates a context store that is automatically propagated through
 * the async call chain. When you set context at the start of a request, all subsequent
 * async operations (database queries, HTTP calls, timers) automatically have access
 * to that context without explicit passing.
 *
 * ## Context Propagation Across Async Boundaries
 *
 * Context set via `setRequestContext` or `withRequestContext` automatically propagates:
 * - Through Promise chains (async/await)
 * - Into setTimeout/setInterval callbacks
 * - Through EventEmitter handlers
 * - Into child processes spawned with proper context
 *
 * @example Context propagation across async operations
 * ```typescript
 * import {
 *   withRequestContext,
 *   getRequestId,
 *   getUserId,
 *   logger
 * } from '@package/observability';
 *
 * async function handleRequest(req: Request): Promise<void> {
 *   await withRequestContext(
 *     { requestId: req.id, userId: req.user.id },
 *     async () => {
 *       // Context available here
 *       logger.info('Starting request');
 *
 *       // Context propagates through async calls
 *       await fetchUserData();  // getRequestId() works inside
 *       await processPayment(); // getUserId() works inside
 *
 *       // Even in setTimeout callbacks
 *       setTimeout(() => {
 *         // Context still available!
 *         console.log('Request ID:', getRequestId());
 *       }, 100);
 *     }
 *   );
 * }
 * ```
 *
 * @example Using with Express/NestJS middleware
 * ```typescript
 * import { setRequestContext, getRequestContext } from '@package/observability';
 *
 * // Middleware to initialize context
 * function contextMiddleware(req, res, next) {
 *   setRequestContext({
 *     requestId: req.headers['x-request-id'] || generateUuid(),
 *     userId: req.user?.id,
 *     organizationId: req.user?.organizationId
 *   });
 *   next();
 * }
 *
 * // Later in any handler or service
 * function processOrder() {
 *   const ctx = getRequestContext();
 *   logger.info('Processing order', ctx); // Automatically includes requestId, userId
 * }
 * ```
 *
 * @module observability/context
 *
 * @see {@link setRequestContext} for persistent context updates
 * @see {@link withRequestContext} for scoped context execution
 * @see {@link getRequestContext} for retrieving current context
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { ILogContext } from './logger';

interface RequestContextData extends ILogContext {
  startTime: number;
}

const contextStorage = new AsyncLocalStorage<RequestContextData>();

/**
 * Sets or merges request-specific logging context into the async context store.
 *
 * This function updates the current async local storage with the provided context,
 * making it available to all subsequent logging calls within the same async context.
 * If no store exists, initializes one with a `startTime` timestamp.
 *
 * ## Behavior
 *
 * - Merges the provided context with any existing store data
 * - Preserves existing fields not overwritten by the new context
 * - Uses `AsyncLocalStorage.enterWith()` to update the store in-place
 * - Sets `startTime` to `Date.now()` if no store exists (for request duration tracking)
 *
 * ## Use Cases
 *
 * - Setting user/organization context after authentication middleware
 * - Adding request IDs from incoming headers
 * - Enriching context with additional metadata during request processing
 *
 * @param context - The logging context fields to set or merge. Common fields include
 *                  `userId`, `organizationId`, `requestId`, and custom metadata.
 *
 * @example Setting context in middleware
 * ```typescript
 * import { setRequestContext } from '@package/observability';
 *
 * function authMiddleware(req, res, next) {
 *   setRequestContext({
 *     userId: req.user.id,
 *     organizationId: req.user.orgId,
 *     requestId: req.headers['x-request-id']
 *   });
 *   next();
 * }
 * ```
 *
 * @see {@link getRequestContext} to retrieve the current context
 * @see {@link withRequestContext} for scoped context propagation
 */
export function setRequestContext(context: ILogContext): void {
  const current = contextStorage.getStore() ?? { startTime: Date.now() };
  contextStorage.enterWith({ ...current, ...context });
}

/**
 * Retrieves the current request context from async local storage.
 *
 * Returns the logging context associated with the current async execution context,
 * or `undefined` if called outside of an established context (e.g., before
 * `setRequestContext` or outside a `withRequestContext` callback).
 *
 * ## Return Value
 *
 * - Returns an `ILogContext` object containing fields like `userId`, `organizationId`,
 *   `requestId`, and any custom fields that were set via `setRequestContext` or
 *   `withRequestContext`.
 * - Returns `undefined` when called outside of any established context. This commonly
 *   occurs during application startup, in standalone scripts, or in background jobs
 *   that haven't initialized context.
 *
 * ## Important Notes
 *
 * - The internal `startTime` field (used for request duration tracking) is excluded
 *   from the returned context object.
 * - The returned object is a shallow copy; modifying it does not affect the stored
 *   context. Use `setRequestContext` to update context values.
 * - Context is automatically cleaned up when the async scope ends.
 *
 * @returns The current logging context with standard and custom fields, or `undefined`
 *          if no context has been established in the current async execution chain.
 *
 * @example Retrieving context in a service method
 * ```typescript
 * import { getRequestContext, logger } from '@package/observability';
 *
 * function processOrder(orderId: string): void {
 *   const context = getRequestContext();
 *
 *   if (context) {
 *     logger.info('Processing order', {
 *       ...context,
 *       orderId
 *     });
 *   } else {
 *     // No context available - likely called outside request scope
 *     logger.warn('Processing order without request context', { orderId });
 *   }
 * }
 * ```
 *
 * @example Guard against undefined context
 * ```typescript
 * import { getRequestContext } from '@package/observability';
 *
 * function getAuditInfo(): { userId?: string; requestId?: string } {
 *   const ctx = getRequestContext();
 *   return {
 *     userId: ctx?.userId,
 *     requestId: ctx?.requestId
 *   };
 * }
 * ```
 *
 * @example Context propagation verification
 * ```typescript
 * import { withRequestContext, getRequestContext } from '@package/observability';
 *
 * async function demonstrateContextPropagation(): Promise<void> {
 *   console.log('Before context:', getRequestContext()); // undefined
 *
 *   await withRequestContext({ requestId: 'req-123' }, async () => {
 *     console.log('Inside context:', getRequestContext()); // { requestId: 'req-123' }
 *
 *     await someAsyncOperation();
 *     console.log('After async:', getRequestContext()); // Still { requestId: 'req-123' }
 *   });
 *
 *   console.log('After context:', getRequestContext()); // undefined
 * }
 * ```
 *
 * @see {@link setRequestContext} for setting context values
 * @see {@link withRequestContext} for scoped context execution
 * @see {@link getRequestId} for retrieving just the request ID
 * @see {@link getUserId} for retrieving just the user ID
 * @see {@link getOrganizationId} for retrieving just the organization ID
 */
export function getRequestContext(): ILogContext | undefined {
  const store = contextStorage.getStore();
  if (!store) return undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { startTime, ...context } = store;
  return context;
}

/**
 * Executes a callback within a scoped logging/tracing context.
 *
 * Propagates the provided context for the duration of the callback execution,
 * merging it with any existing context from the async local storage. This enables
 * automatic context propagation to all logging calls made within the callback
 * and any functions it invokes.
 *
 * ## Behavior
 *
 * - Merges the provided context with any existing store data
 * - Uses `AsyncLocalStorage.run()` to scope the context to the callback
 * - Context is automatically cleaned up when the callback completes
 * - Sets `startTime` to `Date.now()` if no store exists
 * - Supports both synchronous and asynchronous callbacks
 *
 * ## Important Notes
 *
 * The callback is executed synchronously within the propagated context. For
 * async callbacks, the context propagates through the entire promise chain.
 * Avoid long-running blocking operations in synchronous callbacks as they
 * will block the event loop.
 *
 * @typeParam T - The return type of the callback function
 * @param context - The logging context fields to merge into the current store.
 *                  Common fields include `userId`, `organizationId`, `requestId`.
 * @param callback - The function to execute within the scoped context.
 *                   Can be synchronous or return a Promise.
 * @returns The result of the callback function
 *
 * @example Scoped context for a specific operation
 * ```typescript
 * import { withRequestContext, logger } from '@package/observability';
 *
 * const result = withRequestContext(
 *   { requestId: 'req-123', userId: 'user-456' },
 *   () => {
 *     // All logs here automatically include requestId and userId
 *     logger.info('Processing request');
 *     return processRequest();
 *   }
 * );
 * ```
 *
 * @example Async callback with context propagation
 * ```typescript
 * const result = await withRequestContext(
 *   { organizationId: 'org-789' },
 *   async () => {
 *     // Context propagates through the entire async chain
 *     await step1();
 *     await step2();
 *     return finalResult;
 *   }
 * );
 * ```
 *
 * @see {@link setRequestContext} for persistent context updates
 * @see {@link getRequestContext} to retrieve the current context
 */
export function withRequestContext<T>(context: ILogContext, callback: () => T): T {
  const current = contextStorage.getStore() ?? { startTime: Date.now() };
  return contextStorage.run({ ...current, ...context }, callback);
}

/**
 * Retrieves the request ID from the current context.
 *
 * A convenience helper that extracts only the `requestId` field from the current
 * async local storage context. This is commonly used for logging, tracing, and
 * correlating operations within a single request lifecycle.
 *
 * ## Use Cases
 *
 * - **Logging**: Include request ID in log messages for correlation
 * - **Error tracking**: Attach request ID to error reports
 * - **External API calls**: Pass request ID to downstream services for distributed tracing
 * - **Response headers**: Include request ID in response for client debugging
 *
 * @returns The request ID string if available, or `undefined` if no context exists
 *          or no request ID was set in the current context.
 *
 * @example Adding request ID to response headers
 * ```typescript
 * import { getRequestId } from '@package/observability';
 *
 * function responseMiddleware(req, res, next) {
 *   res.on('finish', () => {
 *     const requestId = getRequestId();
 *     if (requestId) {
 *       res.setHeader('X-Request-ID', requestId);
 *     }
 *   });
 *   next();
 * }
 * ```
 *
 * @example Including in error reports
 * ```typescript
 * import { getRequestId, logger } from '@package/observability';
 *
 * function handleError(error: Error): void {
 *   const requestId = getRequestId();
 *   logger.error('Unhandled error', error, { requestId });
 *
 *   // Send to error tracking service
 *   errorTracker.report(error, { requestId });
 * }
 * ```
 *
 * @see {@link getRequestContext} for retrieving the full context
 * @see {@link setRequestContext} for setting the request ID
 */
export function getRequestId(): string | undefined {
  return getRequestContext()?.requestId;
}

/**
 * Retrieves the user ID from the current context.
 *
 * A convenience helper that extracts only the `userId` field from the current
 * async local storage context. This is commonly used for audit logging, access
 * control checks, and user-scoped operations.
 *
 * ## Use Cases
 *
 * - **Audit logging**: Track which user performed each action
 * - **Authorization**: Verify user has access to resources
 * - **Rate limiting**: Apply user-specific rate limits
 * - **Personalization**: Apply user preferences to operations
 *
 * @returns The user ID string if available, or `undefined` if no context exists,
 *          no user ID was set, or the request is unauthenticated.
 *
 * @example User-scoped audit logging
 * ```typescript
 * import { getUserId, getOrganizationId, logger } from '@package/observability';
 *
 * function auditLog(action: string, resourceId: string): void {
 *   logger.info('Audit event', {
 *     action,
 *     resourceId,
 *     userId: getUserId(),
 *     organizationId: getOrganizationId(),
 *     timestamp: new Date().toISOString()
 *   });
 * }
 *
 * // Usage
 * auditLog('document.delete', 'doc-123');
 * // Output: { action: 'document.delete', resourceId: 'doc-123', userId: 'user-456', ... }
 * ```
 *
 * @example Conditional authorization check
 * ```typescript
 * import { getUserId } from '@package/observability';
 *
 * function requireAuthentication(): string {
 *   const userId = getUserId();
 *   if (!userId) {
 *     throw new UnauthorizedException('Authentication required');
 *   }
 *   return userId;
 * }
 * ```
 *
 * @see {@link getRequestContext} for retrieving the full context
 * @see {@link getOrganizationId} for retrieving the organization ID
 * @see {@link setRequestContext} for setting the user ID
 */
export function getUserId(): string | undefined {
  return getRequestContext()?.userId;
}

/**
 * Retrieves the organization ID from the current context.
 *
 * A convenience helper that extracts only the `organizationId` field from the
 * current async local storage context. This is critical for multi-tenant applications
 * to ensure proper data isolation and tenant-scoped operations.
 *
 * ## Multi-Tenancy Use Cases
 *
 * - **Data isolation**: Scope database queries to the current tenant
 * - **Resource access**: Verify resources belong to the current organization
 * - **Tenant-specific configuration**: Apply organization-level settings
 * - **Usage tracking**: Track API usage per organization for billing
 * - **Audit compliance**: Ensure logs are properly scoped for tenant isolation
 *
 * ## Important Notes
 *
 * In multi-tenant systems, always verify organization context before accessing
 * tenant-scoped resources. A missing organization ID may indicate a system-level
 * operation or a configuration error.
 *
 * @returns The organization ID string if available, or `undefined` if no context
 *          exists or no organization ID was set (e.g., system operations, unauthenticated
 *          requests, or single-tenant mode).
 *
 * @example Tenant-scoped database queries
 * ```typescript
 * import { getOrganizationId } from '@package/observability';
 * import { db } from '@package/db-core';
 *
 * async function getOrganizationUsers(): Promise<User[]> {
 *   const orgId = getOrganizationId();
 *   if (!orgId) {
 *     throw new Error('Organization context required');
 *   }
 *
 *   return db
 *     .select()
 *     .from(users)
 *     .where(eq(users.organizationId, orgId));
 * }
 * ```
 *
 * @example Multi-tenant resource validation
 * ```typescript
 * import { getOrganizationId } from '@package/observability';
 *
 * async function validateResourceAccess(resource: Resource): Promise<void> {
 *   const currentOrgId = getOrganizationId();
 *
 *   if (resource.organizationId !== currentOrgId) {
 *     throw new ForbiddenException(
 *       'Resource does not belong to current organization'
 *     );
 *   }
 * }
 * ```
 *
 * @example Tenant-scoped logging
 * ```typescript
 * import { getOrganizationId, getUserId, logger } from '@package/observability';
 *
 * function logBusinessEvent(event: string, data: object): void {
 *   logger.info(event, {
 *     ...data,
 *     organizationId: getOrganizationId(),
 *     userId: getUserId(),
 *     timestamp: Date.now()
 *   });
 * }
 * ```
 *
 * @see {@link getRequestContext} for retrieving the full context
 * @see {@link getUserId} for retrieving the user ID
 * @see {@link setRequestContext} for setting the organization ID
 */
export function getOrganizationId(): string | undefined {
  return getRequestContext()?.organizationId;
}

// Re-export ILogContext for convenience
export type { ILogContext };
