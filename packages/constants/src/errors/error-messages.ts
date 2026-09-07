/**
 * Error message constants
 *
 * Typed string constants for error messages used across the application.
 * Use these constants to ensure consistency between logs and exceptions.
 */

export const ERROR_MESSAGES = {
  // Authentication/Authorization messages
  TENANT_CONTEXT_NOT_SET: 'Tenant context not set',
  USER_NOT_AUTHENTICATED: 'User not authenticated',
  INVALID_USER_CONTEXT: 'Invalid user context'
} as const;

export type ErrorMessage = (typeof ERROR_MESSAGES)[keyof typeof ERROR_MESSAGES];
