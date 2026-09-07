/**
 * Date validation schemas
 *
 * Provides Zod schemas for validating dates with automatic coercion
 * from strings and numbers, plus date range validation.
 *
 * @module date.schema
 */

import { z } from 'zod';

/**
 * Preprocessor that converts null to undefined.
 *
 * Used with z.preprocess() to reject null values instead of coercing them
 * to unexpected defaults (e.g., z.coerce.date() converts null to Unix epoch).
 *
 * @param val - The input value to preprocess
 * @returns The original value, or undefined if null
 * @internal
 */
const rejectNull = (val: unknown): unknown => {
  if (val === null) {
    return undefined; // Let Zod handle as missing required value
  }
  return val;
};

/**
 * Date schema with automatic coercion.
 *
 * Coerces various input types to JavaScript Date objects.
 * Accepts strings, numbers (timestamps), and Date objects.
 *
 * Coercion rules:
 * - ISO 8601 strings → parsed to Date
 * - Unix timestamps (numbers) → converted to Date
 * - Date objects → passed through
 * - Invalid dates → throws ZodError
 *
 * @example
 * // Valid inputs - strings
 * dateSchema.parse('2024-01-15');                    // Returns: Date(2024-01-15)
 * dateSchema.parse('2024-01-15T10:30:00Z');          // Returns: Date with time
 * dateSchema.parse('2024-01-15T10:30:00.000Z');      // Returns: Date with ms
 * dateSchema.parse('2024-01-15T00:00:00Z');          // Returns: Date(2024-01-15)
 *
 * @example
 * // Valid inputs - numbers (Unix timestamp in ms)
 * dateSchema.parse(1705312200000);                   // Returns: Date(2024-01-15)
 * dateSchema.parse(0);                               // Returns: Date(1970-01-01)
 * dateSchema.parse(Date.now());                      // Returns: current Date
 *
 * @example
 * // Valid inputs - Date objects
 * dateSchema.parse(new Date());                      // Returns: the Date object
 * dateSchema.parse(new Date('2024-01-15'));          // Returns: Date(2024-01-15)
 *
 * @example
 * // Invalid inputs - throws ZodError
 * dateSchema.parse('not-a-date');                    // Error: 'Invalid date'
 * dateSchema.parse('');                              // Error: 'Invalid date'
 * dateSchema.parse('2024-13-45');                    // Error: 'Invalid date' (invalid month/day)
 * dateSchema.parse(null);                            // Error: 'Required' (null treated as missing)
 * dateSchema.parse(undefined);                       // Error: 'Required'
 *
 * @returns A Zod schema that coerces values to Date objects
 */
export const dateSchema = z.preprocess(rejectNull, z.coerce.date());

/** Inferred type for {@link dateSchema} schema */
export type DateSchemaType = z.infer<typeof dateSchema>;

/**
 * Date-time schema with automatic coercion.
 *
 * Functionally equivalent to {@link dateSchema} - coerces various input
 * types to JavaScript Date objects. The separate export provides semantic
 * clarity when working with timestamps that include time components.
 *
 * Coercion rules:
 * - ISO 8601 strings with time → parsed to Date with time
 * - Unix timestamps (numbers) → converted to Date
 * - Date objects → passed through
 *
 * @example
 * // Valid inputs - ISO 8601 with time
 * dateTimeSchema.parse('2024-01-15T10:30:00Z');      // Returns: Date with UTC time
 * dateTimeSchema.parse('2024-01-15T10:30:00+05:00'); // Returns: Date with timezone
 * dateTimeSchema.parse('2024-01-15T10:30:00.123Z');  // Returns: Date with milliseconds
 *
 * @example
 * // Valid inputs - timestamps
 * dateTimeSchema.parse(1705312200000);               // Returns: Date from timestamp
 * dateTimeSchema.parse(Date.now());                  // Returns: current Date
 *
 * @example
 * // Invalid inputs - throws ZodError
 * dateTimeSchema.parse('not-a-date');                // Error: 'Invalid date'
 * dateTimeSchema.parse('invalid');                   // Error: 'Invalid date'
 * dateTimeSchema.parse(null);                        // Error: 'Required' (null treated as missing)
 * dateTimeSchema.parse(undefined);                   // Error: 'Required'
 *
 * @returns A Zod schema that coerces values to Date objects
 */
export const dateTimeSchema = z.preprocess(rejectNull, z.coerce.date());

/** Inferred type for {@link dateTimeSchema} schema */
export type DateTimeSchemaType = z.infer<typeof dateTimeSchema>;

/**
 * Date range schema for start/end date pairs.
 *
 * Validates an object containing `start` and `end` date fields.
 * Both fields support automatic coercion from strings, numbers, or Date objects.
 * Does NOT validate that end is after start - use {@link validDateRangeSchema} for that.
 *
 * Schema structure:
 * - `start`: Date (coerced) - The beginning of the range
 * - `end`: Date (coerced) - The end of the range
 *
 * @example
 * // Valid inputs
 * dateRangeSchema.parse({
 *   start: '2024-01-01',
 *   end: '2024-12-31'
 * }); // Returns: { start: Date, end: Date }
 *
 * dateRangeSchema.parse({
 *   start: new Date('2024-01-01'),
 *   end: new Date('2024-01-31')
 * }); // Returns: { start: Date, end: Date }
 *
 * dateRangeSchema.parse({
 *   start: 1704067200000,
 *   end: 1735689600000
 * }); // Returns: { start: Date, end: Date }
 *
 * @example
 * // Note: Does NOT validate order - use validDateRangeSchema
 * dateRangeSchema.parse({
 *   start: '2024-12-31',
 *   end: '2024-01-01'
 * }); // Returns: { start: Date, end: Date } (end before start!)
 *
 * @example
 * // Invalid inputs - throws ZodError
 * dateRangeSchema.parse({});                         // Error: missing start and end
 * dateRangeSchema.parse({ start: '2024-01-01' });    // Error: missing end
 * dateRangeSchema.parse({ end: '2024-12-31' });      // Error: missing start
 * dateRangeSchema.parse({
 *   start: 'invalid',
 *   end: '2024-12-31'
 * }); // Error: 'Invalid date' for start
 *
 * @returns A Zod schema that validates date range objects
 */
export const dateRangeSchema = z.object({
  start: dateSchema,
  end: dateSchema
});

/** Inferred type for {@link dateRangeSchema} schema */
export type DateRangeSchemaType = z.infer<typeof dateRangeSchema>;

/**
 * Valid date range schema with order validation.
 *
 * Extends {@link dateRangeSchema} to ensure that `end` date is on or after
 * `start` date. Use this when chronological order matters.
 *
 * Validation rules:
 * - Must have `start` and `end` fields
 * - Both fields coerced to Date objects
 * - `end` must be >= `start`
 *
 * @example
 * // Valid inputs - end after start
 * validDateRangeSchema.parse({
 *   start: '2024-01-01',
 *   end: '2024-12-31'
 * }); // Returns: { start: Date, end: Date }
 *
 * // Valid inputs - same day range
 * validDateRangeSchema.parse({
 *   start: '2024-06-15',
 *   end: '2024-06-15'
 * }); // Returns: { start: Date, end: Date } (equal dates allowed)
 *
 * // Valid inputs - timestamps
 * validDateRangeSchema.parse({
 *   start: 1704067200000,
 *   end: 1735689600000
 * }); // Returns: { start: Date, end: Date }
 *
 * @example
 * // Invalid inputs - throws ZodError
 * validDateRangeSchema.parse({
 *   start: '2024-12-31',
 *   end: '2024-01-01'
 * }); // Error: 'End date must be on or after start date'
 *
 * validDateRangeSchema.parse({
 *   start: '2024-06-15T12:00:00Z',
 *   end: '2024-06-15T11:00:00Z'
 * }); // Error: 'End date must be on or after start date' (time matters!)
 *
 * @returns A Zod schema that validates chronologically ordered date ranges
 */
export const validDateRangeSchema = dateRangeSchema.refine((data) => data.end >= data.start, {
  message: 'End date must be on or after start date'
});

/** Inferred type for {@link validDateRangeSchema} schema */
export type ValidDateRangeSchemaType = z.infer<typeof validDateRangeSchema>;
