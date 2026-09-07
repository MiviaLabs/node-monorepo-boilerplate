/**
 * UUID validation schemas
 *
 * Provides Zod schemas for validating UUID strings in various formats
 * including UUID v4 (random), UUID v7 (time-ordered), and generic UUIDs.
 *
 * @module uuid.schema
 */

import { z } from 'zod';

/**
 * UUID v4 schema for random UUIDs.
 *
 * Validates UUID version 4 format (random generation).
 * UUID v4 uses random or pseudo-random numbers for all bits except version and variant.
 *
 * Validation rules:
 * - Must be a string type
 * - Must match UUID v4 format (case-insensitive)
 * - Version nibble must be '4'
 * - Variant nibble must be '8', '9', 'a', or 'b'
 *
 * Pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
 *
 * Format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
 * - `x` = any hexadecimal digit (0-9, a-f)
 * - `4` = version 4
 * - `y` = variant (8, 9, a, b)
 *
 * @example
 * // Valid inputs
 * uuidv4Schema.parse('550e8400-e29b-41d4-a716-446655440000'); // Returns the UUID
 * uuidv4Schema.parse('6ba7b810-9dad-41d4-80b4-00c04fd430c8'); // Returns the UUID
 * uuidv4Schema.parse('F47AC10B-58CC-4372-A567-0E02B2C3D479'); // Returns (case-insensitive)
 *
 * @example
 * // Invalid inputs - throws ZodError
 * uuidv4Schema.parse('');                                     // Error: 'Invalid UUID v4 format'
 * uuidv4Schema.parse('not-a-uuid');                           // Error: 'Invalid UUID v4 format'
 * uuidv4Schema.parse('550e8400-e29b-11d4-a716-446655440000'); // Error: version 1, not 4
 * uuidv4Schema.parse('550e8400-e29b-71d4-a716-446655440000'); // Error: version 7, not 4
 * uuidv4Schema.parse('550e8400-e29b-41d4-c716-446655440000'); // Error: invalid variant 'c'
 * uuidv4Schema.parse('550e8400e29b41d4a716446655440000');     // Error: missing hyphens
 *
 * @returns A Zod schema that validates UUID v4 format strings
 */
export const uuidv4Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, {
    message: 'Invalid UUID v4 format'
  });

/**
 * UUID v7 schema for time-ordered UUIDs.
 *
 * Validates UUID version 7 format (Unix timestamp-based, sortable).
 * UUID v7 embeds a Unix timestamp in milliseconds, making them time-ordered and sortable.
 *
 * Validation rules:
 * - Must be a string type
 * - Must match UUID v7 format (case-insensitive)
 * - Version nibble must be '7'
 * - Variant nibble must be '8', '9', 'a', or 'b'
 *
 * Pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
 *
 * Format: `xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx`
 * - `x` = any hexadecimal digit (0-9, a-f)
 * - `7` = version 7
 * - `y` = variant (8, 9, a, b)
 *
 * @example
 * // Valid inputs
 * uuidv7Schema.parse('01889c89-df6b-7f1c-8001-1b8c1e1c1e1c'); // Returns the UUID
 * uuidv7Schema.parse('018a6e4e-9c1a-7000-8000-000000000000'); // Returns the UUID
 * uuidv7Schema.parse('018A6E4E-9C1A-7000-8000-000000000000'); // Returns (case-insensitive)
 *
 * @example
 * // Invalid inputs - throws ZodError
 * uuidv7Schema.parse('');                                     // Error: 'Invalid UUID v7 format'
 * uuidv7Schema.parse('not-a-uuid');                           // Error: 'Invalid UUID v7 format'
 * uuidv7Schema.parse('550e8400-e29b-41d4-a716-446655440000'); // Error: version 4, not 7
 * uuidv7Schema.parse('550e8400-e29b-11d4-a716-446655440000'); // Error: version 1, not 7
 * uuidv7Schema.parse('01889c89-df6b-7f1c-c001-1b8c1e1c1e1c'); // Error: invalid variant 'c'
 *
 * @returns A Zod schema that validates UUID v7 format strings
 */
export const uuidv7Schema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, {
    message: 'Invalid UUID v7 format'
  });

/**
 * Generic UUID schema for any standard UUID version (1-7).
 *
 * Validates any RFC 4122 compliant UUID format, including versions 1-7.
 * Use this when you need to accept UUIDs from various sources without
 * enforcing a specific version.
 *
 * Validation rules:
 * - Must be a string type
 * - Must match standard UUID format (case-insensitive)
 * - Version nibble must be 1-7
 * - Variant nibble must be '8', '9', 'a', or 'b'
 *
 * Pattern: `^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`
 *
 * Format: `xxxxxxxx-xxxx-Vxxx-yxxx-xxxxxxxxxxxx`
 * - `x` = any hexadecimal digit (0-9, a-f)
 * - `V` = version (1-7)
 * - `y` = variant (8, 9, a, b)
 *
 * @example
 * // Valid inputs - various UUID versions
 * uuidSchema.parse('550e8400-e29b-11d4-a716-446655440000'); // UUID v1 (timestamp)
 * uuidSchema.parse('550e8400-e29b-41d4-a716-446655440000'); // UUID v4 (random)
 * uuidSchema.parse('01889c89-df6b-7f1c-8001-1b8c1e1c1e1c'); // UUID v7 (time-ordered)
 * uuidSchema.parse('F47AC10B-58CC-4372-A567-0E02B2C3D479'); // Case-insensitive
 *
 * @example
 * // Invalid inputs - throws ZodError
 * uuidSchema.parse('');                                     // Error: 'Invalid UUID format'
 * uuidSchema.parse('not-a-uuid');                           // Error: 'Invalid UUID format'
 * uuidSchema.parse('550e8400-e29b-01d4-a716-446655440000'); // Error: version 0 invalid
 * uuidSchema.parse('550e8400-e29b-81d4-a716-446655440000'); // Error: version 8 invalid
 * uuidSchema.parse('550e8400-e29b-41d4-0716-446655440000'); // Error: invalid variant '0'
 * uuidSchema.parse('550e8400e29b41d4a716446655440000');     // Error: missing hyphens
 * uuidSchema.parse('550e8400-e29b-41d4-a716');              // Error: incomplete UUID
 *
 * @returns A Zod schema that validates any standard UUID format (v1-v7)
 */
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, {
    message: 'Invalid UUID format'
  });
