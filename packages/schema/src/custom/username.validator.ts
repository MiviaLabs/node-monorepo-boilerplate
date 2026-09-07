/**
 * Username validation custom schemas
 *
 * Provides Zod schemas for validating usernames with different
 * character set restrictions based on application requirements.
 *
 * @module username.validator
 */

import { z } from 'zod';

/**
 * Standard username schema with common allowed characters.
 *
 * Validates usernames allowing alphanumeric characters plus
 * underscores and hyphens. This is the most common format
 * used by social media platforms and web applications.
 *
 * Validation rules:
 * - Must be 3-30 characters long
 * - May contain letters (a-z, A-Z)
 * - May contain digits (0-9)
 * - May contain underscores (_)
 * - May contain hyphens (-)
 * - No spaces or special characters
 *
 * @example
 * ```typescript
 * // Valid usernames
 * usernameSchema.parse('john_doe');        // Returns: 'john_doe'
 * usernameSchema.parse('user-123');        // Returns: 'user-123'
 * usernameSchema.parse('JohnDoe2024');     // Returns: 'JohnDoe2024'
 * usernameSchema.parse('a_b-c');           // Returns: 'a_b-c'
 *
 * // Invalid usernames - throws ZodError
 * usernameSchema.parse('ab');              // Error: too short (< 3)
 * usernameSchema.parse('a'.repeat(31));    // Error: too long (> 30)
 * usernameSchema.parse('john doe');        // Error: spaces not allowed
 * usernameSchema.parse('john@doe');        // Error: @ not allowed
 * usernameSchema.parse('john.doe');        // Error: dots not allowed
 * ```
 */
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Username can only contain letters, numbers, underscores, and hyphens'
  );

/**
 * Strict username schema with alphanumeric characters only.
 *
 * Validates usernames allowing only letters and numbers.
 * Use this for stricter requirements where special characters
 * (including underscores and hyphens) should be disallowed.
 *
 * Validation rules:
 * - Must be 3-30 characters long
 * - May contain letters (a-z, A-Z)
 * - May contain digits (0-9)
 * - No special characters (including _, -)
 * - No spaces
 *
 * @example
 * ```typescript
 * // Valid usernames
 * strictUsernameSchema.parse('johndoe');     // Returns: 'johndoe'
 * strictUsernameSchema.parse('JohnDoe123');  // Returns: 'JohnDoe123'
 * strictUsernameSchema.parse('user2024');    // Returns: 'user2024'
 * strictUsernameSchema.parse('ABC');         // Returns: 'ABC'
 *
 * // Invalid usernames - throws ZodError
 * strictUsernameSchema.parse('ab');          // Error: too short (< 3)
 * strictUsernameSchema.parse('a'.repeat(31)); // Error: too long (> 30)
 * strictUsernameSchema.parse('john_doe');    // Error: underscores not allowed
 * strictUsernameSchema.parse('john-doe');    // Error: hyphens not allowed
 * strictUsernameSchema.parse('john doe');    // Error: spaces not allowed
 * ```
 */
export const strictUsernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9]+$/, 'Username can only contain letters and numbers');
