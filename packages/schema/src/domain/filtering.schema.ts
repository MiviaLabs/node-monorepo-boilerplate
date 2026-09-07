/**
 * Filtering validation schemas
 */

import { z } from 'zod';

/**
 * Filter operator enumeration schema.
 *
 * Defines all available comparison operators for filtering query results.
 *
 * **Comparison Operators:**
 * - `'eq'`: Equal to (value === target)
 * - `'ne'`: Not equal to (value !== target)
 * - `'gt'`: Greater than (value > target)
 * - `'gte'`: Greater than or equal (value >= target)
 * - `'lt'`: Less than (value < target)
 * - `'lte'`: Less than or equal (value <= target)
 *
 * **Array Operators:**
 * - `'in'`: Value is in array (value IN [a, b, c])
 * - `'notIn'`: Value is not in array (value NOT IN [a, b, c])
 *
 * **String Operators:**
 * - `'contains'`: String contains substring (LIKE '%value%')
 * - `'startsWith'`: String starts with prefix (LIKE 'value%')
 * - `'endsWith'`: String ends with suffix (LIKE '%value')
 *
 * **Null Operators:**
 * - `'isNull'`: Value is null (no value parameter needed)
 * - `'isNotNull'`: Value is not null (no value parameter needed)
 *
 * @example
 * // Valid operators
 * filterOperatorEnum.parse('eq');        // Equality check
 * filterOperatorEnum.parse('contains');  // Substring search
 * filterOperatorEnum.parse('isNull');    // Null check
 */
export const filterOperatorEnum = z.enum([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'endsWith',
  'isNull',
  'isNotNull'
]);

/**
 * Single filter parameter schema.
 *
 * Validates a filter condition with field, operator, and optional value.
 *
 * **Field Constraints:**
 * - `field`: String identifying the column/property to filter
 * - `operator`: One of the valid filter operators
 * - `value`: The comparison value (optional for isNull/isNotNull operators)
 *
 * @example
 * // Simple equality filter
 * filterParamSchema.parse({ field: 'status', operator: 'eq', value: 'active' });
 *
 * // Range filter
 * filterParamSchema.parse({ field: 'age', operator: 'gte', value: 18 });
 *
 * // Array membership filter
 * filterParamSchema.parse({ field: 'role', operator: 'in', value: ['admin', 'user'] });
 *
 * // String pattern filter
 * filterParamSchema.parse({ field: 'email', operator: 'endsWith', value: '@example.com' });
 *
 * // Null check (no value needed)
 * filterParamSchema.parse({ field: 'deletedAt', operator: 'isNull' });
 */
export const filterParamSchema = z.object({
  field: z.string(),
  operator: filterOperatorEnum,
  value: z.any().optional()
});

/**
 * Logical operator enumeration schema.
 *
 * Defines operators for combining multiple filter conditions.
 *
 * **Logical Operators:**
 * - `'and'`: All conditions must match (intersection)
 * - `'or'`: Any condition must match (union)
 *
 * @example
 * logicalOperatorEnum.parse('and');  // Combine with AND logic
 * logicalOperatorEnum.parse('or');   // Combine with OR logic
 */
export const logicalOperatorEnum = z.enum(['and', 'or']);

/**
 * Filter group schema for complex nested filter expressions.
 *
 * Enables building complex filter trees with nested AND/OR logic.
 * Each group contains a logical operator and an array of filters
 * that can be either simple filter params or nested filter groups.
 *
 * **Structure:**
 * - `operator`: Logical operator ('and' or 'or') applied to all filters in the group
 * - `filters`: Array of filter params or nested filter groups
 *
 * **Filter Types (discriminated union):**
 * - `{ type: 'param', field, operator, value }`: Simple filter condition
 * - `{ type: 'group', operator, filters }`: Nested filter group
 *
 * @example
 * // Complex nested filter: (status = 'active' AND role = 'admin') OR (status = 'pending')
 * filterGroupSchema.parse({
 *   operator: 'or',
 *   filters: [
 *     {
 *       type: 'group',
 *       operator: 'and',
 *       filters: [
 *         { type: 'param', field: 'status', operator: 'eq', value: 'active' },
 *         { type: 'param', field: 'role', operator: 'eq', value: 'admin' }
 *       ]
 *     },
 *     { type: 'param', field: 'status', operator: 'eq', value: 'pending' }
 *   ]
 * });
 */
export const filterGroupSchema = z.object({
  operator: logicalOperatorEnum,
  filters: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('param'), ...filterParamSchema.shape }),
      z.object({
        type: z.literal('group'),
        operator: logicalOperatorEnum,
        filters: z.array(z.any())
      })
    ])
  )
});

/**
 * Simple filter parameters schema with implicit AND logic.
 *
 * Validates an array of filter conditions that are combined using AND logic.
 * For simple filtering use cases where all conditions must match.
 *
 * Use `filterGroupSchema` for complex nested OR/AND expressions.
 *
 * @example
 * // Simple AND filter: status = 'active' AND role = 'user'
 * filterParamsSchema.parse([
 *   { field: 'status', operator: 'eq', value: 'active' },
 *   { field: 'role', operator: 'eq', value: 'user' }
 * ]);
 *
 * // Date range filter: createdAt >= startDate AND createdAt <= endDate
 * filterParamsSchema.parse([
 *   { field: 'createdAt', operator: 'gte', value: '2024-01-01' },
 *   { field: 'createdAt', operator: 'lte', value: '2024-12-31' }
 * ]);
 *
 * // Empty array (no filtering)
 * filterParamsSchema.parse([]);
 */
export const filterParamsSchema = z.array(filterParamSchema);
