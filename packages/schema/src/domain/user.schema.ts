/**
 * User domain validation schemas
 */

import { z } from 'zod';

import { emailSchema, uuidSchema } from '../base';

// ============================================================================
// Enum Value Arrays
// ============================================================================

/**
 * User role allowed values.
 *
 * @example
 * USER_ROLE_VALUES.includes('admin'); // true
 */
export const USER_ROLE_VALUES = ['admin', 'user', 'guest'] as const;

/**
 * User status allowed values.
 *
 * @example
 * USER_STATUS_VALUES.includes('active'); // true
 */
export const USER_STATUS_VALUES = ['active', 'inactive', 'suspended', 'deleted'] as const;

// ============================================================================
// Enum Schemas
// ============================================================================

/**
 * User role enumeration schema.
 *
 * Defines access levels for users in the system.
 *
 * **Allowed Values:**
 * - `'admin'`: Full administrative access to all features
 * - `'user'`: Standard user access with normal permissions
 * - `'guest'`: Limited access, typically read-only or trial
 *
 * @example
 * userRoleEnum.parse('admin'); // ✓
 * userRoleEnum.parse('user');  // ✓
 * userRoleEnum.parse('guest'); // ✓
 *
 * @example
 * // Invalid (will throw ZodError)
 * userRoleEnum.parse('superadmin'); // Not a valid role
 * userRoleEnum.parse('ADMIN');      // Case-sensitive
 */
export const userRoleEnum = z.enum(USER_ROLE_VALUES);

/** Inferred type for {@link userRoleEnum} - 'admin' | 'user' | 'guest' */
export type UserRoleValue = z.infer<typeof userRoleEnum>;

/**
 * User status enumeration schema.
 *
 * Represents the account state of a user.
 *
 * **Allowed Values:**
 * - `'active'`: Account is operational and can access the system
 * - `'inactive'`: Account is dormant (user-initiated or inactivity)
 * - `'suspended'`: Account access is restricted (administrative action)
 * - `'deleted'`: Account is soft-deleted (marked for removal)
 *
 * @example
 * userStatusEnum.parse('active');    // ✓
 * userStatusEnum.parse('inactive');  // ✓
 * userStatusEnum.parse('suspended'); // ✓
 * userStatusEnum.parse('deleted');   // ✓
 */
export const userStatusEnum = z.enum(USER_STATUS_VALUES);

/** Inferred type for {@link userStatusEnum} - 'active' | 'inactive' | 'suspended' | 'deleted' */
export type UserStatusValue = z.infer<typeof userStatusEnum>;

/**
 * Create user input schema.
 *
 * Validates input data for creating a new user account.
 *
 * **Required Fields:**
 * - `email`: Valid email address (normalized: lowercase, trimmed)
 * - `password`: Minimum 8 characters
 *
 * **Optional Fields:**
 * - `name`: Display name (1-100 characters)
 * - `role`: User role (defaults to 'user' typically)
 *
 * **Password Requirements:**
 * Minimum 8 characters. For stronger requirements, use custom validators
 * from `@package/schema/custom` (strongPasswordSchema, mediumPasswordSchema).
 *
 * @example
 * // Minimal creation
 * createUserSchema.parse({
 *   email: 'user@example.com',
 *   password: 'securePass123'
 * });
 *
 * // With all fields
 * createUserSchema.parse({
 *   email: 'admin@example.com',
 *   password: 'AdminPass123!',
 *   name: 'John Doe',
 *   role: 'admin'
 * });
 *
 * @example
 * // Invalid inputs (will throw ZodError)
 * createUserSchema.parse({ email: 'invalid', password: '12345678' });   // Invalid email
 * createUserSchema.parse({ email: 'a@b.com', password: 'short' });      // Password < 8 chars
 * createUserSchema.parse({ email: 'a@b.com', password: '12345678', name: '' }); // Empty name
 * createUserSchema.parse({ email: 'a@b.com', password: '12345678', name: 'A'.repeat(101) }); // Name > 100
 */
export const createUserSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(100).optional(),
  role: userRoleEnum.optional()
});

/** Inferred type for {@link createUserSchema} */
export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Update user input schema.
 *
 * Validates input data for updating an existing user account.
 * All fields are optional - only provided fields will be updated.
 *
 * **Optional Fields:**
 * - `email`: New email address (validated and normalized)
 * - `name`: New display name (1-100 characters)
 * - `role`: New user role
 * - `status`: New account status
 *
 * **Note:** Password updates should use a separate change-password flow
 * with current password verification, not this general update schema.
 *
 * @example
 * // Update name only
 * updateUserSchema.parse({ name: 'Jane Doe' });
 *
 * // Update multiple fields
 * updateUserSchema.parse({
 *   name: 'Jane Smith',
 *   role: 'admin'
 * });
 *
 * // Deactivate user
 * updateUserSchema.parse({ status: 'inactive' });
 *
 * // Suspend user
 * updateUserSchema.parse({ status: 'suspended' });
 *
 * // Empty update (valid but no-op)
 * updateUserSchema.parse({});
 */
export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  name: z.string().min(1).max(100).optional(),
  role: userRoleEnum.optional(),
  status: userStatusEnum.optional()
});

/** Inferred type for {@link updateUserSchema} */
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/**
 * User ID schema.
 *
 * Validates user identifiers as UUIDs.
 *
 * @example
 * userIdSchema.parse('550e8400-e29b-41d4-a716-446655440000'); // ✓
 * userIdSchema.parse('invalid-uuid'); // ZodError
 */
export const userIdSchema = uuidSchema;

/** Inferred type for {@link userIdSchema} */
export type UserId = z.infer<typeof userIdSchema>;
