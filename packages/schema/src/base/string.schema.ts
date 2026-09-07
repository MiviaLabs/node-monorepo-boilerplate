/**
 * Base string validation schemas
 *
 * Provides Zod schemas and factory functions for validating strings with
 * various length constraints, patterns, and formats.
 *
 * String emptiness validators:
 * - {@link nonEmptyString} - Requires length >= 1, allows whitespace-only strings
 * - {@link nonBlankString} - Trims whitespace, rejects blank/whitespace-only strings
 *
 * @module string.schema
 */

import { z } from 'zod';

/**
 * Non-empty string schema.
 *
 * Validates that a string contains at least one character.
 * Does not trim whitespace - a string of spaces is considered valid.
 *
 * Validation rules:
 * - Must be a string type
 * - Must have length >= 1
 *
 * @example
 * // Valid inputs
 * nonEmptyString.parse('hello');     // Returns: 'hello'
 * nonEmptyString.parse('a');         // Returns: 'a'
 * nonEmptyString.parse('   ');       // Returns: '   ' (whitespace is valid)
 *
 * @example
 * // Invalid inputs - throws ZodError
 * nonEmptyString.parse('');          // Error: 'String cannot be empty'
 * nonEmptyString.parse(123);         // Error: 'Expected string, received number'
 * nonEmptyString.parse(null);        // Error: 'Expected string, received null'
 *
 * @returns A Zod schema that validates non-empty strings
 */
export const nonEmptyString = z.string().min(1, 'String cannot be empty');

/**
 * TypeScript type inferred from nonEmptyString schema.
 * Represents a string that has been validated as non-empty.
 */
export type NonEmptyString = z.infer<typeof nonEmptyString>;

/**
 * Non-blank string schema.
 *
 * Validates that a string contains at least one non-whitespace character.
 * Trims leading and trailing whitespace before validation and in the output.
 *
 * Use this instead of {@link nonEmptyString} when whitespace-only strings
 * should be rejected (e.g., user input fields, names, titles).
 *
 * Validation rules:
 * - Must be a string type
 * - Trims leading/trailing whitespace
 * - Must have length >= 1 after trimming
 *
 * @example
 * // Valid inputs
 * nonBlankString.parse('hello');       // Returns: 'hello'
 * nonBlankString.parse('  hello  ');   // Returns: 'hello' (trimmed)
 * nonBlankString.parse('a');           // Returns: 'a'
 *
 * @example
 * // Invalid inputs - throws ZodError
 * nonBlankString.parse('');            // Error: 'String cannot be blank'
 * nonBlankString.parse('   ');         // Error: 'String cannot be blank' (whitespace rejected)
 * nonBlankString.parse('\t\n');        // Error: 'String cannot be blank'
 * nonBlankString.parse(123);           // Error: 'Expected string, received number'
 *
 * @see {@link nonEmptyString} - Use when whitespace-only strings are acceptable
 * @returns A Zod schema that validates and trims non-blank strings
 */
export const nonBlankString = z.string().trim().min(1, 'String cannot be blank');

/**
 * TypeScript type inferred from nonBlankString schema.
 * Represents a string that has been validated as non-blank and trimmed.
 */
export type NonBlankString = z.infer<typeof nonBlankString>;

/**
 * Creates a schema that validates strings with a minimum length.
 *
 * Validation rules:
 * - Must be a string type
 * - Must have length >= min
 *
 * @param min - The minimum number of characters required. Must be a non-negative integer.
 * @param message - Optional custom error message. Defaults to 'String must be at least {min} characters'
 * @returns A Zod schema that validates string minimum length
 * @throws {RangeError} If min is not a non-negative integer
 *
 * @example
 * // Creating schemas with different minimums
 * const password = minLength(8);
 * const username = minLength(3, 'Username too short');
 *
 * @example
 * // Valid inputs
 * minLength(3).parse('abc');         // Returns: 'abc'
 * minLength(3).parse('abcdef');      // Returns: 'abcdef'
 *
 * @example
 * // Invalid inputs - throws ZodError
 * minLength(3).parse('ab');          // Error: 'String must be at least 3 characters'
 * minLength(3).parse('');            // Error: 'String must be at least 3 characters'
 * minLength(8, 'Too short').parse('abc'); // Error: 'Too short'
 *
 * @example
 * // Invalid min parameter - throws RangeError at schema creation
 * minLength(-1);                     // RangeError: 'minLength: min must be a non-negative integer'
 * minLength(2.5);                    // RangeError: 'minLength: min must be a non-negative integer'
 */
export const minLength = (min: number, message?: string): z.ZodString => {
  if (!Number.isFinite(min) || !Number.isInteger(min) || min < 0) {
    throw new RangeError('minLength: min must be a non-negative integer');
  }
  return z.string().min(min, message || `String must be at least ${min} characters`);
};

/**
 * Creates a schema that validates strings with a maximum length.
 *
 * Validation rules:
 * - Must be a string type
 * - Must have length <= max
 *
 * @param max - The maximum number of characters allowed. Must be a non-negative integer.
 * @param message - Optional custom error message. Defaults to 'String must be at most {max} characters'
 * @returns A Zod schema that validates string maximum length
 * @throws {RangeError} If max is not a non-negative integer
 *
 * @example
 * // Creating schemas with different maximums
 * const title = maxLength(100);
 * const bio = maxLength(500, 'Bio is too long');
 *
 * @example
 * // Valid inputs
 * maxLength(5).parse('abc');         // Returns: 'abc'
 * maxLength(5).parse('abcde');       // Returns: 'abcde'
 * maxLength(5).parse('');            // Returns: '' (empty is valid)
 *
 * @example
 * // Invalid inputs - throws ZodError
 * maxLength(5).parse('abcdef');      // Error: 'String must be at most 5 characters'
 * maxLength(3, 'Too long').parse('abcd'); // Error: 'Too long'
 *
 * @example
 * // Invalid max parameter - throws RangeError at schema creation
 * maxLength(-1);                     // RangeError: 'maxLength: max must be a non-negative integer'
 * maxLength(2.5);                    // RangeError: 'maxLength: max must be a non-negative integer'
 */
export const maxLength = (max: number, message?: string): z.ZodString => {
  if (!Number.isFinite(max) || !Number.isInteger(max) || max < 0) {
    throw new RangeError('maxLength: max must be a non-negative integer');
  }
  return z.string().max(max, message || `String must be at most ${max} characters`);
};

/**
 * Creates a schema that validates strings matching a regular expression pattern.
 *
 * Validation rules:
 * - Must be a string type
 * - Must match the provided regex pattern
 *
 * @param regex - The regular expression pattern to match against
 * @param message - Optional custom error message. Defaults to 'String format is invalid'
 * @returns A Zod schema that validates string against the pattern
 *
 * @example
 * // Creating pattern schemas
 * const alphanumeric = pattern(/^[a-zA-Z0-9]+$/);
 * const hexColor = pattern(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color');
 *
 * @example
 * // Valid inputs
 * pattern(/^[A-Z]+$/).parse('HELLO');        // Returns: 'HELLO'
 * pattern(/^\d{3}-\d{4}$/).parse('123-4567'); // Returns: '123-4567'
 *
 * @example
 * // Invalid inputs - throws ZodError
 * pattern(/^[A-Z]+$/).parse('hello');        // Error: 'String format is invalid'
 * pattern(/^\d+$/, 'Numbers only').parse('abc'); // Error: 'Numbers only'
 */
export const pattern = (regex: RegExp, message = 'String format is invalid'): z.ZodString =>
  z.string().regex(regex, message);

/**
 * Slug schema for URL-friendly strings.
 *
 * Validates kebab-case strings suitable for URLs and identifiers.
 *
 * Validation rules:
 * - Must be a string type
 * - Must contain only lowercase letters (a-z) and numbers (0-9)
 * - Words separated by single hyphens
 * - Cannot start or end with a hyphen
 * - Cannot have consecutive hyphens
 *
 * Pattern: `^[a-z0-9]+(?:-[a-z0-9]+)*$`
 *
 * @example
 * // Valid inputs
 * slug.parse('hello');               // Returns: 'hello'
 * slug.parse('hello-world');         // Returns: 'hello-world'
 * slug.parse('my-blog-post-123');    // Returns: 'my-blog-post-123'
 * slug.parse('a1b2c3');              // Returns: 'a1b2c3'
 *
 * @example
 * // Invalid inputs - throws ZodError
 * slug.parse('Hello');               // Error: 'Invalid slug format' (uppercase)
 * slug.parse('hello_world');         // Error: 'Invalid slug format' (underscore)
 * slug.parse('-hello');              // Error: 'Invalid slug format' (leading hyphen)
 * slug.parse('hello-');              // Error: 'Invalid slug format' (trailing hyphen)
 * slug.parse('hello--world');        // Error: 'Invalid slug format' (consecutive hyphens)
 * slug.parse('hello world');         // Error: 'Invalid slug format' (space)
 *
 * @returns A Zod schema that validates slug format strings
 */
export const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format');

/**
 * TypeScript type inferred from slug schema.
 * Represents a URL-friendly kebab-case string.
 */
export type Slug = z.infer<typeof slug>;
