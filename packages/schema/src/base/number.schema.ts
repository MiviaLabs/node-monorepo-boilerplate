/**
 * Number validation schemas
 *
 * Provides Zod schemas for validating numbers with various constraints
 * including sign restrictions, integer validation, and range limits.
 *
 * @module number.schema
 */

import { z } from 'zod';

/**
 * Positive number schema (greater than 0).
 *
 * Validates that a number is strictly positive (> 0).
 * Zero is NOT considered positive.
 *
 * Validation rules:
 * - Must be a number type
 * - Must be greater than 0
 * - Allows decimals
 *
 * @example
 * // Valid inputs
 * positiveNumber.parse(1);           // Returns: 1
 * positiveNumber.parse(0.001);       // Returns: 0.001
 * positiveNumber.parse(999999);      // Returns: 999999
 * positiveNumber.parse(3.14159);     // Returns: 3.14159
 *
 * @example
 * // Invalid inputs - throws ZodError
 * positiveNumber.parse(0);           // Error: 'Number must be positive'
 * positiveNumber.parse(-1);          // Error: 'Number must be positive'
 * positiveNumber.parse(-0.001);      // Error: 'Number must be positive'
 * positiveNumber.parse('5');         // Error: 'Expected number, received string'
 * positiveNumber.parse(NaN);         // Error: 'Expected number, received nan'
 *
 * @returns A Zod schema that validates positive numbers
 */
export const positiveNumber = z.number().positive('Number must be positive');

/** Inferred type for {@link positiveNumber} schema */
export type PositiveNumber = z.infer<typeof positiveNumber>;

/**
 * Negative number schema (less than 0).
 *
 * Validates that a number is strictly negative (< 0).
 * Zero is NOT considered negative.
 *
 * Validation rules:
 * - Must be a number type
 * - Must be less than 0
 * - Allows decimals
 *
 * @example
 * // Valid inputs
 * negativeNumber.parse(-1);          // Returns: -1
 * negativeNumber.parse(-0.001);      // Returns: -0.001
 * negativeNumber.parse(-999999);     // Returns: -999999
 * negativeNumber.parse(-3.14159);    // Returns: -3.14159
 *
 * @example
 * // Invalid inputs - throws ZodError
 * negativeNumber.parse(0);           // Error: 'Number must be negative'
 * negativeNumber.parse(1);           // Error: 'Number must be negative'
 * negativeNumber.parse(0.001);       // Error: 'Number must be negative'
 * negativeNumber.parse('−5');        // Error: 'Expected number, received string'
 *
 * @returns A Zod schema that validates negative numbers
 */
export const negativeNumber = z.number().negative('Number must be negative');

/** Inferred type for {@link negativeNumber} schema */
export type NegativeNumber = z.infer<typeof negativeNumber>;

/**
 * Non-negative number schema (0 or greater).
 *
 * Validates that a number is zero or positive (>= 0).
 * Use this for quantities, counts, or values that cannot be negative.
 *
 * Validation rules:
 * - Must be a number type
 * - Must be greater than or equal to 0
 * - Allows decimals
 *
 * @example
 * // Valid inputs
 * nonNegativeNumber.parse(0);        // Returns: 0
 * nonNegativeNumber.parse(1);        // Returns: 1
 * nonNegativeNumber.parse(0.001);    // Returns: 0.001
 * nonNegativeNumber.parse(999999);   // Returns: 999999
 *
 * @example
 * // Invalid inputs - throws ZodError
 * nonNegativeNumber.parse(-1);       // Error: 'Number must be non-negative'
 * nonNegativeNumber.parse(-0.001);   // Error: 'Number must be non-negative'
 * nonNegativeNumber.parse(-999999);  // Error: 'Number must be non-negative'
 *
 * @returns A Zod schema that validates non-negative numbers
 */
export const nonNegativeNumber = z.number().nonnegative('Number must be non-negative');

/** Inferred type for {@link nonNegativeNumber} schema */
export type NonNegativeNumber = z.infer<typeof nonNegativeNumber>;

/**
 * Integer schema (whole numbers only).
 *
 * Validates that a number is a safe integer (whole number within JavaScript's
 * safe integer range). Uses `Number.isSafeInteger()` internally.
 *
 * Validation rules:
 * - Must be a number type
 * - Must be a whole number (no decimals)
 * - Must be within safe integer range: ±9,007,199,254,740,991
 *   (Number.MIN_SAFE_INTEGER to Number.MAX_SAFE_INTEGER)
 * - Allows positive, negative, and zero
 *
 * @example
 * // Valid inputs
 * integerSchema.parse(0);                          // Returns: 0
 * integerSchema.parse(42);                         // Returns: 42
 * integerSchema.parse(-100);                       // Returns: -100
 * integerSchema.parse(1000000);                    // Returns: 1000000
 * integerSchema.parse(Number.MAX_SAFE_INTEGER);    // Returns: 9007199254740991
 * integerSchema.parse(Number.MIN_SAFE_INTEGER);    // Returns: -9007199254740991
 *
 * @example
 * // Invalid inputs - throws ZodError
 * integerSchema.parse(3.14);                       // Error: 'Number must be an integer'
 * integerSchema.parse(0.5);                        // Error: 'Number must be an integer'
 * integerSchema.parse(-2.5);                       // Error: 'Number must be an integer'
 * integerSchema.parse(1.0000001);                  // Error: 'Number must be an integer'
 * integerSchema.parse(Number.MAX_SAFE_INTEGER + 1); // Error: 'Number must be an integer'
 * integerSchema.parse(1e20);                       // Error: 'Number must be an integer' (outside safe range)
 *
 * @returns A Zod schema that validates safe integer numbers
 */
export const integerSchema = z.number().int('Number must be an integer');

/** Inferred type for {@link integerSchema} schema */
export type Integer = z.infer<typeof integerSchema>;

/**
 * Creates a schema that validates numbers within a specific range.
 *
 * Validates that a number falls within the inclusive range [min, max].
 * Both boundaries are included in the valid range.
 *
 * Validation rules:
 * - Must be a number type
 * - Must be >= min
 * - Must be <= max
 * - Allows decimals within range
 *
 * @param min - The minimum allowed value (inclusive). Must be <= max.
 * @param max - The maximum allowed value (inclusive). Must be >= min.
 * @returns A Zod schema that validates numbers within the specified range
 * @throws {Error} If min > max (unsatisfiable range)
 *
 * @example
 * // Creating range schemas
 * const percentage = numberRange(0, 100);
 * const rating = numberRange(1, 5);
 * const temperature = numberRange(-40, 60);
 *
 * @example
 * // Valid inputs
 * numberRange(0, 100).parse(0);      // Returns: 0 (inclusive minimum)
 * numberRange(0, 100).parse(100);    // Returns: 100 (inclusive maximum)
 * numberRange(0, 100).parse(50);     // Returns: 50
 * numberRange(0, 100).parse(99.99);  // Returns: 99.99 (decimals allowed)
 * numberRange(-10, 10).parse(-5);    // Returns: -5 (negative range)
 *
 * @example
 * // Invalid inputs - throws ZodError
 * numberRange(0, 100).parse(-1);     // Error: 'Number must be greater than or equal to 0'
 * numberRange(0, 100).parse(101);    // Error: 'Number must be less than or equal to 100'
 * numberRange(1, 5).parse(0);        // Error: 'Number must be greater than or equal to 1'
 * numberRange(1, 5).parse(6);        // Error: 'Number must be less than or equal to 5'
 *
 * @example
 * // Invalid range - throws Error at schema creation
 * numberRange(100, 0);               // Error: 'numberRange: min must be <= max'
 */
export const numberRange = (min: number, max: number): z.ZodNumber => {
  if (min > max) {
    throw new Error('numberRange: min must be <= max');
  }
  return z
    .number()
    .min(min, `Number must be greater than or equal to ${min}`)
    .max(max, `Number must be less than or equal to ${max}`);
};

/** Inferred type for schemas created by {@link numberRange} */
export type NumberRange = z.infer<ReturnType<typeof numberRange>>;
