/**
 * Password validation custom schemas
 *
 * Provides Zod schemas for validating passwords with varying strength
 * requirements. Choose the appropriate schema based on your security needs.
 *
 * @module password.validator
 */

import { z } from 'zod';

/**
 * Strong password schema with comprehensive security requirements.
 *
 * Validates passwords that meet enterprise-grade security standards.
 * Suitable for sensitive applications requiring high security.
 *
 * Validation rules:
 * - Must be at least 8 characters long
 * - Must contain at least one lowercase letter (a-z)
 * - Must contain at least one uppercase letter (A-Z)
 * - Must contain at least one digit (0-9)
 * - Must contain at least one special character (!@#$%^&*(),.?":{}|<>)
 *
 * @example
 * ```typescript
 * // Valid passwords
 * strongPasswordSchema.parse('MyP@ssw0rd!');     // Returns: 'MyP@ssw0rd!'
 * strongPasswordSchema.parse('Secure#123Pass');  // Returns: 'Secure#123Pass'
 * strongPasswordSchema.parse('Test@1234');       // Returns: 'Test@1234'
 *
 * // Invalid passwords - throws ZodError
 * strongPasswordSchema.parse('short');           // Error: too short
 * strongPasswordSchema.parse('alllowercase1!');  // Error: no uppercase
 * strongPasswordSchema.parse('ALLUPPERCASE1!');  // Error: no lowercase
 * strongPasswordSchema.parse('NoNumbers!!');     // Error: no digit
 * strongPasswordSchema.parse('NoSpecial123');    // Error: no special char
 * ```
 */
export const strongPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

/**
 * Medium password schema with moderate security requirements.
 *
 * Validates passwords that meet standard security guidelines.
 * Suitable for general-purpose applications.
 *
 * Validation rules:
 * - Must be at least 8 characters long
 * - Must contain at least one lowercase letter (a-z)
 * - Must contain at least one uppercase letter (A-Z)
 * - Must contain at least one digit (0-9)
 *
 * @example
 * ```typescript
 * // Valid passwords
 * mediumPasswordSchema.parse('Password123');     // Returns: 'Password123'
 * mediumPasswordSchema.parse('MySecure1');       // Returns: 'MySecure1'
 * mediumPasswordSchema.parse('TestPass9');       // Returns: 'TestPass9'
 *
 * // Invalid passwords - throws ZodError
 * mediumPasswordSchema.parse('short1A');         // Error: too short
 * mediumPasswordSchema.parse('alllowercase123'); // Error: no uppercase
 * mediumPasswordSchema.parse('ALLUPPERCASE123'); // Error: no lowercase
 * mediumPasswordSchema.parse('NoNumbersHere');   // Error: no digit
 * ```
 */
export const mediumPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one number');

/**
 * Basic password schema with minimal requirements.
 *
 * Validates passwords that meet minimum length requirements only.
 * Suitable for low-security contexts or when additional validation
 * is handled elsewhere.
 *
 * Validation rules:
 * - Must be at least 8 characters long
 *
 * @example
 * ```typescript
 * // Valid passwords
 * basicPasswordSchema.parse('mypassword');       // Returns: 'mypassword'
 * basicPasswordSchema.parse('12345678');         // Returns: '12345678'
 * basicPasswordSchema.parse('anything8+');       // Returns: 'anything8+'
 *
 * // Invalid passwords - throws ZodError
 * basicPasswordSchema.parse('short');            // Error: too short
 * basicPasswordSchema.parse('1234567');          // Error: only 7 chars
 * basicPasswordSchema.parse('');                 // Error: empty string
 * ```
 */
export const basicPasswordSchema = z.string().min(8, 'Password must be at least 8 characters');
