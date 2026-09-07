/**
 * Postal code validation custom schemas
 *
 * Provides Zod schemas for validating postal/ZIP codes from various
 * countries including US, Canada, UK, and a generic fallback.
 *
 * @module postal-code.validator
 */

import { z } from 'zod';

/**
 * US ZIP code schema.
 *
 * Validates United States ZIP codes in both standard (5-digit)
 * and ZIP+4 (9-digit) formats.
 *
 * Validation rules:
 * - Must be exactly 5 digits, OR
 * - Must be 5 digits, hyphen, then 4 digits (ZIP+4)
 *
 * Formats:
 * - Standard: XXXXX (e.g., 94102)
 * - ZIP+4: XXXXX-XXXX (e.g., 94102-1234)
 *
 * @example
 * ```typescript
 * // Valid US ZIP codes
 * usZipCodeSchema.parse('94102');       // San Francisco
 * usZipCodeSchema.parse('10001');       // New York
 * usZipCodeSchema.parse('90210');       // Beverly Hills
 * usZipCodeSchema.parse('94102-1234');  // ZIP+4 format
 *
 * // Invalid ZIP codes - throws ZodError
 * usZipCodeSchema.parse('9410');        // Error: only 4 digits
 * usZipCodeSchema.parse('941021');      // Error: 6 digits without hyphen
 * usZipCodeSchema.parse('94102-123');   // Error: ZIP+4 needs 4 digits after hyphen
 * usZipCodeSchema.parse('ABCDE');       // Error: letters not allowed
 * ```
 */
export const usZipCodeSchema = z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid US ZIP code format');

/**
 * Canadian postal code schema.
 *
 * Validates Canadian postal codes in the standard alternating
 * letter-digit format.
 *
 * Validation rules:
 * - Format: A1A 1A1 or A1A-1A1 or A1A1A1
 * - Alternates between letters and digits
 * - Letters are case-insensitive
 * - Space or hyphen separator is optional
 *
 * Format: LNL NLN (L=letter, N=number)
 *
 * @example
 * ```typescript
 * // Valid Canadian postal codes
 * caPostalCodeSchema.parse('M5V 3L9');  // Toronto
 * caPostalCodeSchema.parse('V6B 1A1');  // Vancouver
 * caPostalCodeSchema.parse('K1A 0B1');  // Ottawa
 * caPostalCodeSchema.parse('H2X-1Y4');  // Montreal (hyphen separator)
 * caPostalCodeSchema.parse('T2P1J9');   // Calgary (no separator)
 *
 * // Invalid postal codes - throws ZodError
 * caPostalCodeSchema.parse('12345');    // Error: wrong format
 * caPostalCodeSchema.parse('AAA 111');  // Error: wrong pattern
 * caPostalCodeSchema.parse('M5V3L');    // Error: incomplete
 * ```
 */
export const caPostalCodeSchema = z
  .string()
  .regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, 'Invalid Canadian postal code format');

/**
 * UK postal code schema.
 *
 * Validates United Kingdom postcodes following the Royal Mail format.
 * Handles all valid UK postcode areas and districts.
 *
 * Validation rules:
 * - Outward code: 2-4 characters (area + district)
 * - Inward code: 3 characters (sector + unit)
 * - Space between outward and inward is optional
 * - Letters are case-insensitive
 *
 * Formats:
 * - A9 9AA, A99 9AA, A9A 9AA
 * - AA9 9AA, AA99 9AA, AA9A 9AA
 *
 * @example
 * ```typescript
 * // Valid UK postcodes
 * ukPostalCodeSchema.parse('SW1A 1AA');  // Buckingham Palace
 * ukPostalCodeSchema.parse('EC1A 1BB');  // City of London
 * ukPostalCodeSchema.parse('M1 1AE');    // Manchester
 * ukPostalCodeSchema.parse('B33 8TH');   // Birmingham
 * ukPostalCodeSchema.parse('CR2 6XH');   // Croydon
 * ukPostalCodeSchema.parse('DN551PT');   // No space variant
 *
 * // Invalid postcodes - throws ZodError
 * ukPostalCodeSchema.parse('12345');     // Error: wrong format
 * ukPostalCodeSchema.parse('SWIA IAA');  // Error: I is not valid in position
 * ukPostalCodeSchema.parse('SW1A');      // Error: incomplete
 * ```
 */
export const ukPostalCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/, 'Invalid UK postal code format');

/**
 * Generic postal code schema for international use.
 *
 * A flexible schema that accepts postal codes from most countries.
 * Use this when you need to accept postal codes from multiple
 * countries or when the specific country format is unknown.
 *
 * Validation rules:
 * - Must be 3-10 characters long
 * - May contain letters (A-Z, a-z)
 * - May contain digits (0-9)
 * - May contain spaces and hyphens
 * - No special characters
 *
 * @example
 * ```typescript
 * // Valid postal codes from various countries
 * genericPostalCodeSchema.parse('94102');      // US
 * genericPostalCodeSchema.parse('M5V 3L9');    // Canada
 * genericPostalCodeSchema.parse('SW1A 1AA');   // UK
 * genericPostalCodeSchema.parse('75001');      // France
 * genericPostalCodeSchema.parse('100-0001');   // Japan
 * genericPostalCodeSchema.parse('1010');       // Austria
 *
 * // Invalid postal codes - throws ZodError
 * genericPostalCodeSchema.parse('AB');         // Error: too short (< 3)
 * genericPostalCodeSchema.parse('12345678901'); // Error: too long (> 10)
 * genericPostalCodeSchema.parse('94102!');     // Error: special characters
 * genericPostalCodeSchema.parse('94.102');     // Error: dots not allowed
 * ```
 */
export const genericPostalCodeSchema = z
  .string()
  .min(3, 'Postal code is too short')
  .max(10, 'Postal code is too long')
  .regex(/^[A-Za-z0-9\s-]+$/, 'Invalid postal code format');
