/**
 * Core Result types and functions
 *
 * This module provides the fundamental Result pattern for domain operations,
 * following functional programming principles for explicit error handling.
 *
 * @module domain/result.core
 */

/**
 * Result type for domain operations.
 *
 * Represents either success with a value or failure with an error. This
 * pattern eliminates exceptions for expected error cases and makes error
 * handling explicit in the type system.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value (defaults to Error)
 *
 * @example
 * ```typescript
 * // Function returning Result
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return failure('Cannot divide by zero');
 *   }
 *   return success(a / b);
 * }
 *
 * // Pattern matching on Result
 * const result = divide(10, 2);
 * if (isSuccess(result)) {
 *   console.log('Result:', result.value); // 5
 * } else {
 *   console.error('Error:', result.error);
 * }
 * ```
 *
 * @see {@link success} for creating success results
 * @see {@link failure} for creating failure results
 */
export type Result<T, E = Error> = { success: true; value: T } | { success: false; error: E };

/**
 * Creates a success Result with the given value.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value (for type compatibility)
 * @param value - The success value to wrap
 * @returns A success Result containing the value
 *
 * @example
 * ```typescript
 * // Simple success
 * const result = success(42);
 * console.log(result.value); // 42
 *
 * // With explicit type
 * const userResult = success<User, DomainError>(newUser);
 *
 * // In repository operations
 * async function findUser(id: string): Promise<Result<User | null, Error>> {
 *   const user = await db.users.findById(id);
 *   return success(user);
 * }
 * ```
 *
 * @see {@link Result} for the Result type
 * @see {@link failure} for creating failure results
 */
export const success = <T, E = Error>(value: T): Result<T, E> => ({
  success: true,
  value
});

/**
 * Creates a failure Result with the given error.
 *
 * @template E - The type of the error value
 * @param error - The error value to wrap
 * @returns A failure Result containing the error
 *
 * @example
 * ```typescript
 * // Simple failure with string error
 * const result = failure('Something went wrong');
 *
 * // With Error object
 * const errorResult = failure(new Error('Database connection failed'));
 *
 * // With custom domain error
 * const domainResult = failure(new DomainError('VALIDATION_FAILED', {
 *   field: 'email',
 *   message: 'Invalid email format',
 * }));
 * ```
 *
 * @see {@link Result} for the Result type
 * @see {@link success} for creating success results
 */
export const failure = <E = Error>(error: E): Result<never, E> => ({
  success: false,
  error
});

/**
 * Type guard to check if a Result is a success.
 *
 * When this returns true, TypeScript narrows the type to the success variant,
 * allowing safe access to the `value` property.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value
 * @param result - The Result to check
 * @returns True if the Result is a success, false otherwise
 *
 * @example
 * ```typescript
 * const result = fetchUser('user-123');
 *
 * if (isSuccess(result)) {
 *   // TypeScript knows result.value exists here
 *   console.log(result.value.name);
 * }
 *
 * // Using in filter operations
 * const results = await Promise.all(userIds.map(fetchUser));
 * const successfulUsers = results
 *   .filter(isSuccess)
 *   .map(r => r.value);
 * ```
 *
 * @see {@link isFailure} for the opposite check
 * @see {@link Result} for the Result type
 */
export const isSuccess = <T, E>(result: Result<T, E>): result is { success: true; value: T } =>
  result.success;

/**
 * Type guard to check if a Result is a failure.
 *
 * When this returns true, TypeScript narrows the type to the failure variant,
 * allowing safe access to the `error` property.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value
 * @param result - The Result to check
 * @returns True if the Result is a failure, false otherwise
 *
 * @example
 * ```typescript
 * const result = createUser(userData);
 *
 * if (isFailure(result)) {
 *   // TypeScript knows result.error exists here
 *   logger.error('Failed to create user:', result.error);
 *   return;
 * }
 *
 * // Continue with result.value...
 * ```
 *
 * @see {@link isSuccess} for the opposite check
 * @see {@link Result} for the Result type
 */
export const isFailure = <T, E>(result: Result<T, E>): result is { success: false; error: E } =>
  !result.success;

/**
 * Transforms the success value of a Result using a mapping function.
 *
 * If the Result is a success, applies the function to the value and wraps
 * the result in a new success. If it's a failure, returns the failure unchanged.
 *
 * @template T - The original success value type
 * @template U - The transformed success value type
 * @template E - The error type
 * @param result - The Result to transform
 * @param fn - The function to apply to the success value
 * @returns A new Result with the transformed value or the original error
 *
 * @example
 * ```typescript
 * // Transform a number result to string
 * const numResult: Result<number, string> = success(42);
 * const strResult = map(numResult, n => `The answer is ${n}`);
 * // strResult.value === "The answer is 42"
 *
 * // Chain transformations
 * const userResult = await fetchUser(id);
 * const nameResult = map(userResult, user => user.name);
 * const upperResult = map(nameResult, name => name.toUpperCase());
 *
 * // Failure passes through unchanged
 * const failResult: Result<number, string> = failure('error');
 * const mapped = map(failResult, n => n * 2);
 * // mapped is still failure('error')
 * ```
 *
 * @see {@link flatMap} for transformations that return Results
 */
export const map = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> => {
  if (isSuccess(result)) {
    return success<U, E>(fn(result.value));
  }
  return result;
};

/**
 * Chains Result-returning operations (also known as bind or chain).
 *
 * If the Result is a success, applies the function to get a new Result.
 * If it's a failure, returns the failure unchanged. This is useful for
 * sequencing operations that may each fail.
 *
 * @template T - The original success value type
 * @template U - The new success value type
 * @template E - The error type
 * @param result - The Result to transform
 * @param fn - The function that returns a new Result
 * @returns The new Result or the original error
 *
 * @example
 * ```typescript
 * // Chain operations that may fail
 * function parseNumber(str: string): Result<number, string> {
 *   const n = parseFloat(str);
 *   if (isNaN(n)) return failure('Not a number');
 *   return success(n);
 * }
 *
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return failure('Division by zero');
 *   return success(a / b);
 * }
 *
 * // Chain: parse -> divide
 * const parseResult = parseNumber('100');
 * const divideResult = flatMap(parseResult, n => divide(n, 4));
 * // divideResult.value === 25
 *
 * // Error short-circuits
 * const errorResult = parseNumber('not a number');
 * const chainedError = flatMap(errorResult, n => divide(n, 4));
 * // chainedError.error === 'Not a number'
 * ```
 *
 * @see {@link map} for transformations that don't return Results
 */
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> => {
  if (isSuccess(result)) {
    return fn(result.value);
  }
  return result;
};
