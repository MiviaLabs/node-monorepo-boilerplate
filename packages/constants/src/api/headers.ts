/**
 * API header constants
 */

export const API_HEADERS = {
  // Standard headers
  CONTENT_TYPE: 'content-type',
  ACCEPT: 'accept',
  AUTHORIZATION: 'authorization',

  // Custom headers
  X_REQUEST_ID: 'x-request-id',
  X_TENANT_ID: 'x-tenant-id',
  X_CORRELATION_ID: 'x-correlation-id',
  X_CAUSATION_ID: 'x-causation-id',

  // Rate limiting
  X_RATE_LIMIT_LIMIT: 'x-ratelimit-limit',
  X_RATE_LIMIT_REMAINING: 'x-ratelimit-remaining',
  X_RATE_LIMIT_RESET: 'x-ratelimit-reset'
} as const;
