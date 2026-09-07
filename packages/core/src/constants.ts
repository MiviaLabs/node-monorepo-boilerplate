/**
 * Infrastructure constants
 *
 * Provides utility constants for infrastructure operations.
 */

/**
 * Standard metric units
 */
export const METRIC_UNITS = {
  MILLISECONDS: 'ms',
  SECONDS: 's',
  BYTES: 'By',
  REQUESTS: '1',
  OPERATIONS: '1',
  PERCENTAGE: '%'
} as const;

/**
 * Provider type identifiers
 */
export const PROVIDER_TYPES = {
  SECRETS: 'secrets',
  ENCRYPTION: 'encryption',
  QUEUES: 'queues',
  EVENTS: 'events',
  REDIS: 'redis',
  OBSERVABILITY: 'observability'
} as const;

/**
 * Environment variable prefixes
 */
export const ENV_PREFIXES = {
  AWS: 'AWS_',
  GCP: 'GOOGLE_CLOUD_',
  AZURE: 'AZURE_',
  VAULT: 'VAULT_',
  REDIS: 'REDIS_'
} as const;
