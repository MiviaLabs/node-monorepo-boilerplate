/**
 * Schema transformation helpers
 */

import { z } from 'zod';

/**
 * Creates a string schema that automatically trims whitespace from input.
 *
 * Uses Zod's built-in `.trim()` method to remove leading and trailing
 * whitespace from string values during parsing. Useful for form inputs
 * where users may accidentally include extra spaces.
 *
 * @returns A ZodString schema with trim transformation applied
 *
 * @example
 * // Basic trimming
 * import { trimmedString } from '@package/schema/helpers';
 *
 * const schema = trimmedString();
 * schema.parse('  hello world  '); // Returns: 'hello world'
 * schema.parse('\t\ntrimmed\n');   // Returns: 'trimmed'
 * schema.parse('no change');       // Returns: 'no change'
 *
 * @example
 * // Combined with other validations
 * const nameSchema = trimmedString().min(1, 'Name is required').max(100);
 *
 * nameSchema.parse('  John Doe  '); // Returns: 'John Doe'
 * nameSchema.parse('   ');          // Throws: 'Name is required' (empty after trim)
 *
 * @example
 * // In object schemas
 * const formSchema = z.object({
 *   firstName: trimmedString().min(1),
 *   lastName: trimmedString().min(1),
 *   bio: trimmedString().max(500).optional()
 * });
 *
 * formSchema.parse({
 *   firstName: '  Alice  ',
 *   lastName: '  Smith  ',
 *   bio: '  Developer  '
 * });
 * // Returns: { firstName: 'Alice', lastName: 'Smith', bio: 'Developer' }
 */
export function trimmedString(): z.ZodString {
  return z.string().trim();
}

/**
 * Creates a string schema that transforms input to lowercase.
 *
 * Applies a transformation to convert all characters to lowercase
 * after basic string validation. Commonly used for case-insensitive
 * fields like email addresses or usernames.
 *
 * @returns A Zod schema that validates strings and transforms them to lowercase.
 *          The return type is `z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>`.
 *
 * @example
 * // Basic lowercase transformation
 * import { lowercaseString } from '@package/schema/helpers';
 *
 * const schema = lowercaseString();
 * schema.parse('HELLO');      // Returns: 'hello'
 * schema.parse('MixedCase');  // Returns: 'mixedcase'
 * schema.parse('already');    // Returns: 'already'
 *
 * @example
 * // Email normalization
 * const emailSchema = lowercaseString().email();
 * // Note: This won't work because .email() doesn't exist on ZodPipe/ZodTransform
 *
 * // Instead, use:
 * const emailSchema = z.string().email().transform(val => val.toLowerCase());
 * // Or combine manually:
 * const emailSchema = z.string().email().toLowerCase(); // Built-in Zod method
 *
 * @example
 * // Usernames and slugs
 * const usernameSchema = z.object({
 *   username: lowercaseString()
 * });
 *
 * usernameSchema.parse({ username: 'JohnDoe123' });
 * // Returns: { username: 'johndoe123' }
 *
 * @example
 * // Combining with pipe for additional validation
 * const validatedLowercase = lowercaseString().pipe(
 *   z.string().min(3).max(20)
 * );
 *
 * validatedLowercase.parse('ABC'); // Returns: 'abc'
 */
export function lowercaseString(): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>> {
  return z.string().transform((val) => val.toLowerCase());
}

/**
 * Creates a string schema that transforms input to uppercase.
 *
 * Applies a transformation to convert all characters to uppercase
 * after basic string validation. Useful for codes, identifiers,
 * or fields that require uppercase normalization.
 *
 * @returns A Zod schema that validates strings and transforms them to uppercase.
 *          The return type is `z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>`.
 *
 * @example
 * // Basic uppercase transformation
 * import { uppercaseString } from '@package/schema/helpers';
 *
 * const schema = uppercaseString();
 * schema.parse('hello');      // Returns: 'HELLO'
 * schema.parse('MixedCase');  // Returns: 'MIXEDCASE'
 * schema.parse('ALREADY');    // Returns: 'ALREADY'
 *
 * @example
 * // Country codes
 * const countryCodeSchema = z.object({
 *   countryCode: uppercaseString()
 * });
 *
 * countryCodeSchema.parse({ countryCode: 'us' });
 * // Returns: { countryCode: 'US' }
 *
 * @example
 * // Stock symbols
 * const stockSchema = z.object({
 *   symbol: uppercaseString()
 * });
 *
 * stockSchema.parse({ symbol: 'aapl' });
 * // Returns: { symbol: 'AAPL' }
 *
 * @example
 * // Combining with pipe for length validation
 * const isoCodeSchema = uppercaseString().pipe(
 *   z.string().length(2)
 * );
 *
 * isoCodeSchema.parse('us'); // Returns: 'US'
 * isoCodeSchema.parse('usa'); // Throws: String must contain exactly 2 character(s)
 */
export function uppercaseString(): z.ZodPipe<z.ZodString, z.ZodTransform<string, string>> {
  return z.string().transform((val) => val.toUpperCase());
}
