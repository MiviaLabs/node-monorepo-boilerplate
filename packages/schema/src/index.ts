/**
 * @package/schema
 *
 * Shared Zod schemas for type-safe contracts across Node Monorepo Boilerplate.
 * Provides validation schemas, custom validators, and error formatting utilities.
 *
 * ## Usage Examples
 *
 * ```typescript
 * import { emailSchema, paginationParamsSchema, formatZodError } from '@package/schema';
 *
 * // Validate an email
 * const emailResult = emailSchema.safeParse('user@example.com');
 * if (emailResult.success) {
 *   console.log('Valid email:', emailResult.data);
 * }
 *
 * // Parse pagination parameters
 * const pagination = paginationParamsSchema.parse({ page: 1, pageSize: 10 });
 *
 * // Handle validation errors
 * const result = emailSchema.safeParse('invalid-email');
 * if (!result.success) {
 *   const formatted = formatZodError(result.error);
 *   console.error('Validation failed:', formatted);
 * }
 * ```
 *
 * Related packages:
 * - `@package/types` - TypeScript type definitions derived from schemas
 * - `@package/errors` - Validation error handling
 * - `@package/constants` - Validation limits and constraints
 *
 * @packageDocumentation
 */

/**
 * Base schemas
 *
 * @see {@link emailSchema} - Email validation with normalization
 * @see {@link uuidSchema} - UUID format validation
 * @see {@link nonEmptyString} - Non-empty string validation
 *
 * See also: `@package/types` for inferred TypeScript types
 */
export * from './base';

/**
 * Domain schemas
 *
 * @see {@link createUserSchema} - User creation validation
 * @see {@link paginationParamsSchema} - Pagination parameter validation
 *
 * See also: `@package/constants` for pagination limits (MAX_PAGE_SIZE)
 */
export * from './domain';

/**
 * Helpers
 *
 * @see {@link formatZodError} - Format Zod errors for API responses
 * @see {@link parseSafe} - Safe parsing with detailed results
 *
 * See also: `@package/errors` for error response integration
 */
export * from './helpers';

/**
 * Custom validators
 *
 * @see {@link strongPasswordSchema} - Strong password validation
 * @see {@link usernameSchema} - Username format validation
 * @see {@link phoneNumberSchema} - E.164 phone number validation
 */
export * from './custom';
