/**
 * Array validation schemas
 *
 * Provides Zod schema factory functions for validating arrays with
 * various length constraints. These are generic functions that wrap
 * any Zod schema to create array validators.
 *
 * @module array.schema
 */

import { z } from 'zod';

/**
 * Creates a non-empty array schema.
 *
 * Wraps any Zod schema to create an array that must contain at least one element.
 * Each element is validated against the provided schema.
 *
 * Validation rules:
 * - Must be an array type
 * - Must have at least 1 element
 * - Each element must pass the provided schema validation
 *
 * @typeParam T - The Zod schema type for array elements
 * @param schema - The Zod schema to validate each array element
 * @returns A Zod array schema that requires at least one element
 *
 * @example
 * // Creating non-empty array schemas
 * const nonEmptyStrings = nonEmptyArray(z.string());
 * const nonEmptyNumbers = nonEmptyArray(z.number());
 * const nonEmptyUsers = nonEmptyArray(z.object({ id: z.string(), name: z.string() }));
 *
 * @example
 * // Valid inputs
 * nonEmptyArray(z.string()).parse(['hello']);           // Returns: ['hello']
 * nonEmptyArray(z.string()).parse(['a', 'b', 'c']);     // Returns: ['a', 'b', 'c']
 * nonEmptyArray(z.number()).parse([1, 2, 3]);           // Returns: [1, 2, 3]
 * nonEmptyArray(z.number()).parse([0]);                 // Returns: [0]
 *
 * @example
 * // Invalid inputs - throws ZodError
 * nonEmptyArray(z.string()).parse([]);                  // Error: 'Array cannot be empty'
 * nonEmptyArray(z.string()).parse([1, 2, 3]);           // Error: element validation fails
 * nonEmptyArray(z.number()).parse(['a', 'b']);          // Error: element validation fails
 * nonEmptyArray(z.string()).parse('not-an-array');      // Error: 'Expected array, received string'
 * nonEmptyArray(z.string()).parse(null);                // Error: 'Expected array, received null'
 */
export const nonEmptyArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.array(schema).min(1, 'Array cannot be empty');

/**
 * Creates an array schema with a minimum length constraint.
 *
 * Wraps any Zod schema to create an array that must contain at least
 * the specified number of elements. Each element is validated against
 * the provided schema.
 *
 * Validation rules:
 * - Must be an array type
 * - Must have at least `min` elements
 * - Each element must pass the provided schema validation
 *
 * @typeParam T - The Zod schema type for array elements
 * @param schema - The Zod schema to validate each array element
 * @param min - The minimum number of elements required. Must be a non-negative integer.
 * @returns A Zod array schema with minimum length constraint
 * @throws {RangeError} If min is not a non-negative integer
 *
 * @example
 * // Creating minimum length array schemas
 * const atLeastThreeStrings = arrayMinLength(z.string(), 3);
 * const atLeastTwoNumbers = arrayMinLength(z.number(), 2);
 *
 * @example
 * // Valid inputs
 * arrayMinLength(z.string(), 2).parse(['a', 'b']);      // Returns: ['a', 'b']
 * arrayMinLength(z.string(), 2).parse(['a', 'b', 'c']); // Returns: ['a', 'b', 'c']
 * arrayMinLength(z.number(), 3).parse([1, 2, 3, 4, 5]); // Returns: [1, 2, 3, 4, 5]
 *
 * @example
 * // Invalid inputs - throws ZodError
 * arrayMinLength(z.string(), 2).parse(['a']);           // Error: 'Array must have at least 2 items'
 * arrayMinLength(z.string(), 3).parse([]);              // Error: 'Array must have at least 3 items'
 * arrayMinLength(z.number(), 2).parse([1]);             // Error: 'Array must have at least 2 items'
 * arrayMinLength(z.string(), 2).parse([1, 2]);          // Error: element validation fails
 *
 * @example
 * // Invalid min parameter - throws RangeError at schema creation
 * arrayMinLength(z.string(), -1);                       // RangeError: 'arrayMinLength: min must be a non-negative integer'
 * arrayMinLength(z.string(), 2.5);                      // RangeError: 'arrayMinLength: min must be a non-negative integer'
 */
export const arrayMinLength = <T extends z.ZodTypeAny>(schema: T, min: number) => {
  if (!Number.isFinite(min) || !Number.isInteger(min) || min < 0) {
    throw new RangeError('arrayMinLength: min must be a non-negative integer');
  }
  return z.array(schema).min(min, `Array must have at least ${min} items`);
};

/**
 * Creates an array schema with a maximum length constraint.
 *
 * Wraps any Zod schema to create an array that must contain at most
 * the specified number of elements. Each element is validated against
 * the provided schema. Empty arrays are valid.
 *
 * Validation rules:
 * - Must be an array type
 * - Must have at most `max` elements
 * - Each element must pass the provided schema validation
 *
 * @typeParam T - The Zod schema type for array elements
 * @param schema - The Zod schema to validate each array element
 * @param max - The maximum number of elements allowed. Must be a non-negative integer.
 * @returns A Zod array schema with maximum length constraint
 * @throws {RangeError} If max is not a non-negative integer
 *
 * @example
 * // Creating maximum length array schemas
 * const atMostFiveStrings = arrayMaxLength(z.string(), 5);
 * const atMostTenNumbers = arrayMaxLength(z.number(), 10);
 *
 * @example
 * // Valid inputs
 * arrayMaxLength(z.string(), 3).parse([]);              // Returns: [] (empty is valid)
 * arrayMaxLength(z.string(), 3).parse(['a']);           // Returns: ['a']
 * arrayMaxLength(z.string(), 3).parse(['a', 'b', 'c']); // Returns: ['a', 'b', 'c']
 * arrayMaxLength(z.number(), 2).parse([1, 2]);          // Returns: [1, 2]
 *
 * @example
 * // Invalid inputs - throws ZodError
 * arrayMaxLength(z.string(), 2).parse(['a', 'b', 'c']); // Error: 'Array must have at most 2 items'
 * arrayMaxLength(z.number(), 3).parse([1, 2, 3, 4]);    // Error: 'Array must have at most 3 items'
 * arrayMaxLength(z.string(), 5).parse([1, 2, 3]);       // Error: element validation fails
 *
 * @example
 * // Invalid max parameter - throws RangeError at schema creation
 * arrayMaxLength(z.string(), -1);                       // RangeError: 'arrayMaxLength: max must be a non-negative integer'
 * arrayMaxLength(z.string(), 2.5);                      // RangeError: 'arrayMaxLength: max must be a non-negative integer'
 */
export const arrayMaxLength = <T extends z.ZodTypeAny>(schema: T, max: number) => {
  if (!Number.isFinite(max) || !Number.isInteger(max) || max < 0) {
    throw new RangeError('arrayMaxLength: max must be a non-negative integer');
  }
  return z.array(schema).max(max, `Array must have at most ${max} items`);
};
