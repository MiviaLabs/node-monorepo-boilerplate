/**
 * API response types
 *
 * This module provides standardized types for API responses, ensuring consistent
 * structure across all endpoints. Supports success responses, error responses,
 * and validation errors with detailed field-level information.
 *
 * @module infrastructure/api.types
 */

/**
 * Successful API response wrapper.
 *
 * Wraps successful responses with consistent structure including the data,
 * optional message, and timestamp. The `success: true` discriminator enables
 * type narrowing when handling IApiResult.
 *
 * @template T - The type of the data payload
 *
 * @example
 * ```typescript
 * // Return successful response from controller
 * @Get(':id')
 * async getUser(@Param('id') id: string): Promise<IApiResponse<User>> {
 *   const user = await this.userService.findById(id);
 *   return {
 *     success: true,
 *     data: user,
 *     timestamp: new Date().toISOString(),
 *   };
 * }
 *
 * // With optional message
 * @Post()
 * async createUser(@Body() dto: CreateUserDto): Promise<IApiResponse<User>> {
 *   const user = await this.userService.create(dto);
 *   return {
 *     success: true,
 *     data: user,
 *     message: 'User created successfully',
 *     timestamp: new Date().toISOString(),
 *   };
 * }
 *
 * // Use helper function for consistency
 * function createSuccessResponse<T>(data: T, message?: string): IApiResponse<T> {
 *   return {
 *     success: true,
 *     data,
 *     message,
 *     timestamp: new Date().toISOString(),
 *   };
 * }
 * ```
 *
 * @see {@link IApiResult} for union with error type
 * @see {@link ICommandResult} for CQRS command results
 * @see {@link IQueryResult} for CQRS query results
 */
export interface IApiResponse<T> {
  /** Discriminator for type narrowing - always true for success */
  readonly success: true;
  /** The response data payload */
  readonly data: T;
  /** Optional success message for user feedback */
  readonly message?: string;
  /** ISO 8601 timestamp of the response */
  readonly timestamp: string;
}

/**
 * @deprecated Use IApiResponse instead. This alias is provided for backward compatibility.
 */
export type ApiResponse<T> = IApiResponse<T>;

/**
 * Detailed error information for field-level errors.
 *
 * Provides additional context for errors, particularly useful for validation
 * errors where each field may have its own error message.
 *
 * @example
 * ```typescript
 * // Field validation error
 * const emailError: IApiErrorDetail = {
 *   field: 'email',
 *   message: 'Email address is already registered',
 * };
 *
 * // General error without specific field
 * const generalError: IApiErrorDetail = {
 *   message: 'Database connection failed',
 * };
 *
 * // Build details from validation errors
 * function toApiErrorDetails(errors: IValidationError[]): IApiErrorDetail[] {
 *   return errors.map(err => ({
 *     field: err.field,
 *     message: err.message,
 *   }));
 * }
 * ```
 *
 * @see {@link IApiError} for the parent error response
 */
export interface IApiErrorDetail {
  /** The field name that caused the error (optional for non-field errors) */
  readonly field?: string;
  /** Human-readable error message */
  readonly message: string;
}

/**
 * API error response structure.
 *
 * Provides consistent error response format with error code, message, and
 * optional details for field-level errors. The `success: false` discriminator
 * enables type narrowing when handling IApiResult.
 *
 * @example
 * ```typescript
 * import { ERROR_CODES } from '@package/constants/errors';
 * import { Errors } from '@package/errors';
 *
 * // Return error from exception filter using typed error codes
 * const errorResponse: IApiError = {
 *   success: false,
 *   error: {
 *     code: ERROR_CODES.USER_NOT_FOUND, // 'USER_001'
 *     message: 'The requested user does not exist',
 *   },
 *   timestamp: new Date().toISOString(),
 * };
 *
 * // With detailed field errors using validation code
 * const validationError: IApiError = {
 *   success: false,
 *   error: {
 *     code: ERROR_CODES.VALIDATION_FAILED, // 'VALIDATION_001'
 *     message: 'Request validation failed',
 *     details: [
 *       { field: 'email', message: 'Invalid email format' },
 *       { field: 'password', message: 'Password too short' },
 *     ],
 *   },
 *   timestamp: new Date().toISOString(),
 * };
 *
 * // Prefer using Errors factory from @package/errors for throwing
 * // Instead of: throw new Error('User not found')
 * // Use typed error factory:
 * throw Errors.userWithId001({ userId: '123' });
 *
 * // Check error codes using typed constants
 * if (response.error.code === ERROR_CODES.USER_NOT_FOUND) {
 *   // Handle user not found error
 * }
 * ```
 *
 * @see {@link IApiResult} for union with success type
 * @see {@link IApiErrorDetail} for field-level error details
 * @see {@link IValidationErrorResponse} for validation-specific errors
 */
export interface IApiError {
  /** Discriminator for type narrowing - always false for errors */
  readonly success: false;
  /** Error information */
  readonly error: {
    /** Machine-readable error code for programmatic handling */
    readonly code: string;
    /** Human-readable error message */
    readonly message: string;
    /** Optional array of detailed errors (e.g., per-field validation errors) */
    readonly details?: readonly IApiErrorDetail[];
  };
  /** ISO 8601 timestamp of the response */
  readonly timestamp: string;
}

/**
 * Union type for all API responses (success or error).
 *
 * Use this type for API response handling to ensure all cases are handled.
 * TypeScript will narrow the type based on the `success` discriminator.
 *
 * @template T - The type of the success data payload
 *
 * @example
 * ```typescript
 * import { ERROR_CODES } from '@package/constants/errors';
 * import { Errors } from '@package/errors';
 *
 * // Handle API response with type narrowing
 * async function handleResponse<T>(response: IApiResult<T>): Promise<T> {
 *   if (response.success) {
 *     // TypeScript knows this is IApiResponse<T>
 *     console.log('Success at:', response.timestamp);
 *     return response.data;
 *   } else {
 *     // TypeScript knows this is IApiError
 *     console.error(`Error ${response.error.code}: ${response.error.message}`);
 *     // Use typed error factory with context instead of generic Error
 *     throw Errors.systemUnexpectedError001({
 *       details: `API error: ${response.error.code} - ${response.error.message}`,
 *     });
 *   }
 * }
 *
 * // Use in fetch wrapper
 * async function fetchApi<T>(url: string): Promise<IApiResult<T>> {
 *   const response = await fetch(url);
 *   return response.json();
 * }
 *
 * // Frontend usage with typed error code comparison
 * const result = await fetchApi<User>('/api/users/123');
 * if (result.success) {
 *   setUser(result.data);
 * } else if (result.error.code === ERROR_CODES.USER_NOT_FOUND) {
 *   showUserNotFoundMessage();
 * } else {
 *   showError(result.error.message);
 * }
 * ```
 *
 * @see {@link IApiResponse} for success response type
 * @see {@link IApiError} for error response type
 */
export type IApiResult<T> = IApiResponse<T> | IApiError;

/**
 * @deprecated Use IApiResult instead. This alias is provided for backward compatibility.
 */
export type ApiResult<T> = IApiResult<T>;

/**
 * Validation error detail for field-level validation errors.
 *
 * Contains the field name, error message, and optional error code for
 * programmatic handling of specific validation rules.
 *
 * @example
 * ```typescript
 * // Basic validation error
 * const emailError: IValidationErrorDetail = {
 *   field: 'email',
 *   message: 'Please enter a valid email address',
 * };
 *
 * // With error code for programmatic handling
 * const passwordError: IValidationErrorDetail = {
 *   field: 'password',
 *   message: 'Password must be at least 8 characters',
 *   code: 'MIN_LENGTH',
 * };
 *
 * // Display errors in form
 * details.forEach(error => {
 *   const input = document.querySelector(`[name="${error.field}"]`);
 *   input?.classList.add('error');
 *   showErrorMessage(input, error.message);
 * });
 * ```
 *
 * @see {@link IValidationErrorResponse} for the validation error response
 */
export interface IValidationErrorDetail {
  /** The field name that failed validation */
  readonly field: string;
  /** Human-readable validation error message */
  readonly message: string;
  /** Optional machine-readable error code for specific validation rules */
  readonly code?: string;
}

/**
 * Validation error response with field-level details.
 *
 * Specialized error response for validation failures with a fixed error code
 * and required field-level details. Use for form validation and input errors.
 *
 * Note: The `code` field uses the literal type `'VALIDATION_ERROR'` (not the
 * `ERROR_CODES.VALIDATION_FAILED` constant which maps to `'VALIDATION_001'`).
 * This is intentional - IValidationErrorResponse uses a semantic type literal
 * for compile-time type narrowing, while ERROR_CODES are for runtime comparison.
 *
 * @example
 * ```typescript
 * import { Errors } from '@package/errors';
 *
 * // Create validation error response (note: 'VALIDATION_ERROR' is the literal type)
 * function createValidationError(errors: IValidationErrorDetail[]): IValidationErrorResponse {
 *   return {
 *     success: false,
 *     error: {
 *       code: 'VALIDATION_ERROR', // Type literal, must be exactly this value
 *       message: 'Request validation failed',
 *       details: errors,
 *     },
 *     timestamp: new Date().toISOString(),
 *   };
 * }
 *
 * // From Zod validation - prefer using Errors factory for throwing
 * function handleZodError(error: ZodError): IValidationErrorResponse {
 *   // For throwing, use typed error factory:
 *   // throw Errors.validationFailedField001({ field: error.errors[0]?.path.join('.') });
 *
 *   // For response formatting:
 *   return createValidationError(
 *     error.errors.map(err => ({
 *       field: err.path.join('.'),
 *       message: err.message,
 *       code: err.code,
 *     }))
 *   );
 * }
 *
 * // From class-validator - prefer using Errors factory for throwing
 * function handleClassValidatorErrors(errors: ClassValidatorError[]): IValidationErrorResponse {
 *   // For throwing, use typed error factory:
 *   // throw Errors.validationFailedField001({ field: errors[0]?.property });
 *
 *   // For response formatting:
 *   return createValidationError(
 *     errors.flatMap(err =>
 *       Object.values(err.constraints || {}).map(message => ({
 *         field: err.property,
 *         message,
 *       }))
 *     )
 *   );
 * }
 *
 * // Frontend handling - check for validation error type
 * if (result.error.code === 'VALIDATION_ERROR') {
 *   const validationResult = result as IValidationErrorResponse;
 *   validationResult.error.details.forEach(detail => {
 *     setFieldError(detail.field, detail.message);
 *   });
 * }
 * ```
 *
 * @see {@link ValidationResult} for domain validation Result type
 * @see {@link IValidationError} for domain validation error
 * @see {@link IApiError} for general API errors
 */
export interface IValidationErrorResponse {
  /** Discriminator - always false for errors */
  readonly success: false;
  /** Validation error information */
  readonly error: {
    /** Fixed code for validation errors */
    readonly code: 'VALIDATION_ERROR';
    /** General validation error message */
    readonly message: string;
    /** Required array of field-level validation errors */
    readonly details: readonly IValidationErrorDetail[];
  };
  /** ISO 8601 timestamp of the response */
  readonly timestamp: string;
}
