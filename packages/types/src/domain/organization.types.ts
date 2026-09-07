/**
 * Domain types for Organization entity
 */

/**
 * Unique identifier for an organization
 */
export type OrganizationId = string;

/**
 * Organization types
 */
export const OrganizationType = {
  STARTUP: 'startup',
  ENTERPRISE: 'enterprise',
  NONPROFIT: 'nonprofit',
  GOVERNMENT: 'government'
} as const;

/** Organization type */
export type OrganizationType = (typeof OrganizationType)[keyof typeof OrganizationType];

/**
 * Organization status
 */
export const OrganizationStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended'
} as const;

/** Organization status type */
export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];

/**
 * Organization entity interface
 */
export interface Organization {
  readonly id: OrganizationId;
  readonly name: string;
  readonly slug: string;
  readonly type: OrganizationType;
  readonly status: OrganizationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Input for creating a new organization
 */
export interface CreateOrganizationInput {
  readonly name: string;
  readonly slug: string;
  readonly type?: OrganizationType;
}

/**
 * Input for updating an organization
 */
export interface UpdateOrganizationInput {
  readonly name?: string;
  readonly slug?: string;
  readonly type?: OrganizationType;
  readonly status?: OrganizationStatus;
}
