/**
 * Organization domain validation schemas
 */

import { z } from 'zod';

import { uuidSchema, slug } from '../base';

// ============================================================================
// Enum Value Arrays
// ============================================================================

/**
 * Organization type allowed values.
 *
 * @example
 * ORGANIZATION_TYPE_VALUES.includes('startup'); // true
 */
export const ORGANIZATION_TYPE_VALUES = [
  'startup',
  'enterprise',
  'nonprofit',
  'government'
] as const;

/**
 * Organization status allowed values.
 *
 * @example
 * ORGANIZATION_STATUS_VALUES.includes('active'); // true
 */
export const ORGANIZATION_STATUS_VALUES = ['active', 'inactive', 'suspended'] as const;

// ============================================================================
// Enum Schemas
// ============================================================================

/**
 * Organization type enumeration schema.
 *
 * Categorizes organizations by their business structure and size.
 *
 * **Allowed Values:**
 * - `'startup'`: Early-stage company, typically smaller teams
 * - `'enterprise'`: Large established corporation
 * - `'nonprofit'`: Non-profit organization (501(c)(3) or equivalent)
 * - `'government'`: Government agency or public sector entity
 *
 * @example
 * organizationTypeEnum.parse('startup');     // ✓
 * organizationTypeEnum.parse('enterprise');  // ✓
 * organizationTypeEnum.parse('nonprofit');   // ✓
 * organizationTypeEnum.parse('government');  // ✓
 *
 * @example
 * // Invalid (will throw ZodError)
 * organizationTypeEnum.parse('corporation'); // Not a valid type
 * organizationTypeEnum.parse('STARTUP');     // Case-sensitive
 */
export const organizationTypeEnum = z.enum(ORGANIZATION_TYPE_VALUES);

/**
 * Organization status enumeration schema.
 *
 * Represents the current operational state of an organization.
 *
 * **Allowed Values:**
 * - `'active'`: Organization is operational and can access all features
 * - `'inactive'`: Organization is dormant (voluntary deactivation)
 * - `'suspended'`: Organization access is restricted (administrative action)
 *
 * @example
 * organizationStatusEnum.parse('active');    // ✓
 * organizationStatusEnum.parse('inactive');  // ✓
 * organizationStatusEnum.parse('suspended'); // ✓
 */
export const organizationStatusEnum = z.enum(ORGANIZATION_STATUS_VALUES);

/**
 * Create organization input schema.
 *
 * Validates input data for creating a new organization.
 *
 * **Required Fields:**
 * - `name`: Organization display name (1-100 characters)
 * - `slug`: URL-friendly identifier (kebab-case, validated via slug schema)
 *
 * **Optional Fields:**
 * - `type`: Organization type (defaults to undefined if not provided)
 *
 * **Slug Format:**
 * Must be kebab-case (lowercase letters, numbers, hyphens).
 * Examples: "acme-corp", "my-startup-2024", "tech-solutions"
 *
 * @example
 * // Minimal creation
 * createOrganizationSchema.parse({
 *   name: 'Acme Corporation',
 *   slug: 'acme-corp'
 * });
 *
 * // With type specified
 * createOrganizationSchema.parse({
 *   name: 'Tech Startup Inc',
 *   slug: 'tech-startup-inc',
 *   type: 'startup'
 * });
 *
 * @example
 * // Invalid inputs (will throw ZodError)
 * createOrganizationSchema.parse({ name: '', slug: 'valid' });           // Name required
 * createOrganizationSchema.parse({ name: 'A'.repeat(101), slug: 'x' });  // Name too long
 * createOrganizationSchema.parse({ name: 'Valid', slug: 'Invalid Slug' }); // Slug must be kebab-case
 */
export const createOrganizationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  slug: slug,
  type: organizationTypeEnum.optional()
});

/**
 * Update organization input schema.
 *
 * Validates input data for updating an existing organization.
 * All fields are optional - only provided fields will be updated.
 *
 * **Optional Fields:**
 * - `name`: New organization name (1-100 characters)
 * - `slug`: New URL-friendly identifier (kebab-case)
 * - `type`: New organization type
 * - `status`: New organization status
 *
 * @example
 * // Update name only
 * updateOrganizationSchema.parse({ name: 'New Name' });
 *
 * // Update multiple fields
 * updateOrganizationSchema.parse({
 *   name: 'Updated Corp',
 *   status: 'inactive'
 * });
 *
 * // Change organization type
 * updateOrganizationSchema.parse({ type: 'enterprise' });
 *
 * // Suspend organization
 * updateOrganizationSchema.parse({ status: 'suspended' });
 *
 * // Empty update (valid but no-op)
 * updateOrganizationSchema.parse({});
 */
export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: slug.optional(),
  type: organizationTypeEnum.optional(),
  status: organizationStatusEnum.optional()
});

/**
 * Organization ID schema.
 *
 * Validates organization identifiers as UUIDs.
 *
 * @example
 * organizationIdSchema.parse('550e8400-e29b-41d4-a716-446655440000'); // ✓
 */
export const organizationIdSchema = uuidSchema;

// ============================================================================
// Inferred Types
// ============================================================================

/**
 * Organization type enumeration (inferred from schema).
 *
 * @example
 * const type: OrganizationTypeValue = 'startup';
 */
export type OrganizationTypeValue = z.infer<typeof organizationTypeEnum>;

/**
 * Organization status enumeration (inferred from schema).
 *
 * @example
 * const status: OrganizationStatusValue = 'active';
 */
export type OrganizationStatusValue = z.infer<typeof organizationStatusEnum>;

/**
 * Input type for creating an organization.
 *
 * @example
 * const input: CreateOrganizationInput = {
 *   name: 'Acme Corp',
 *   slug: 'acme-corp',
 *   type: 'startup'
 * };
 */
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/**
 * Input type for updating an organization.
 *
 * @example
 * const input: UpdateOrganizationInput = {
 *   name: 'New Name',
 *   status: 'inactive'
 * };
 */
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/**
 * Organization ID type (UUID string).
 *
 * @example
 * const id: OrganizationId = '550e8400-e29b-41d4-a716-446655440000';
 */
export type OrganizationId = z.infer<typeof organizationIdSchema>;
