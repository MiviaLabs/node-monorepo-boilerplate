/**
 * Object validation schemas
 *
 * Provides Zod schemas for validating base entity objects with common
 * fields like IDs, timestamps, and soft delete markers. These serve as
 * foundation schemas for domain entities.
 *
 * @module object.schema
 */

import { z } from 'zod';

/**
 * Base object schema with standard entity metadata.
 *
 * Provides the foundational fields common to all persisted entities.
 * Use this as a base for domain entity schemas via `.extend()`.
 *
 * Schema structure:
 * - `id`: string (UUID format) - Unique identifier
 * - `createdAt`: Date (coerced) - Creation timestamp
 * - `updatedAt`: Date (coerced) - Last modification timestamp
 *
 * Field details:
 * - `id` uses Zod's built-in UUID validation
 * - `createdAt` and `updatedAt` support coercion from strings/numbers
 *
 * @example
 * // Valid inputs
 * baseObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-01-15T12:00:00Z'
 * }); // Returns: { id: string, createdAt: Date, updatedAt: Date }
 *
 * baseObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: new Date(),
 *   updatedAt: new Date()
 * }); // Returns: { id: string, createdAt: Date, updatedAt: Date }
 *
 * baseObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: 1705312200000,
 *   updatedAt: 1705315800000
 * }); // Returns: { id: string, createdAt: Date, updatedAt: Date }
 *
 * @example
 * // Invalid inputs - throws ZodError
 * baseObjectSchema.parse({});
 * // Error: 'id' is required, 'createdAt' is required, 'updatedAt' is required
 *
 * baseObjectSchema.parse({
 *   id: 'not-a-uuid',
 *   createdAt: '2024-01-15',
 *   updatedAt: '2024-01-15'
 * }); // Error: 'Invalid uuid' for id
 *
 * baseObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: 'invalid-date',
 *   updatedAt: '2024-01-15'
 * }); // Error: 'Invalid date' for createdAt
 *
 * @example
 * // Extending for domain entities
 * const userSchema = baseObjectSchema.extend({
 *   email: z.string().email(),
 *   name: z.string(),
 *   role: z.enum(['admin', 'user'])
 * });
 *
 * const productSchema = baseObjectSchema.extend({
 *   name: z.string(),
 *   price: z.number().positive(),
 *   sku: z.string()
 * });
 *
 * @returns A Zod object schema with base entity fields
 */
export const baseObjectSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

/**
 * Soft-deletable object schema with deletion timestamp.
 *
 * Extends {@link baseObjectSchema} to support soft delete pattern.
 * Soft delete marks records as deleted without physically removing them,
 * enabling data recovery and audit trails.
 *
 * Schema structure (inherits from baseObjectSchema):
 * - `id`: string (UUID format) - Unique identifier
 * - `createdAt`: Date (coerced) - Creation timestamp
 * - `updatedAt`: Date (coerced) - Last modification timestamp
 * - `deletedAt`: Date | null (coerced) - Deletion timestamp or null if active
 *
 * Field details:
 * - Inherits all fields from `baseObjectSchema`
 * - `deletedAt` is nullable - `null` means the record is not deleted
 * - `deletedAt` with a Date value means the record is soft-deleted
 *
 * @example
 * // Valid inputs - active record (not deleted)
 * softDeletableObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-01-15T12:00:00Z',
 *   deletedAt: null
 * }); // Returns: { id, createdAt, updatedAt, deletedAt: null }
 *
 * @example
 * // Valid inputs - soft-deleted record
 * softDeletableObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-01-15T12:00:00Z',
 *   deletedAt: '2024-06-01T00:00:00Z'
 * }); // Returns: { id, createdAt, updatedAt, deletedAt: Date }
 *
 * softDeletableObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 *   deletedAt: new Date()
 * }); // Returns: { id, createdAt, updatedAt, deletedAt: Date }
 *
 * @example
 * // Invalid inputs - throws ZodError
 * softDeletableObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15',
 *   updatedAt: '2024-01-15'
 *   // missing deletedAt
 * }); // Error: 'deletedAt' is required
 *
 * softDeletableObjectSchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15',
 *   updatedAt: '2024-01-15',
 *   deletedAt: 'invalid-date'
 * }); // Error: 'Invalid date' for deletedAt
 *
 * @example
 * // Extending for soft-deletable domain entities
 * const userSchema = softDeletableObjectSchema.extend({
 *   email: z.string().email(),
 *   name: z.string()
 * });
 *
 * // Querying active records (pseudo-code)
 * // SELECT * FROM users WHERE deleted_at IS NULL
 *
 * // Restoring a soft-deleted record (pseudo-code)
 * // UPDATE users SET deleted_at = NULL WHERE id = ?
 *
 * @returns A Zod object schema with soft delete support
 */
export const softDeletableObjectSchema = baseObjectSchema.extend({
  deletedAt: z.coerce.date().nullable()
});
