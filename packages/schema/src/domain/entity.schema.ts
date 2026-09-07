/**
 * Entity validation schemas
 */

import { z } from 'zod';

import { uuidSchema } from '../base';

/**
 * Base entity schema with common fields for all database entities.
 *
 * Provides the foundation for entity validation with standard identifier
 * and timestamp fields. All domain entities should extend this schema.
 *
 * **Included Fields:**
 * - `id`: UUID string (validated via uuidSchema)
 * - `createdAt`: Date (coerced from string/number/Date)
 * - `updatedAt`: Date (coerced from string/number/Date)
 *
 * **Date Coercion:**
 * The `createdAt` and `updatedAt` fields use `z.coerce.date()` which accepts:
 * - Date objects
 * - ISO 8601 strings (e.g., "2024-01-15T10:30:00Z")
 * - Unix timestamps (milliseconds)
 *
 * @example
 * // Valid entity structure
 * baseEntitySchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: new Date()
 * });
 *
 * // With numeric timestamp
 * baseEntitySchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: 1705318200000,
 *   updatedAt: Date.now()
 * });
 */
export const baseEntitySchema = z.object({
  id: uuidSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

/**
 * Soft-deletable entity schema extending base entity with deletion tracking.
 *
 * Adds soft delete capability where records are marked as deleted rather than
 * physically removed from the database. This preserves data for audit trails
 * and potential restoration.
 *
 * **Inheritance:**
 * Extends `baseEntitySchema` with all its fields.
 *
 * **Additional Fields:**
 * - `deletedAt`: Nullable Date indicating when the entity was soft-deleted
 *   - `null`: Entity is active (not deleted)
 *   - `Date`: Entity was deleted at this timestamp
 *
 * @example
 * // Active entity (not deleted)
 * softDeletableEntitySchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-01-15T10:30:00Z',
 *   deletedAt: null
 * });
 *
 * // Soft-deleted entity
 * softDeletableEntitySchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-06-20T14:00:00Z',
 *   deletedAt: '2024-06-20T14:00:00Z'
 * });
 */
export const softDeletableEntitySchema = baseEntitySchema.extend({
  deletedAt: z.coerce.date().nullable()
});

/**
 * Tenant-scoped entity schema for multi-tenant data isolation.
 *
 * Adds organization context for entities that belong to a specific tenant.
 * Essential for multi-tenancy where data must be isolated per organization.
 *
 * **Inheritance:**
 * Extends `baseEntitySchema` with all its fields.
 *
 * **Additional Fields:**
 * - `organizationId`: UUID of the owning organization/tenant
 *
 * **Multi-Tenancy Pattern:**
 * All tenant-scoped queries should filter by `organizationId` to ensure
 * data isolation between tenants.
 *
 * @example
 * // Tenant-scoped entity
 * tenantEntitySchema.parse({
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: '2024-01-15T10:30:00Z',
 *   updatedAt: '2024-01-15T10:30:00Z',
 *   organizationId: '660e8400-e29b-41d4-a716-446655440001'
 * });
 */
export const tenantEntitySchema = baseEntitySchema.extend({
  organizationId: uuidSchema
});
