/**
 * Timeout constants (in milliseconds)
 */

export const TIMEOUTS = {
  // Request timeouts
  DEFAULT_REQUEST_TIMEOUT: 30000, // 30 seconds
  SHORT_REQUEST_TIMEOUT: 5000, // 5 seconds
  LONG_REQUEST_TIMEOUT: 120000, // 2 minutes

  // Connection timeouts
  CONNECTION_TIMEOUT: 10000, // 10 seconds

  // Database timeouts
  DB_QUERY_TIMEOUT: 5000, // 5 seconds
  DB_CONNECTION_TIMEOUT: 5000, // 5 seconds

  // External service timeouts
  EXTERNAL_SERVICE_TIMEOUT: 15000 // 15 seconds
} as const;
