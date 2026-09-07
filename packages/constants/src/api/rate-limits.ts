/**
 * Rate limiting constants
 */

export const RATE_LIMITS = {
  // Public endpoints
  PUBLIC_REQUESTS_PER_MINUTE: 30,
  PUBLIC_REQUESTS_PER_HOUR: 1000,

  // Authenticated endpoints
  AUTH_REQUESTS_PER_MINUTE: 60,
  AUTH_REQUESTS_PER_HOUR: 2000,

  // Admin endpoints
  ADMIN_REQUESTS_PER_MINUTE: 120,
  ADMIN_REQUESTS_PER_HOUR: 5000,

  // Burst allowance
  BURST_MULTIPLIER: 2
} as const;
