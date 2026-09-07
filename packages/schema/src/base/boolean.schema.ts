/**
 * Boolean validation schemas
 *
 * Provides Zod schemas for validating boolean values with different
 * coercion behaviors - automatic type coercion vs strict boolean only.
 *
 * @module boolean.schema
 */

import { z } from 'zod';

/**
 * Boolean schema with automatic type coercion.
 *
 * Coerces various input types to boolean values using JavaScript's
 * truthy/falsy rules. Useful for handling form inputs, query parameters,
 * or data from external sources.
 *
 * Coercion rules (JavaScript truthiness):
 * - Truthy values → `true`: non-empty strings, non-zero numbers, objects, arrays
 * - Falsy values → `false`: `0`, `''`, `null`, `undefined`, `NaN`
 * - Boolean values pass through unchanged
 *
 * @example
 * // Truthy inputs → true
 * booleanSchema.parse(true);         // Returns: true
 * booleanSchema.parse(1);            // Returns: true
 * booleanSchema.parse('true');       // Returns: true
 * booleanSchema.parse('false');      // Returns: true (non-empty string!)
 * booleanSchema.parse('yes');        // Returns: true (non-empty string)
 * booleanSchema.parse({});           // Returns: true (object)
 * booleanSchema.parse([]);           // Returns: true (array)
 * booleanSchema.parse(-1);           // Returns: true (non-zero)
 *
 * @example
 * // Falsy inputs → false
 * booleanSchema.parse(false);        // Returns: false
 * booleanSchema.parse(0);            // Returns: false
 * booleanSchema.parse('');           // Returns: false (empty string)
 * booleanSchema.parse(null);         // Returns: false
 * booleanSchema.parse(undefined);    // Returns: false
 * booleanSchema.parse(NaN);          // Returns: false
 *
 * @returns A Zod schema that coerces values to boolean
 *
 * @remarks
 * **Warning:** String 'false' coerces to `true` because it's a non-empty string.
 * If you need to parse string representations of booleans, use a custom
 * transform or the strict schema with pre-processing.
 */
export const booleanSchema = z.coerce.boolean();

/** Inferred type for {@link booleanSchema} schema */
export type BooleanSchemaType = z.infer<typeof booleanSchema>;

/**
 * Strict boolean schema without coercion.
 *
 * Only accepts actual JavaScript boolean values (`true` or `false`).
 * Use this when you need strict type checking and want to reject
 * any non-boolean input.
 *
 * Validation rules:
 * - Must be exactly `true` or `false`
 * - No type coercion
 * - Rejects all other types including truthy/falsy values
 *
 * @example
 * // Valid inputs
 * strictBooleanSchema.parse(true);   // Returns: true
 * strictBooleanSchema.parse(false);  // Returns: false
 *
 * @example
 * // Invalid inputs - throws ZodError
 * strictBooleanSchema.parse(1);      // Error: 'Expected boolean, received number'
 * strictBooleanSchema.parse(0);      // Error: 'Expected boolean, received number'
 * strictBooleanSchema.parse('true'); // Error: 'Expected boolean, received string'
 * strictBooleanSchema.parse('false');// Error: 'Expected boolean, received string'
 * strictBooleanSchema.parse(null);   // Error: 'Expected boolean, received null'
 * strictBooleanSchema.parse(undefined); // Error: 'Required'
 * strictBooleanSchema.parse({});     // Error: 'Expected boolean, received object'
 *
 * @returns A Zod schema that validates strict boolean values only
 */
export const strictBooleanSchema = z.boolean();

/** Inferred type for {@link strictBooleanSchema} schema */
export type StrictBooleanSchemaType = z.infer<typeof strictBooleanSchema>;
