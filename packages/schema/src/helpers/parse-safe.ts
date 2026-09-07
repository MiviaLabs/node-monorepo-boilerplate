/**
 * Safe parse helpers
 */

import type { z } from 'zod';

/**
 * Successful parse result.
 */
export interface ParseSuccessResult<T> {
  /** Indicates successful parsing */
  success: true;
  /** The validated and transformed data */
  data: T;
  /** Not present on success */
  errors?: never;
}

/**
 * Failed parse result.
 */
export interface ParseFailureResult {
  /** Indicates failed parsing */
  success: false;
  /** Not present on failure */
  data?: never;
  /** Array of validation errors with field paths and messages */
  errors: Array<{ field: string; message: string }>;
}

/**
 * Discriminated union result type for safe parsing.
 */
export type ParseResult<T> = ParseSuccessResult<T> | ParseFailureResult;

/**
 * Safely parses data against a Zod schema, returning a discriminated union result.
 *
 * Unlike `schema.parse()` which throws on failure, this function returns a result
 * object that can be used for type-safe error handling. The result includes either
 * the validated data or an array of structured errors.
 *
 * @typeParam T - The inferred type from the Zod schema
 * @param schema - The Zod schema to validate against
 * @param data - The unknown data to parse and validate
 * @returns A discriminated union: `{ success: true, data: T }` on success,
 *          or `{ success: false, errors: Array<{field?, message}> }` on failure
 *
 * @example
 * // Success case - data is typed correctly
 * import { z } from 'zod';
 * import { parseSafe } from '@package/schema/helpers';
 *
 * const userSchema = z.object({
 *   name: z.string(),
 *   age: z.number().min(0)
 * });
 *
 * const result = parseSafe(userSchema, { name: 'John', age: 25 });
 * if (result.success) {
 *   console.log(result.data.name); // 'John' - fully typed
 *   console.log(result.data.age);  // 25
 * }
 *
 * @example
 * // Failure case - access validation errors
 * const result = parseSafe(userSchema, { name: '', age: -5 });
 * if (!result.success) {
 *   console.log(result.errors);
 *   // [
 *   //   { field: 'name', message: 'String must contain at least 1 character(s)' },
 *   //   { field: 'age', message: 'Number must be greater than or equal to 0' }
 *   // ]
 * }
 *
 * @example
 * // Using in API request handlers
 * app.post('/users', (req, res) => {
 *   const result = parseSafe(createUserSchema, req.body);
 *
 *   if (!result.success) {
 *     return res.status(400).json({
 *       error: 'Invalid request body',
 *       validationErrors: result.errors
 *     });
 *   }
 *
 *   // result.data is fully typed here
 *   const user = await createUser(result.data);
 *   return res.status(201).json(user);
 * });
 *
 * @example
 * // Handling nested object validation
 * const orderSchema = z.object({
 *   items: z.array(z.object({
 *     productId: z.string().uuid(),
 *     quantity: z.number().positive()
 *   }))
 * });
 *
 * const result = parseSafe(orderSchema, {
 *   items: [{ productId: 'invalid', quantity: -1 }]
 * });
 * if (!result.success) {
 *   // errors[0].field === 'items.0.productId'
 *   // errors[1].field === 'items.0.quantity'
 * }
 */
export function parseSafe<T>(schema: z.ZodSchema<T>, data: unknown): ParseResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message
    }))
  };
}

/**
 * Parses data against a Zod schema, throwing a ZodError on validation failure.
 *
 * A thin wrapper around `schema.parse()` that provides consistent error handling.
 * Use this when you want validation errors to propagate as exceptions, such as
 * in middleware or when validation failure should halt execution.
 *
 * @typeParam T - The inferred type from the Zod schema
 * @param schema - The Zod schema to validate against
 * @param data - The unknown data to parse and validate
 * @returns The validated and transformed data of type T
 * @throws {ZodError} When validation fails. The error contains an `issues` array
 *         with details about each validation failure including path, message, and code.
 *
 * @example
 * // Basic usage with try/catch
 * import { z } from 'zod';
 * import { parseOrThrow } from '@package/schema/helpers';
 *
 * const schema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8)
 * });
 *
 * try {
 *   const data = parseOrThrow(schema, req.body);
 *   // data is fully typed: { email: string, password: string }
 *   await loginUser(data.email, data.password);
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     console.error('Validation failed:', error.issues);
 *   }
 *   throw error;
 * }
 *
 * @example
 * // Using in middleware
 * const validateBody = <T>(schema: z.ZodSchema<T>) => {
 *   return (req, res, next) => {
 *     try {
 *       req.validatedBody = parseOrThrow(schema, req.body);
 *       next();
 *     } catch (error) {
 *       if (error instanceof z.ZodError) {
 *         return res.status(400).json({ errors: error.issues });
 *       }
 *       next(error);
 *     }
 *   };
 * };
 *
 * @example
 * // With transformations - returned data is transformed
 * const schema = z.object({
 *   email: z.string().email().toLowerCase()
 * });
 *
 * const data = parseOrThrow(schema, { email: 'USER@EXAMPLE.COM' });
 * console.log(data.email); // 'user@example.com'
 */
export function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
