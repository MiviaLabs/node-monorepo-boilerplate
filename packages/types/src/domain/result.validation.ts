/**
 * Validation Result utilities
 *
 * This module provides types and functions for form and input validation
 * where multiple fields may have errors simultaneously.
 *
 * @module domain/result.validation
 */

import { success, failure, isSuccess, type Result } from './result.core';

/**
 * Validation result type that can contain multiple validation errors.
 *
 * Used for form validation and input validation where multiple fields
 * may have errors simultaneously.
 *
 * @template T - The validated value type
 *
 * @example
 * ```typescript
 * // Validate user registration
 * function validateRegistration(input: RegistrationInput): ValidationResult<ValidatedRegistration> {
 *   const errors: IValidationError[] = [];
 *
 *   if (!isValidEmail(input.email)) {
 *     errors.push(validationError('email', 'Invalid email format', 'INVALID_EMAIL'));
 *   }
 *
 *   if (input.password.length < 8) {
 *     errors.push(validationError('password', 'Password too short', 'PASSWORD_TOO_SHORT'));
 *   }
 *
 *   if (input.password !== input.confirmPassword) {
 *     errors.push(validationError('confirmPassword', 'Passwords do not match', 'PASSWORD_MISMATCH'));
 *   }
 *
 *   if (errors.length > 0) {
 *     return failure(errors);
 *   }
 *
 *   return success({
 *     email: normalizeEmail(input.email),
 *     password: input.password,
 *   });
 * }
 * ```
 *
 * @see {@link IValidationError} for the error structure
 * @see {@link validationError} for creating validation errors
 * @see {@link combineValidation} for combining validation results
 */
export type ValidationResult<T> = Result<T, IValidationError[]>;

/**
 * Validation error structure for field-level errors.
 *
 * Contains the field name, human-readable message, and machine-readable code
 * for building user interfaces and error handling logic.
 *
 * @example
 * ```typescript
 * const error: IValidationError = {
 *   field: 'email',
 *   message: 'Please enter a valid email address',
 *   code: 'INVALID_EMAIL_FORMAT',
 * };
 *
 * // Display in form
 * errors.forEach(error => {
 *   const field = document.querySelector(`[name="${error.field}"]`);
 *   showFieldError(field, error.message);
 * });
 *
 * // Check for specific error codes
 * if (errors.some(e => e.code === 'EMAIL_TAKEN')) {
 *   suggestAlternativeEmail();
 * }
 * ```
 *
 * @see {@link ValidationResult} for the Result type using this error
 * @see {@link validationError} for creating validation errors
 */
export interface IValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Creates an IValidationError with the specified field, message, and code.
 *
 * @param field - The field name that failed validation
 * @param message - Human-readable error message
 * @param code - Machine-readable error code for programmatic handling
 * @returns An IValidationError object
 *
 * @example
 * ```typescript
 * // Common validation errors
 * const required = (field: string) =>
 *   validationError(field, `${field} is required`, 'REQUIRED');
 *
 * const tooShort = (field: string, min: number) =>
 *   validationError(field, `${field} must be at least ${min} characters`, 'TOO_SHORT');
 *
 * const invalidFormat = (field: string, format: string) =>
 *   validationError(field, `${field} must be a valid ${format}`, 'INVALID_FORMAT');
 *
 * // Usage in validation
 * function validateUsername(username: string): ValidationResult<string> {
 *   if (!username) {
 *     return failure([required('username')]);
 *   }
 *   if (username.length < 3) {
 *     return failure([tooShort('username', 3)]);
 *   }
 *   return success(username);
 * }
 * ```
 *
 * @see {@link IValidationError} for the error structure
 * @see {@link ValidationResult} for validation Result type
 */
export const validationError = (
  field: string,
  message: string,
  code: string
): IValidationError => ({
  field,
  message,
  code
});

/**
 * Combines multiple ValidationResults, collecting all errors.
 *
 * Returns success with all values if all validations pass.
 * Returns failure with all validation errors combined if any fail.
 *
 * @template T - The validated value type
 * @param results - Array of ValidationResults to combine
 * @returns A ValidationResult containing array of values or all errors
 *
 * @example
 * ```typescript
 * // Validate form with multiple fields
 * const results = combineValidation([
 *   validateEmail(form.email),
 *   validatePassword(form.password),
 *   validateAge(form.age),
 * ]);
 *
 * if (isFailure(results)) {
 *   // Display all validation errors
 *   results.error.forEach(err => {
 *     setFieldError(err.field, err.message);
 *   });
 *   return;
 * }
 *
 * // All validations passed
 * const [email, password, age] = results.value;
 * submitForm({ email, password, age });
 * ```
 *
 * @see {@link ValidationResult} for the validation Result type
 * @see {@link IValidationError} for the error structure
 * @see {@link combineAll} for generic Result combining
 */
export const combineValidation = <T>(results: ValidationResult<T>[]): ValidationResult<T[]> => {
  const values: T[] = [];
  const errors: IValidationError[] = [];

  for (const result of results) {
    if (isSuccess(result)) {
      values.push(result.value);
    } else {
      errors.push(...result.error);
    }
  }

  if (errors.length > 0) {
    return failure(errors);
  }

  return success<T[], IValidationError[]>(values);
};
