/**
 * Error formatting utilities for Zod validation
 */

import type { ZodError } from 'zod';

/**
 * Formatted validation error structure for API responses.
 */
export interface IFormattedError {
  /** Dot-notation path to the field (e.g., "user.email", "items.0.name", "" for root) */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Zod error code (e.g., "invalid_type", "too_small", "custom") */
  code?: string;
}

/**
 * Formats a ZodError into an array of structured error objects for API responses.
 *
 * Transforms Zod validation errors into a consistent format suitable for
 * returning in API error responses. Each validation issue becomes a separate
 * error object with field path, message, and error code.
 *
 * @param error - The ZodError instance from a failed validation
 * @returns Array of formatted error objects with field, message, and code
 *
 * @example
 * // Basic usage with schema validation
 * import { z } from 'zod';
 * import { formatZodError } from '@package/schema/helpers';
 *
 * const schema = z.object({
 *   email: z.string().email(),
 *   age: z.number().min(18)
 * });
 *
 * const result = schema.safeParse({ email: 'invalid', age: 10 });
 * if (!result.success) {
 *   const errors = formatZodError(result.error);
 *   // Returns:
 *   // [
 *   //   { field: 'email', message: 'Invalid email', code: 'invalid_string' },
 *   //   { field: 'age', message: 'Number must be greater than or equal to 18', code: 'too_small' }
 *   // ]
 * }
 *
 * @example
 * // Using in an API error response
 * app.post('/users', (req, res) => {
 *   const result = createUserSchema.safeParse(req.body);
 *   if (!result.success) {
 *     return res.status(400).json({
 *       error: 'Validation failed',
 *       details: formatZodError(result.error)
 *     });
 *   }
 * });
 *
 * @example
 * // Handling nested object errors
 * const addressSchema = z.object({
 *   user: z.object({
 *     address: z.object({
 *       zipCode: z.string().length(5)
 *     })
 *   })
 * });
 *
 * const result = addressSchema.safeParse({ user: { address: { zipCode: '123' } } });
 * if (!result.success) {
 *   const errors = formatZodError(result.error);
 *   // Returns: [{ field: 'user.address.zipCode', message: 'String must contain exactly 5 character(s)', code: 'too_small' }]
 * }
 */
export function formatZodError(error: ZodError<unknown>): IFormattedError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code
  }));
}

/**
 * Formats a ZodError into a single comma-separated error message string.
 *
 * Useful for logging, simple error displays, or contexts where a single
 * string message is preferred over structured error data. Each error is
 * formatted as "field: message" and joined with commas.
 *
 * @param error - The ZodError instance from a failed validation
 * @returns A single string containing all error messages, comma-separated
 *
 * @example
 * // Basic usage
 * import { z } from 'zod';
 * import { formatZodErrorMessage } from '@package/schema/helpers';
 *
 * const schema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email()
 * });
 *
 * const result = schema.safeParse({ name: '', email: 'bad' });
 * if (!result.success) {
 *   const message = formatZodErrorMessage(result.error);
 *   // Returns: "name: String must contain at least 1 character(s), email: Invalid email"
 * }
 *
 * @example
 * // Using in error logging
 * try {
 *   schema.parse(invalidData);
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     console.error('Validation failed:', formatZodErrorMessage(error));
 *   }
 * }
 *
 * @example
 * // Handling root-level errors (empty field path)
 * const schema = z.string().min(5);
 * const result = schema.safeParse('hi');
 * if (!result.success) {
 *   const message = formatZodErrorMessage(result.error);
 *   // Returns: ": String must contain at least 5 character(s)"
 *   // Note: Empty field path results in leading colon
 * }
 */
export function formatZodErrorMessage(error: ZodError<unknown>): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
}
