/**
 * Auth Module Constants
 *
 * Constants for authentication operations, providers, and validation
 */

import type { IdentityProvider } from '@package/db-core';

/**
 * Supported identity providers
 * Maps to Firebase/GCP Identity Platform providers
 */
export const AUTH_PROVIDERS = {
  GOOGLE: 'google.com' as IdentityProvider,
  MICROSOFT: 'microsoft.com' as IdentityProvider,
  APPLE: 'apple.com' as IdentityProvider,
  LINKEDIN: 'linkedin.com' as IdentityProvider,
  GITHUB: 'github.com' as IdentityProvider,
  FACEBOOK: 'facebook.com' as IdentityProvider,
  PHONE: 'phone' as IdentityProvider,
  EMAIL_PASSWORD: 'email_password' as IdentityProvider
} as const;

/**
 * Token expiration times (in seconds)
 */
export const TOKEN_EXPIRATION = {
  ACCESS_TOKEN: 3600, // 1 hour
  REFRESH_TOKEN: 1209600, // 14 days
  ID_TOKEN: 3600 // 1 hour
} as const;

/**
 * Session configuration
 */
export const SESSION_CONFIG = {
  MAX_SESSIONS_PER_USER: 10,
  SESSION_INACTIVITY_TIMEOUT: 30 * 60, // 30 minutes
  REMEMBER_ME_DURATION: 30 * 24 * 60 * 60 // 30 days
} as const;

/**
 * Password requirements
 */
export const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL: true
} as const;

/**
 * Rate limiting configuration
 *
 * These are the default values. Actual values can be overridden via environment variables:
 * - THROTTLE_ENABLED
 * - THROTTLE_LOGIN_LIMIT, THROTTLE_LOGIN_TTL
 * - THROTTLE_REGISTRATION_LIMIT, THROTTLE_REGISTRATION_TTL
 * - THROTTLE_REFRESH_TOKEN_LIMIT, THROTTLE_REFRESH_TOKEN_TTL
 * - THROTTLE_OAUTH_LIMIT, THROTTLE_OAUTH_TTL
 * - THROTTLE_PHONE_LOGIN_LIMIT, THROTTLE_PHONE_LOGIN_TTL
 * - THROTTLE_VALIDATE_TOKEN_LIMIT, THROTTLE_VALIDATE_TOKEN_TTL
 * - THROTTLE_PASSWORD_RESET_LIMIT, THROTTLE_PASSWORD_RESET_TTL
 *
 * @see apps/api/.env.example for complete environment variable documentation
 */
export const RATE_LIMITS = {
  LOGIN_ATTEMPTS: 5,
  LOGIN_WINDOW: 15 * 60, // 15 minutes in seconds
  REGISTRATION_ATTEMPTS: 3,
  REGISTRATION_WINDOW: 60 * 60, // 1 hour in seconds
  REFRESH_TOKEN_ATTEMPTS: 10,
  REFRESH_TOKEN_WINDOW: 5 * 60, // 5 minutes in seconds
  OAUTH_ATTEMPTS: 10,
  OAUTH_WINDOW: 5 * 60, // 5 minutes in seconds
  PHONE_LOGIN_ATTEMPTS: 5,
  PHONE_LOGIN_WINDOW: 15 * 60, // 15 minutes in seconds
  VALIDATE_TOKEN_ATTEMPTS: 100,
  VALIDATE_TOKEN_WINDOW: 60, // 1 minute in seconds
  PASSWORD_RESET_ATTEMPTS: 3,
  PASSWORD_RESET_WINDOW: 60 * 60 // 1 hour in seconds
} as const;

/**
 * Error codes
 */
export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_001',
  USER_NOT_FOUND: 'AUTH_002',
  IDENTITY_NOT_FOUND: 'AUTH_003',
  PROVIDER_NOT_SUPPORTED: 'AUTH_004',
  TOKEN_INVALID: 'AUTH_005',
  TOKEN_EXPIRED: 'AUTH_006',
  REFRESH_TOKEN_INVALID: 'AUTH_007',
  SESSION_EXPIRED: 'AUTH_008',
  ACCOUNT_LOCKED: 'AUTH_009',
  EMAIL_NOT_VERIFIED: 'AUTH_010',
  WEAK_PASSWORD: 'AUTH_011',
  PASSWORD_MISMATCH: 'AUTH_012',
  IDENTITY_ALREADY_LINKED: 'AUTH_013',
  CANNOT_UNLINK_PRIMARY_IDENTITY: 'AUTH_014',
  ACCOUNT_NOT_FOUND: 'AUTH_015',
  EMAIL_ALREADY_EXISTS: 'AUTH_016'
} as const;

/**
 * Tenant ID for public authentication routes.
 *
 * Used when authentication events occur before tenant association is established
 * (e.g., initial login, registration). This sentinel value ensures outbox records
 * have a valid, non-empty tenantId for proper event routing and uniqueness constraints.
 */
export const PUBLIC_AUTH_TENANT_ID = 'PUBLIC_AUTH';

/**
 * Cache key prefixes
 */
export const CACHE_KEYS = {
  USER_SESSIONS: (userId: string) => `auth:sessions:user:${userId}`,
  SESSION: (sessionId: string) => `auth:session:${sessionId}`,
  REFRESH_TOKEN: (tokenId: string) => `auth:refresh:${tokenId}`,
  USER_IDENTITIES: (userId: string) => `auth:identities:user:${userId}`,
  PROVIDER_IDENTITY: (provider: string, providerUid: string) =>
    `auth:identity:${provider}:${providerUid}`
} as const;
