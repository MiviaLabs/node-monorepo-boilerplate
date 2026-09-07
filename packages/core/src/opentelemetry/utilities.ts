/**
 * Shared utility functions for OpenTelemetry operations.
 *
 * This module provides helper functions for working with OpenTelemetry
 * attributes and other common operations needed by tracing and metrics utilities.
 *
 * @see {@link https://opentelemetry.io/docs/specs/otel/common/#attribute | OpenTelemetry Attributes}
 *
 * @module
 */

import type { Attributes } from '@opentelemetry/api';

/**
 * Converts infrastructure attributes to OpenTelemetry-compatible Attributes.
 *
 * This function filters out null and undefined values from the input object,
 * ensuring clean span and metric attributes. OpenTelemetry attributes only
 * accept primitive values (string, number, boolean), and this function
 * handles the common case of optional values that may be undefined.
 *
 * @param attrs - A record of attribute key-value pairs. Keys are strings,
 *   and values can be strings, numbers, booleans, undefined, or null.
 *   Null and undefined values are filtered out.
 * @returns An OpenTelemetry Attributes object containing only the non-null,
 *   non-undefined values from the input.
 *
 * @remarks
 * This function is used internally by tracing utilities like `addSpanAttributes`
 * and `createSpanOptions` to ensure attributes conform to OpenTelemetry requirements.
 *
 * The filtering behavior is intentional:
 * - `undefined` values indicate "no value provided" and should not be recorded
 * - `null` values indicate "explicitly no value" and should not be recorded
 * - Empty strings (`''`) ARE included as they may be meaningful
 * - Zero (`0`) and `false` ARE included as they are valid values
 *
 * @see {@link https://opentelemetry.io/docs/specs/otel/common/#attribute | OpenTelemetry Attribute Specification}
 *
 * @example Basic usage with mixed values
 * ```typescript
 * import { toAttributes } from '@package/core/opentelemetry/utilities';
 *
 * const attrs = toAttributes({
 *   'user.id': '123',
 *   'user.age': 25,
 *   'user.verified': true,
 *   'user.nickname': undefined,  // Filtered out
 *   'user.avatar': null          // Filtered out
 * });
 *
 * // Result:
 * // {
 * //   'user.id': '123',
 * //   'user.age': 25,
 * //   'user.verified': true
 * // }
 * ```
 *
 * @example Handling optional data from API responses
 * ```typescript
 * import { toAttributes } from '@package/core/opentelemetry/utilities';
 * import { withSpan } from '@package/core/opentelemetry';
 *
 * interface UserResponse {
 *   id: string;
 *   email: string;
 *   phone?: string;
 *   metadata?: Record<string, unknown>;
 * }
 *
 * async function fetchUser(userId: string): Promise<UserResponse> {
 *   return withSpan('user.fetch', async (span) => {
 *     const user = await api.getUser(userId);
 *
 *     // Safe to include optional fields - undefined will be filtered
 *     span.setAttributes(toAttributes({
 *       'user.id': user.id,
 *       'user.email_domain': user.email.split('@')[1],
 *       'user.has_phone': user.phone !== undefined,
 *       'user.phone_country': user.phone?.substring(0, 2)  // May be undefined
 *     }));
 *
 *     return user;
 *   });
 * }
 * ```
 *
 * @example Preserving falsy values that are meaningful
 * ```typescript
 * import { toAttributes } from '@package/core/opentelemetry/utilities';
 *
 * const attrs = toAttributes({
 *   'cache.hit': false,      // Included (false is meaningful)
 *   'retry.count': 0,        // Included (0 is meaningful)
 *   'response.body': '',     // Included (empty string may be meaningful)
 *   'error.code': undefined  // Filtered out (no value)
 * });
 *
 * // Result:
 * // {
 * //   'cache.hit': false,
 * //   'retry.count': 0,
 * //   'response.body': ''
 * // }
 * ```
 *
 * @example Using with createSpanOptions
 * ```typescript
 * import { toAttributes } from '@package/core/opentelemetry/utilities';
 * import { getTracer } from '@package/core/opentelemetry';
 * import { DB_ATTRS, DB_SYSTEMS } from '@package/core/opentelemetry/attributes';
 *
 * function createDatabaseSpan(
 *   operation: string,
 *   table?: string,
 *   rowCount?: number
 * ): void {
 *   const tracer = getTracer();
 *
 *   tracer.startActiveSpan('db.query', {
 *     attributes: toAttributes({
 *       [DB_ATTRS.SYSTEM]: DB_SYSTEMS.POSTGRESQL,
 *       [DB_ATTRS.OPERATION]: operation,
 *       [DB_ATTRS.NAME]: table,      // May be undefined
 *       'db.row_count': rowCount     // May be undefined
 *     })
 *   }, (span) => {
 *     // ... execute query
 *     span.end();
 *   });
 * }
 * ```
 *
 * @example Conditional attributes in loops
 * ```typescript
 * import { toAttributes } from '@package/core/opentelemetry/utilities';
 * import { addSpanAttributes } from '@package/core/opentelemetry';
 *
 * async function processBatch(items: Item[]): Promise<void> {
 *   for (const item of items) {
 *     // Only non-null attributes are added to the span
 *     addSpanAttributes(toAttributes({
 *       'item.id': item.id,
 *       'item.type': item.type,
 *       'item.priority': item.priority ?? undefined,  // Convert null to undefined
 *       'item.parent_id': item.parentId               // May be undefined
 *     }));
 *
 *     await processItem(item);
 *   }
 * }
 * ```
 */
export function toAttributes(
  attrs: Record<string, string | number | boolean | undefined | null>
): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) {
      result[key] = value as Attributes[keyof Attributes];
    }
  }
  return result;
}
