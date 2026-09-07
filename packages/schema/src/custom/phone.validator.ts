/**
 * Phone number validation custom schemas
 *
 * Provides Zod schemas for validating phone numbers in various formats
 * including international E.164, US-specific, and flexible formats.
 *
 * @module phone.validator
 */

import { z } from 'zod';

/**
 * E.164 international phone number schema.
 *
 * Validates phone numbers in E.164 format, the international standard
 * for phone number formatting. This format is required by many APIs
 * including Twilio, AWS SNS, and most SMS services.
 *
 * Validation rules:
 * - Must start with a plus sign (+)
 * - Must have 1-15 digits after the plus
 * - First digit after plus cannot be zero
 * - No spaces, dashes, or other characters allowed
 *
 * Format: +[country code][subscriber number]
 *
 * @example
 * ```typescript
 * // Valid E.164 phone numbers
 * phoneNumberSchema.parse('+14155551234');   // US number
 * phoneNumberSchema.parse('+442071234567');  // UK number
 * phoneNumberSchema.parse('+8613812345678'); // China number
 * phoneNumberSchema.parse('+491234567890');  // Germany number
 *
 * // Invalid phone numbers - throws ZodError
 * phoneNumberSchema.parse('4155551234');     // Error: missing +
 * phoneNumberSchema.parse('+0123456789');    // Error: starts with 0
 * phoneNumberSchema.parse('+1-415-555-1234'); // Error: contains dashes
 * phoneNumberSchema.parse('+1 415 555 1234'); // Error: contains spaces
 * ```
 */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format (E.164 required)');

/**
 * US phone number schema.
 *
 * Validates US phone numbers in E.164 format with country code +1.
 * Ensures exactly 10 digits after the country code.
 *
 * Validation rules:
 * - Must start with +1 (US country code)
 * - Must have exactly 10 digits after +1
 * - No spaces, dashes, or other characters allowed
 *
 * Format: +1XXXXXXXXXX (where X is any digit)
 *
 * @example
 * ```typescript
 * // Valid US phone numbers
 * usPhoneNumberSchema.parse('+14155551234');  // San Francisco
 * usPhoneNumberSchema.parse('+12125551234');  // New York
 * usPhoneNumberSchema.parse('+13105551234');  // Los Angeles
 *
 * // Invalid US phone numbers - throws ZodError
 * usPhoneNumberSchema.parse('+1415555123');   // Error: only 9 digits
 * usPhoneNumberSchema.parse('+141555512345'); // Error: 11 digits
 * usPhoneNumberSchema.parse('+442071234567'); // Error: not US code
 * usPhoneNumberSchema.parse('14155551234');   // Error: missing +
 * ```
 */
export const usPhoneNumberSchema = z
  .string()
  .regex(/^\+1\d{10}$/, 'Invalid US phone number format (use +1XXXXXXXXXX format)');

/**
 * Flexible phone number schema with normalization.
 *
 * Accepts phone numbers with common formatting characters and
 * normalizes them by removing spaces, dashes, and parentheses.
 * Useful for accepting user input before converting to E.164.
 *
 * Validation rules:
 * - May contain digits (0-9)
 * - May contain plus sign (+)
 * - May contain spaces, dashes, and parentheses (removed during transform)
 *
 * Transform behavior:
 * - Removes all spaces, dashes, and parentheses
 * - Preserves digits and plus sign
 *
 * @example
 * ```typescript
 * // Valid inputs and their transformed outputs
 * flexiblePhoneNumberSchema.parse('+1 (415) 555-1234');
 * // Returns: '+14155551234'
 *
 * flexiblePhoneNumberSchema.parse('(415) 555-1234');
 * // Returns: '4155551234'
 *
 * flexiblePhoneNumberSchema.parse('+44 20 7123 4567');
 * // Returns: '+442071234567'
 *
 * // Invalid inputs - throws ZodError
 * flexiblePhoneNumberSchema.parse('abc123');      // Error: contains letters
 * flexiblePhoneNumberSchema.parse('+1.415.555.1234'); // Error: contains dots
 * ```
 */
export const flexiblePhoneNumberSchema = z
  .string()
  .regex(/^[\d\s\-+()]+$/, 'Invalid phone number format')
  .transform((val) => val.replace(/[\s\-()]/g, ''));
