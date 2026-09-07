/**
 * Async Result utilities
 *
 * This module provides types and functions for working with asynchronous
 * Result operations, including Promise-to-Result conversion and sequencing.
 *
 * @module domain/result.async
 */

import { success, failure, isSuccess, type Result } from './result.core';

/**
 * Async result type for asynchronous operations.
 *
 * A Promise that resolves to a Result, combining async/await with
 * the Result pattern.
 *
 * @template T - The success value type
 * @template E - The error type (defaults to Error)
 *
 * @example
 * ```typescript
 * // Define async operation returning Result
 * async function fetchUser(id: string): AsyncResult<User, ApiError> {
 *   try {
 *     const response = await fetch(`/api/users/${id}`);
 *     if (!response.ok) {
 *       return failure(new ApiError(response.status));
 *     }
 *     const user = await response.json();
 *     return success(user);
 *   } catch (error) {
 *     return failure(new ApiError(500, error));
 *   }
 * }
 *
 * // Use with await
 * const result = await fetchUser('user-123');
 * if (isSuccess(result)) {
 *   console.log(result.value.name);
 * }
 * ```
 *
 * @see {@link Result} for synchronous Results
 * @see {@link fromPromise} for converting Promises to AsyncResult
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Converts a Promise to an AsyncResult, catching any errors.
 *
 * Wraps a Promise so that rejection becomes a failure Result instead
 * of an uncaught exception.
 *
 * @template T - The success value type
 * @template E - The error type (defaults to Error)
 * @param promise - The Promise to convert
 * @param errorFn - Function to convert caught errors to the error type
 * @returns An AsyncResult that never rejects
 *
 * @example
 * ```typescript
 * // Convert fetch to AsyncResult
 * const result = await fromPromise(
 *   fetch('/api/data').then(r => r.json()),
 *   (error) => new NetworkError(error)
 * );
 *
 * // Convert database operation
 * const dbResult = await fromPromise(
 *   db.users.create({ email }),
 *   (error) => {
 *     if (isUniqueViolation(error)) {
 *       return new DomainError('EMAIL_EXISTS');
 *     }
 *     return new DomainError('DB_ERROR', error);
 *   }
 * );
 *
 * // Handle any Promise-based library
 * const s3Result = await fromPromise(
 *   s3.upload(file),
 *   (error) => new StorageError('Upload failed', error)
 * );
 * ```
 *
 * @see {@link AsyncResult} for the async Result type
 * @see {@link tryCatch} for synchronous version
 */
export const fromPromise = async <T, E = Error>(
  promise: Promise<T>,
  errorFn: (error: unknown) => E
): AsyncResult<T, E> => {
  try {
    const value = await promise;
    return success<T, E>(value);
  } catch (error) {
    return failure(errorFn(error));
  }
};

/**
 * Sequences an array of AsyncResults into a single AsyncResult.
 *
 * Executes all promises in parallel using `Promise.allSettled` and waits for
 * all to settle before returning. Unlike `Promise.all`, this does NOT
 * short-circuit - all async operations run to completion regardless of
 * failures.
 *
 * After all promises settle, collects all failures and returns the first
 * error encountered (in array order) or an array of all success values if
 * none failed.
 *
 * Note: AsyncResults created via {@link fromPromise} should never reject.
 * If a promise does reject (indicating a programming error), provide a
 * `mapRejection` function to safely convert the unknown rejection reason
 * to your error type E.
 *
 * This function has two overloads:
 * - Without `mapRejection`: E must be Error type
 * - With `mapRejection`: E can be any custom error type
 *
 * @template T - The success value type
 * @template E - The error type
 * @returns A single Result containing array of values or first error
 *
 * @example
 * ```typescript
 * // Fetch multiple resources in parallel (all requests complete)
 * // When E is Error, mapRejection is optional
 * const userResults = userIds.map(id => fetchUser(id));
 * const combined = await sequence(userResults);
 *
 * if (isSuccess(combined)) {
 *   const users = combined.value;
 *   // All fetches succeeded
 * } else {
 *   // At least one fetch failed (all requests still completed)
 *   console.error(combined.error);
 * }
 *
 * // With custom error type, mapRejection is required
 * const results = await sequence(
 *   promises,
 *   (reason) => new ApiError('Unexpected rejection', reason)
 * );
 * ```
 *
 * @see {@link combine} for synchronous version with same semantics
 * @see {@link AsyncResult} for the async Result type alias
 */
// Overload: Without mapRejection, E must be Error
export function sequence<T>(results: AsyncResult<T, Error>[]): Promise<Result<T[], Error>>;
// Overload: With mapRejection, E can be any type
export function sequence<T, E>(
  results: AsyncResult<T, E>[],
  mapRejection: (reason: unknown) => E
): Promise<Result<T[], E>>;
// Implementation
export async function sequence<T, E = Error>(
  results: AsyncResult<T, E>[],
  mapRejection?: (reason: unknown) => E
): Promise<Result<T[], E>> {
  // Use Promise.allSettled to handle promise rejections defensively
  // This ensures sequence never throws and always resolves to a Result
  const settled = await Promise.allSettled(results);

  const values: T[] = [];
  const errors: E[] = [];

  for (const entry of settled) {
    if (entry.status === 'rejected') {
      // Promise rejected unexpectedly - AsyncResults should never reject
      if (mapRejection) {
        // Use the provided mapper for custom error types
        errors.push(mapRejection(entry.reason));
      } else {
        // When mapRejection is not provided, the overload guarantees E is Error
        // so this cast is safe - the type system enforces this at call sites
        const wrappedError =
          entry.reason instanceof Error ? entry.reason : new Error(String(entry.reason));
        errors.push(wrappedError as E);
      }
    } else if (isSuccess(entry.value)) {
      values.push(entry.value.value);
    } else {
      errors.push(entry.value.error);
    }
  }

  const firstError = errors[0];
  if (firstError !== undefined) {
    return failure(firstError);
  }

  return success<T[], E>(values);
}

/**
 * Wraps a synchronous function in try-catch and returns a Result.
 *
 * Useful for operations that may throw, like JSON parsing or
 * accessing properties that might be undefined.
 *
 * @template T - The success value type
 * @template E - The error type (defaults to Error)
 * @param fn - The function to execute
 * @param errorFn - Function to convert caught errors to the error type
 * @returns A Result containing the return value or the error
 *
 * @example
 * ```typescript
 * // Safe JSON parsing
 * const parseJson = (str: string) => tryCatch(
 *   () => JSON.parse(str),
 *   (error) => new ParseError('Invalid JSON', error)
 * );
 *
 * const result = parseJson('{"valid": true}');
 * // result.value === { valid: true }
 *
 * const invalidResult = parseJson('not json');
 * // invalidResult.error instanceof ParseError
 *
 * // Safe property access
 * const getValue = (obj: unknown, path: string) => tryCatch(
 *   () => {
 *     const value = get(obj, path);
 *     if (value === undefined) throw new Error('Path not found');
 *     return value;
 *   },
 *   (error) => new AccessError(path, error)
 * );
 * ```
 *
 * @see {@link fromPromise} for async version
 */
export const tryCatch = <T, E = Error>(
  fn: () => T,
  errorFn: (error: unknown) => E
): Result<T, E> => {
  try {
    return success<T, E>(fn());
  } catch (error) {
    return failure(errorFn(error));
  }
};
