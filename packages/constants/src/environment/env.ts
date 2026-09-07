/**
 * Environment constants
 */

export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test'
} as const;

export type Environment = (typeof ENVIRONMENT)[keyof typeof ENVIRONMENT];
