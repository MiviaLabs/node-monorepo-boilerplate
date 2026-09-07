/**
 * Organization seed data factory
 *
 * Functional factory for creating test organization data following existing
 * fixture patterns. Uses clearly identifiable test data to avoid confusion
 * with production data.
 *
 * Security features:
 * - Uses [SEED-TEST] prefix for easy identification
 * - Generates unique slugs for each organization
 * - Active status by default
 *
 * @module seed/factories/organization.factory
 */

import { randomUUID } from 'node:crypto';

import type { NewOrganization, NewTenant } from '../../schemas';

/**
 * Default values for organization seed data
 *
 * These defaults ensure all seed organizations are:
 * - Clearly identifiable with [SEED-TEST] prefix
 * - Using unique slugs for subdomain routing
 * - Active by default
 */
const DEFAULT_ORGANIZATION_VALUES = {
  isActive: true
} as const;

/**
 * Default values for tenant seed data
 *
 * These defaults ensure all seed tenants are:
 * - Organization type (standard tenant)
 * - Active status
 */
const DEFAULT_TENANT_VALUES = {
  type: 'organization' as const,
  status: 'active' as const
} as const;

/**
 * Options for creating test organization (tenantId is required)
 */
export interface CreateTestOrganizationOptions {
  /** Tenant ID (required) */
  tenantId: number;
  /** Owner user ID (optional) */
  ownerId?: number;
  /** Organization name (optional, auto-generated if not provided) */
  name?: string;
  /** Organization slug (optional, auto-generated if not provided) */
  slug?: string;
  /** Whether the organization is active */
  isActive?: boolean;
}

/**
 * Create a test organization for seed data
 *
 * Generates an organization with clearly identifiable test data. The name
 * uses a [SEED-TEST] prefix and the slug is generated from a UUID to ensure
 * uniqueness for subdomain routing.
 *
 * @param options - Organization options (tenantId is required)
 * @returns NewOrganization object for database insertion
 *
 * @example
 * ```typescript
 * import { createTestOrganization } from '@package/db-core/seed/factories';
 *
 * const organization = createTestOrganization({
 *   tenantId: 1,
 *   ownerId: 1,
 * });
 * ```
 */
export function createTestOrganization(options: CreateTestOrganizationOptions): NewOrganization {
  const uuid = randomUUID();
  const orgName = options.name ?? `[SEED-TEST] Organization ${uuid.slice(0, 8)}`;
  const slug = options.slug ?? `seed-test-${uuid.slice(0, 8)}`;

  return {
    name: orgName,
    slug,
    tenantId: options.tenantId,
    ownerId: options.ownerId,
    // Start with default values
    ...DEFAULT_ORGANIZATION_VALUES,
    // Then apply any remaining options
    ...(options.isActive !== undefined ? { isActive: options.isActive } : {})
  };
}

/**
 * Create multiple test organizations
 *
 * Generates an array of test organizations. Each organization will have a
 * unique name and slug due to random UUID generation.
 *
 * @param count - Number of organizations to create
 * @param baseOptions - Base options to apply to all organizations.
 *                      Must include `tenantId`.
 * @returns Array of NewOrganization objects for database insertion
 *
 * @example
 * ```typescript
 * import { createTestOrganizations } from '@package/db-core/seed/factories';
 *
 * const organizations = createTestOrganizations(5, {
 *   tenantId: 1,
 *   isActive: true,
 * });
 * ```
 */
export function createTestOrganizations(
  count: number,
  baseOptions: Omit<CreateTestOrganizationOptions, 'name' | 'slug'>
): NewOrganization[] {
  return Array.from({ length: count }, () => createTestOrganization(baseOptions));
}

/**
 * Create a test tenant for seed data
 *
 * Generates a tenant record with default values for organization-type tenants.
 * Tenants are the parent entities for organizations in multi-tenant architecture.
 *
 * @param overrides - Partial tenant data to override defaults
 * @returns NewTenant object for database insertion
 *
 * @example
 * ```typescript
 * import { createTestTenant } from '@package/db-core/seed/factories';
 *
 * const tenant = createTestTenant({
 *   name: 'Test Tenant',
 * });
 * ```
 */
export function createTestTenant(overrides: Partial<NewTenant> = {}): NewTenant {
  return {
    ...DEFAULT_TENANT_VALUES,
    ...overrides
  };
}

/**
 * Create multiple test tenants
 *
 * Generates an array of tenant records with default values.
 *
 * @param count - Number of tenants to create
 * @param overrides - Partial tenant data to apply to all tenants
 * @returns Array of NewTenant objects for database insertion
 *
 * @example
 * ```typescript
 * import { createTestTenants } from '@package/db-core/seed/factories';
 *
 * const tenants = createTestTenants(3, {
 *   name: 'Test Tenant',
 * });
 * ```
 */
export function createTestTenants(count: number, overrides: Partial<NewTenant> = {}): NewTenant[] {
  return Array.from({ length: count }, () => createTestTenant(overrides));
}
