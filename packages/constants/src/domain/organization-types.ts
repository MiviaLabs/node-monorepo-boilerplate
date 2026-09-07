/**
 * Organization type constants
 */

export const ORGANIZATION_TYPE = {
  STARTUP: 'startup',
  ENTERPRISE: 'enterprise',
  NONPROFIT: 'nonprofit',
  GOVERNMENT: 'government'
} as const;

export type OrganizationType = (typeof ORGANIZATION_TYPE)[keyof typeof ORGANIZATION_TYPE];
