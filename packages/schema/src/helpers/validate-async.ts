/**
 * Async validation helpers
 */

import { z } from 'zod';

/**
 * Successful async validation result.
 */
export interface AsyncValidationSuccess<T> {
  /** Indicates successful validation */
  success: true;
  /** The validated and transformed data */
  data: T;
  /** Not present on success */
  errors?: never;
}

/**
 * Failed async validation result.
 */
export interface AsyncValidationFailure {
  /** Indicates failed validation */
  success: false;
  /** Not present on failure */
  data?: never;
  /** Array of validation errors with field paths and messages */
  errors: Array<{ field: string; message: string }>;
}

/**
 * Discriminated union result type for async validation.
 */
export type AsyncValidationResult<T> = AsyncValidationSuccess<T> | AsyncValidationFailure;

/**
 * Validates data against a Zod schema asynchronously, supporting async refinements.
 *
 * Use this function when your schema includes async operations such as database
 * lookups, API calls, or other async refinements. Returns a result object rather
 * than throwing, making it easier to handle validation failures gracefully.
 *
 * @typeParam T - The inferred type from the Zod schema
 * @param schema - The Zod schema to validate against (may contain async refinements)
 * @param data - The unknown data to parse and validate
 * @returns A Promise resolving to a discriminated union:
 *          `{ success: true, data: T }` on successful validation,
 *          or `{ success: false, errors: Array<{ field: string; message: string }> }` on failure
 * @throws {Error} Non-ZodError exceptions are re-thrown. This includes errors from
 *         async refinements that throw non-validation errors (e.g., database connection
 *         failures, network errors).
 *
 * @example
 * // Basic async validation with database check
 * import { z } from 'zod';
 * import { validateAsync } from '@package/schema/helpers';
 *
 * const uniqueEmailSchema = z.object({
 *   email: z.string().email()
 * }).refine(
 *   async (data) => {
 *     const exists = await db.users.exists({ email: data.email });
 *     return !exists;
 *   },
 *   { message: 'Email already registered' }
 * );
 *
 * const result = await validateAsync(uniqueEmailSchema, { email: 'user@example.com' });
 * if (result.success) {
 *   // result.data is typed: { email: string }
 *   await createUser(result.data);
 * } else {
 *   console.log(result.errors);
 *   // [{ field: '', message: 'Email already registered' }]
 * }
 *
 * @example
 * // Multiple async refinements
 * const registrationSchema = z.object({
 *   username: z.string().min(3),
 *   email: z.string().email()
 * }).superRefine(async (data, ctx) => {
 *   const [usernameExists, emailExists] = await Promise.all([
 *     db.users.exists({ username: data.username }),
 *     db.users.exists({ email: data.email })
 *   ]);
 *
 *   if (usernameExists) {
 *     ctx.addIssue({
 *       code: z.ZodIssueCode.custom,
 *       message: 'Username already taken',
 *       path: ['username']
 *     });
 *   }
 *   if (emailExists) {
 *     ctx.addIssue({
 *       code: z.ZodIssueCode.custom,
 *       message: 'Email already registered',
 *       path: ['email']
 *     });
 *   }
 * });
 *
 * const result = await validateAsync(registrationSchema, formData);
 *
 * @example
 * // Handling non-validation errors
 * const schemaWithApiCheck = z.string().refine(async (val) => {
 *   // This might throw a network error
 *   const response = await fetch(`/api/validate?value=${val}`);
 *   return response.ok;
 * });
 *
 * try {
 *   const result = await validateAsync(schemaWithApiCheck, 'test');
 *   // Handle success or validation errors
 * } catch (error) {
 *   // Network errors, timeouts, etc. are re-thrown here
 *   console.error('Validation infrastructure error:', error);
 * }
 *
 * @example
 * // Using with async transforms
 * const enrichedUserSchema = z.object({
 *   userId: z.string().uuid()
 * }).transform(async (data) => {
 *   const user = await db.users.findById(data.userId);
 *   return { ...data, user };
 * });
 *
 * const result = await validateAsync(enrichedUserSchema, { userId: '...' });
 * if (result.success) {
 *   console.log(result.data.user); // Enriched with user data
 * }
 */
export async function validateAsync<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<AsyncValidationResult<T>> {
  try {
    const result = await schema.parseAsync(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      };
    }
    throw error;
  }
}
