/**
 * Email validation schemas
 *
 * Provides Zod schemas for validating email addresses with automatic
 * normalization (trimming whitespace and converting to lowercase).
 *
 * @module email.schema
 */

import { z } from 'zod';

/**
 * Validates email addresses with normalization.
 *
 * Applies the following transformations and rules:
 * - Trims leading and trailing whitespace
 * - Converts to lowercase for consistent storage
 * - Validates email format (RFC 5322 compliant)
 * - Rejects emails starting with `-` or `.` (security measure)
 * - Requires non-empty input
 *
 * @example
 * // Valid inputs - transformations applied
 * emailSchema.parse('User@Example.COM');     // Returns: 'user@example.com'
 * emailSchema.parse('  test@test.com  ');    // Returns: 'test@test.com'
 * emailSchema.parse('JOHN.DOE@GMAIL.COM');   // Returns: 'john.doe@gmail.com'
 *
 * @example
 * // Invalid inputs - throws ZodError
 * emailSchema.parse('');                     // Error: 'Email is required'
 * emailSchema.parse('invalid');              // Error: 'Invalid email address'
 * emailSchema.parse('-test@test.com');       // Error: 'Invalid email address'
 * emailSchema.parse('.user@example.com');    // Error: 'Invalid email address'
 * emailSchema.parse('user@');                // Error: 'Invalid email address'
 * emailSchema.parse('@example.com');         // Error: 'Invalid email address'
 *
 * @returns A Zod schema that validates and normalizes email addresses
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((val) => val.length > 0, 'Email is required')
  .refine((val) => !val.startsWith('-') && !val.startsWith('.'), 'Invalid email address')
  .email('Invalid email address');

/**
 * Optional email schema with normalization.
 *
 * Same validation rules as {@link emailSchema} but allows:
 * - `undefined` values (optional)
 * - `null` values (nullable)
 *
 * Applies the following transformations when a value is provided:
 * - Trims leading and trailing whitespace
 * - Converts to lowercase for consistent storage
 * - Validates email format (RFC 5322 compliant)
 * - Rejects emails starting with `-` or `.`
 *
 * @example
 * // Valid inputs - value provided
 * optionalEmailSchema.parse('User@Example.COM');  // Returns: 'user@example.com'
 * optionalEmailSchema.parse('  test@test.com  '); // Returns: 'test@test.com'
 *
 * @example
 * // Valid inputs - no value
 * optionalEmailSchema.parse(undefined);           // Returns: undefined
 * optionalEmailSchema.parse(null);                // Returns: null
 *
 * @example
 * // Invalid inputs - throws ZodError
 * optionalEmailSchema.parse('invalid');           // Error: 'Invalid email address'
 * optionalEmailSchema.parse('-test@test.com');    // Error: 'Invalid email address'
 * optionalEmailSchema.parse('.user@example.com'); // Error: 'Invalid email address'
 *
 * @returns A Zod schema that validates optional/nullable email addresses
 */
export const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((val) => !val.startsWith('-') && !val.startsWith('.'), 'Invalid email address')
  .email('Invalid email address')
  .optional()
  .nullable();
