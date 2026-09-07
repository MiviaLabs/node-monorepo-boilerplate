/**
 * Tenants module types
 *
 * Type definitions for GCP tenant management operations.
 */

/**
 * Multi-factor authentication state
 */
export const enum MultiFactorState {
  REQUIRED = 'REQUIRED',
  OPTIONAL = 'OPTIONAL',
  DISABLED = 'DISABLED'
}

/**
 * GCP tenant configuration options
 */
export interface GcpTenantConfig {
  displayName: string;
  emailSignInEnabled: boolean;
  passwordPolicy?: {
    enabled: boolean;
    minLength?: number;
  };
  multiFactorConfig?: {
    enabled: boolean;
    state?: MultiFactorState;
  };
}

/**
 * GCP tenant creation result
 */
export interface GcpTenantResult {
  tenantId: string; // GCP tenant ID (UUID from Firebase)
  displayName: string;
}

/**
 * Provision GCP tenant command props
 */
export interface ProvisionGcpTenantCommandProps {
  tenantId: string;
  actorId: string;
  organizationId: number;
  displayName: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Organization with GCP tenant
 */
export interface OrganizationWithGcpTenant {
  id: number;
  tenantId: number;
  ownerId: number | null;
  publicId: string;
  name: string;
  displayName: string | null;
  slug: string;
  gcpTenantId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
