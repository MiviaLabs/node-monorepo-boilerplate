/**
 * Pagination validation schemas
 */

import { z } from 'zod';

const numericString = z.string().regex(/^\d+$/, 'Must be a numeric string');

/**
 * Offset-based pagination parameters schema.
 *
 * Validates and transforms pagination query parameters with automatic
 * string-to-number coercion for query string compatibility.
 *
 * **Field Constraints:**
 * - `page`: Integer ≥ 1 (defaults to 1)
 * - `limit`: Integer 1-100 (defaults to 20)
 *
 * **Coercion Behavior:**
 * Both fields accept numbers or numeric strings (e.g., "10" → 10).
 * This supports query strings where all values arrive as strings.
 *
 * @example
 * // Valid inputs
 * paginationParamsSchema.parse({ page: 1, limit: 20 });
 * paginationParamsSchema.parse({ page: "2", limit: "50" });
 * paginationParamsSchema.parse({}); // Uses defaults: { page: 1, limit: 20 }
 *
 * @example
 * // Invalid inputs (will throw ZodError)
 * paginationParamsSchema.parse({ page: 0 });      // page must be ≥ 1
 * paginationParamsSchema.parse({ page: -1 });     // page must be positive
 * paginationParamsSchema.parse({ limit: 150 });   // limit cannot exceed 100
 * paginationParamsSchema.parse({ limit: 0 });     // limit must be ≥ 1
 * paginationParamsSchema.parse({ page: "abc" });  // must be numeric string
 */
export const paginationParamsSchema = z.object({
  page: z
    .union([z.number().int().positive(), numericString])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 1, {
      message: 'Page must be a positive integer'
    })
    .default(1),
  limit: z
    .union([z.number().int().positive().max(100), numericString])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'Limit must be an integer between 1 and 100'
    })
    .default(20)
});

/**
 * Cursor-based pagination parameters schema.
 *
 * Validates cursor pagination parameters for efficient traversal of large
 * datasets without offset-based performance penalties.
 *
 * **Field Constraints:**
 * - `cursor`: Opaque string token (nullable, defaults to null for first page)
 * - `limit`: Integer 1-100 (defaults to 20)
 *
 * **Coercion Behavior:**
 * The `limit` field accepts numbers or numeric strings for query string compatibility.
 *
 * @example
 * // Valid inputs
 * cursorPaginationSchema.parse({ cursor: null, limit: 20 });
 * cursorPaginationSchema.parse({ cursor: "eyJpZCI6MTAwfQ==", limit: 10 });
 * cursorPaginationSchema.parse({}); // Uses defaults: { cursor: null, limit: 20 }
 * cursorPaginationSchema.parse({ limit: "50" }); // String coerced to number
 *
 * @example
 * // Invalid inputs (will throw ZodError)
 * cursorPaginationSchema.parse({ limit: 150 });  // limit cannot exceed 100
 * cursorPaginationSchema.parse({ limit: 0 });    // limit must be ≥ 1
 */
export const cursorPaginationSchema = z.object({
  cursor: z.string().nullable().optional().default(null),
  limit: z
    .union([z.number().int().positive().max(100), numericString])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'Limit must be an integer between 1 and 100'
    })
    .default(20)
});

// ============================================================================
// Inferred Types
// ============================================================================

/**
 * Offset-based pagination parameters type.
 *
 * @example
 * const params: PaginationParams = { page: 1, limit: 20 };
 */
export type PaginationParams = z.infer<typeof paginationParamsSchema>;

/**
 * Cursor-based pagination parameters type.
 *
 * @example
 * const params: CursorPaginationParams = { cursor: 'abc123', limit: 10 };
 */
export type CursorPaginationParams = z.infer<typeof cursorPaginationSchema>;
