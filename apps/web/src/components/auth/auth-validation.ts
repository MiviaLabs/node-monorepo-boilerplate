/**
 * Authentication form validation schemas
 */

import { z } from 'zod';

/**
 * Helper to generate URL-safe organization slug from a display name.
 */
function generateOrganizationSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace invalid chars with hyphen
    .replace(/^-+/g, '') // Remove leading hyphens
    .replace(/-+$/g, '') // Remove trailing hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .substring(0, 50); // Max 50 chars
}

/**
 * Login form schema
 *
 * @example
 * ```typescript
 * const result = loginSchema.safeParse({
 *   email: 'user@example.com',
 *   password: 'password123',
 *   rememberMe: true
 * });
 * ```
 */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Invalid email address'),
  password: z
    .string()
    .trim()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional()
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Register form schema
 *
 * @example
 * ```typescript
 * const result = registerSchema.safeParse({
 *   displayName: 'John Doe',
 *   organizationName: 'Acme Corp',
 *   email: 'john@example.com',
 *   password: 'SecurePass123!',
 *   confirmPassword: 'SecurePass123!',
 *   terms: true
 * });
 * ```
 */
export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Display name is required')
      .min(2, 'Display name must be at least 2 characters')
      .max(50, 'Display name must be less than 50 characters'),
    organizationName: z
      .string()
      .trim()
      .min(1, 'Organization name is required')
      .min(2, 'Organization name must be at least 2 characters')
      .max(100, 'Organization name must be less than 100 characters')
      .optional(),
    organizationSlug: z
      .string()
      .trim()
      .regex(
        /^[a-z0-9-]+$/,
        'Organization slug can contain only lowercase letters, numbers, and hyphens'
      )
      .min(4, 'Organization slug must be at least 4 characters')
      .max(50, 'Organization slug must be less than 50 characters')
      .optional(),
    email: z.string().trim().min(1, 'Email is required').email('Invalid email address'),
    password: z
      .string()
      .trim()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/\d/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    terms: z.boolean().refine((val) => val === true, 'You must accept the terms and conditions')
  })
  .refine(
    (data) => {
      if (!data.organizationName) {
        return true;
      }
      const generated = generateOrganizationSlug(data.organizationName);
      return generated.length >= 4 && data.organizationSlug === generated;
    },
    {
      message: 'Organization slug must match the generated slug from organization name',
      path: ['organizationSlug']
    }
  )
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Returns the register payload adjusted for invitation-based signup flows.
 *
 * @param data Register form values after schema parsing.
 * @param isInvitationFlow Whether the current registration flow comes from an invitation.
 * @returns The original data for normal signup, or invitation-safe data with organization fields removed.
 */
/**
 * Prepares registration form data based on the flow type.
 *
 * For invitation flows, removes organization fields (name and slug) as they're
 * pre-determined by the invitation. For normal signup flows, returns data unchanged.
 *
 * @param data - The registration form values after schema parsing
 * @param isInvitationFlow - Whether the current registration flow comes from an invitation
 * @returns The original data for normal signup, or invitation-safe data with organization fields removed
 */
export function getRegisterValidationData(
  data: RegisterFormData,
  isInvitationFlow: boolean
): RegisterFormData {
  if (!isInvitationFlow) {
    return {
      ...data,
      organizationSlug: data.organizationName
        ? generateOrganizationSlug(data.organizationName)
        : data.organizationSlug
    };
  }

  return {
    ...data,
    organizationName: undefined,
    organizationSlug: undefined
  };
}

export { generateOrganizationSlug };

/**
 * Schema for forgot password form validation
 *
 * @example
 * ```typescript
 * const result = forgotPasswordSchema.safeParse({
 *   email: 'user@example.com'
 * });
 * ```
 */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Invalid email address')
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Schema for reset password form validation
 *
 * @example
 * ```typescript
 * const result = resetPasswordFormSchema.safeParse({
 *   newPassword: 'SecurePass123!',
 *   confirmPassword: 'SecurePass123!'
 * });
 * ```
 */
export const resetPasswordFormSchema = z
  .object({
    newPassword: z
      .string()
      .trim()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/\d/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
    confirmPassword: z.string().trim().min(1, 'Please confirm your password')
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordFormSchema>;
