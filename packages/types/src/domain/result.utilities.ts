/**
 * Result utility functions
 *
 * This module provides utility functions for working with Result types,
 * including error transformation, value extraction, and combining Results.
 *
 * @module domain/result.utilities
 */

import { success, failure, isSuccess, isFailure, type Result } from './result.core';

/**
 * Transforms the error value of a Result using a mapping function.
 *
 * If the Result is a failure, applies the function to the error and wraps
 * the result in a new failure. If it's a success, returns the success unchanged.
 *
 * @template T - The success value type
 * @template E - The original error type
 * @template F - The transformed error type
 * @param result - The Result to transform
 * @param fn - The function to apply to the error
 * @returns A new Result with the transformed error or the original value
 *
 * @example
 * ```typescript
 * // Transform string error to Error object
 * const result: Result<number, string> = failure('Something failed');
 * const errorMapped = mapError(result, msg => new Error(msg));
 *
 * // Add context to errors
 * const dbResult = await queryDatabase();
 * const contextResult = mapError(dbResult, err => ({
 *   original: err,
 *   context: 'Failed while querying user table',
 *   timestamp: new Date(),
 * }));
 * ```
 *
 * @see {@link map} for transforming success values
 */
export const mapError = <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> => {
  if (isFailure(result)) {
    return failure(fn(result.error));
  }
  return success<T, F>(result.value);
};

/**
 * Extracts the success value or returns a default value.
 *
 * @template T - The success value type
 * @template E - The error type
 * @param result - The Result to extract from
 * @param defaultValue - The value to return if Result is a failure
 * @returns The success value or the default value
 *
 * @example
 * ```typescript
 * // Provide default for missing configuration
 * const configResult = loadConfig('timeout');
 * const timeout = getOrElse(configResult, 5000);
 *
 * // Use with optional user preferences
 * const themeResult = getUserTheme(userId);
 * const theme = getOrElse(themeResult, 'light');
 * ```
 *
 * @see {@link getOrThrow} for throwing on failure
 */
export const getOrElse = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  if (isSuccess(result)) {
    return result.value;
  }
  return defaultValue;
};

/**
 * Extracts the success value or throws the error.
 *
 * Use this sparingly - it reintroduces exceptions. Prefer handling
 * both cases explicitly when possible.
 *
 * @template T - The success value type
 * @template E - The error type (must extend Error)
 * @param result - The Result to extract from
 * @returns The success value
 * @throws The error if Result is a failure
 *
 * @example
 * ```typescript
 * // At application boundaries where exceptions are acceptable
 * try {
 *   const user = getOrThrow(await createUser(data));
 *   return { status: 'created', user };
 * } catch (error) {
 *   return { status: 'error', message: error.message };
 * }
 *
 * // In tests where failure should fail the test
 * const result = getOrThrow(validateInput(testData));
 * expect(result).toBeDefined();
 * ```
 *
 * @see {@link getOrElse} for providing default values
 */
export const getOrThrow = <T, E extends Error>(result: Result<T, E>): T => {
  if (isSuccess(result)) {
    return result.value;
  }
  throw result.error;
};

/**
 * Combines multiple Results into a single Result containing an array.
 *
 * Returns success with all values if all Results are successful.
 * Returns the first error encountered if any Result fails (fail-fast).
 *
 * @template T - The success value type
 * @template E - The error type
 * @param results - Array of Results to combine
 * @returns A Result containing array of values or the first error
 *
 * @example
 * ```typescript
 * // Validate multiple fields, fail on first error
 * const results = [
 *   validateEmail(email),
 *   validatePassword(password),
 *   validateAge(age),
 * ];
 * const combined = combine(results);
 *
 * if (isSuccess(combined)) {
 *   const [validEmail, validPassword, validAge] = combined.value;
 *   // All validations passed
 * } else {
 *   // First validation error
 *   console.error(combined.error);
 * }
 * ```
 *
 * @see {@link combineAll} for collecting all errors
 * @see {@link sequence} for async Results
 */
export const combine = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];

  for (const result of results) {
    if (isSuccess(result)) {
      values.push(result.value);
    } else {
      return failure(result.error);
    }
  }

  return success<T[], E>(values);
};

/**
 * Combines multiple Results, collecting all errors instead of failing fast.
 *
 * Returns success with all values if all Results are successful.
 * Returns failure with array of all errors if any Result fails.
 *
 * @template T - The success value type
 * @template E - The error type
 * @param results - Array of Results to combine
 * @returns A Result containing array of values or array of all errors
 *
 * @example
 * ```typescript
 * // Validate form and collect all errors for display
 * const validations = [
 *   validateEmail(form.email),
 *   validatePassword(form.password),
 *   validateConfirmPassword(form.password, form.confirmPassword),
 * ];
 * const combined = combineAll(validations);
 *
 * if (isFailure(combined)) {
 *   // Display all validation errors to user
 *   setErrors(combined.error.map(e => e.message));
 * }
 * ```
 *
 * @see {@link combine} for fail-fast behavior
 */
export const combineAll = <T, E>(results: Result<T, E>[]): Result<T[], E[]> => {
  const values: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (isSuccess(result)) {
      values.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    return failure(errors);
  }

  return success<T[], E[]>(values);
};
