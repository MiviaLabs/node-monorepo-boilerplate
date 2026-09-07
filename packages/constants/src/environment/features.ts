/**
 * Feature flag constants
 */

export const FEATURE_FLAGS = {
  // User features
  USER_REGISTRATION: 'user_registration',
  USER_EMAIL_VERIFICATION: 'user_email_verification',
  USER_2FA: 'user_2fa',

  // Organization features
  ORG_MULTI_TENANT: 'org_multi_tenant',
  ORG_SSO: 'org_sso',

  // API features
  API_RATE_LIMITING: 'api_rate_limiting',
  API_CACHING: 'api_caching',
  API_VERSIONING: 'api_versioning'
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];
