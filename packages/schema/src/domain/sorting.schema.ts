/**
 * Sorting validation schemas
 */

import { z } from 'zod';

/**
 * Sort order enumeration schema.
 *
 * Defines valid sort direction values for ordering query results.
 *
 * **Allowed Values:**
 * - `'asc'`: Ascending order (A→Z, 0→9, oldest→newest)
 * - `'desc'`: Descending order (Z→A, 9→0, newest→oldest)
 *
 * **Case Sensitivity:**
 * Values are case-sensitive. Use lowercase only.
 *
 * @example
 * // Valid inputs
 * sortOrderEnum.parse('asc');   // ✓
 * sortOrderEnum.parse('desc');  // ✓
 *
 * @example
 * // Invalid inputs (will throw ZodError)
 * sortOrderEnum.parse('ASC');       // Case-sensitive, must be lowercase
 * sortOrderEnum.parse('ascending'); // Not a valid enum value
 * sortOrderEnum.parse('');          // Empty string not allowed
 */
export const sortOrderEnum = z.enum(['asc', 'desc']);

/** Inferred type for {@link sortOrderEnum} - 'asc' | 'desc' */
export type SortOrderValue = z.infer<typeof sortOrderEnum>;

/**
 * Single sort parameter schema.
 *
 * Validates a single sorting criterion with field name and direction.
 *
 * **Field Constraints:**
 * - `field`: Non-empty string identifying the column/property to sort by
 * - `order`: Sort direction ('asc' or 'desc')
 *
 * @example
 * // Valid inputs
 * sortParamSchema.parse({ field: 'createdAt', order: 'desc' });
 * sortParamSchema.parse({ field: 'name', order: 'asc' });
 * sortParamSchema.parse({ field: 'user.email', order: 'asc' }); // Nested field
 *
 * @example
 * // Invalid inputs (will throw ZodError)
 * sortParamSchema.parse({ field: '', order: 'asc' });  // Field cannot be empty
 * sortParamSchema.parse({ field: 'name' });            // Missing order
 * sortParamSchema.parse({ order: 'asc' });             // Missing field
 */
export const sortParamSchema = z.object({
  field: z.string().min(1, 'Field cannot be empty'),
  order: sortOrderEnum
});

/** Inferred type for {@link sortParamSchema} - { field: string; order: SortOrderValue } */
export type SortParam = z.infer<typeof sortParamSchema>;

/**
 * Multiple sort parameters schema.
 *
 * Validates an array of sort parameters for multi-column sorting.
 * Sort parameters are applied in order (first parameter is primary sort).
 *
 * @example
 * // Valid inputs - multi-column sorting
 * sortParamsSchema.parse([
 *   { field: 'status', order: 'asc' },
 *   { field: 'createdAt', order: 'desc' }
 * ]);
 *
 * // Single sort
 * sortParamsSchema.parse([{ field: 'name', order: 'asc' }]);
 *
 * // Empty array (no sorting)
 * sortParamsSchema.parse([]);
 *
 * @example
 * // Constructing sort params programmatically
 * const sorts = [
 *   { field: 'priority', order: 'desc' as const },
 *   { field: 'dueDate', order: 'asc' as const }
 * ];
 * sortParamsSchema.parse(sorts);
 */
export const sortParamsSchema = z.array(sortParamSchema);

/** Inferred type for {@link sortParamsSchema} - SortParam[] */
export type SortParams = z.infer<typeof sortParamsSchema>;
