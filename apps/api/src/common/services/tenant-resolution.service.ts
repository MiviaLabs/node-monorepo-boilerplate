/**
 * Tenant Resolution Service
 *
 * Cross-cutting infrastructure service for resolving and validating tenants.
 * Supports both ID-based resolution (from x-tenant-id header) and
 * slug-based resolution (from subdomain for organizations).
 *
 * This service is NOT a domain-specific module - it's infrastructure
 * for tenant context resolution across all features.
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tenants, organizations, eq, type TenantType, type TenantStatus } from '@package/db-core';
import { CacheService } from '@package/redis';

import { MAIN_DB } from '../database';
import { ApiException } from '../errors';
import { measurePhase0, recordPhase0Note } from './phase-zero-diagnostics.service';

import type { CacheConfig as AppConfigCacheConfig } from '@/config/cache.config';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Local cache configuration interface for tenant resolution service
 * Maps the app-wide cache config to the format used by this service
 */
interface CacheConfig {
  enabled: boolean;
  defaultTTL: number;
  listTTL: number;
  prefixes: {
    tenantOrg: string;
    tenantSlug: string;
  };
}

/**
 * Tenant resolution result
 *
 * Contains all tenant information needed for request processing.
 */
export interface TenantResolutionResult {
  /** Internal tenant ID (integer) */
  id: number;
  /** Public tenant ID (UUID) */
  publicId: string;
  /** Tenant type (organization, team, individual) */
  type: TenantType;
  /** Tenant status (draft, trial, active, suspended, deleted) */
  status: TenantStatus;
  /** Tenant settings (features, limits, branding) */
  settings: Record<string, unknown>;
  /** Organization details (only for organization tenants) */
  organization?: {
    id: number;
    name: string;
    slug: string;
  };
}

/**
 * Tenant Resolution Service
 *
 * Resolves tenants by ID or slug with caching support.
 */
@Injectable()
export class TenantResolutionService {
  private readonly logger = new Logger(TenantResolutionService.name);
  private readonly cacheEnabled: boolean;
  private readonly cacheConfig: CacheConfig;

  constructor(
    @Inject(MAIN_DB) @Optional() private readonly db: NodePgDatabase,
    @Optional() private readonly cache: CacheService,
    @Optional() private readonly config: ConfigService
  ) {
    // Cache is optional - may not be available in all environments
    this.cacheEnabled = !!this.cache;
    // Load cache configuration with fallback to defaults
    const cacheConfigFromEnv = this.config?.get<AppConfigCacheConfig>('cache');
    this.cacheConfig = {
      enabled: cacheConfigFromEnv?.enabled ?? true,
      defaultTTL: cacheConfigFromEnv?.ttl?.entity ?? 300,
      listTTL: cacheConfigFromEnv?.ttl?.list ?? 60,
      prefixes: {
        tenantOrg: cacheConfigFromEnv?.prefixes?.tenantOrg ?? 'tenant:org:',
        tenantSlug: cacheConfigFromEnv?.prefixes?.tenantSlug ?? 'tenant:slug:'
      }
    };
  }

  /**
   * Resolve tenant by ID (from x-tenant-id header)
   *
   * CRITICAL: This method looks up by organizations.id (NOT tenants.id).
   * This is because the entire codebase uses organization.id as the "tenant ID"
   * for scoping queries and data access. The x-tenant-id header contains
   * organization.id, which is then used to find the associated tenant.
   *
   * @param tenantId - Organization ID as string (will be validated as integer)
   * @returns Tenant resolution result or null if not found
   * @throws ApiException.tenantIdInvalidFormat if ID is not a valid integer
   *
   * @example
   * ```typescript
   * const tenant = await this.tenantResolution.findById('123');
   * if (tenant) {
   *   console.log('Tenant:', tenant.type, tenant.status);
   * }
   * ```
   */
  async findById(tenantId: string): Promise<TenantResolutionResult | null> {
    return measurePhase0(
      'api.tenant_resolution.find_by_id',
      {
        cacheEnabled: this.cacheEnabled
      },
      async () => {
        // Validate tenant ID format - must be integer
        const parsedId = Number.parseInt(tenantId, 10);
        if (Number.isNaN(parsedId) || parsedId <= 0) {
          throw ApiException.tenantIdInvalidFormat(tenantId, 'Must be a valid positive integer');
        }

        // Check cache first (5-minute TTL)
        const cacheKey = `${this.cacheConfig.prefixes.tenantOrg}${tenantId}`;
        if (this.cacheEnabled) {
          try {
            const cached = await this.cache.get<TenantResolutionResult>(cacheKey);
            if (cached) {
              this.logger.debug(`Cache hit for organization ${tenantId}`);
              recordPhase0Note('api.tenant_resolution.find_by_id.cache_hit', {
                cacheEnabled: this.cacheEnabled
              });
              return cached;
            }

            recordPhase0Note('api.tenant_resolution.find_by_id.cache_miss', {
              cacheEnabled: this.cacheEnabled
            });
          } catch (error) {
            // Cache failure should not break tenant resolution
            this.logger.warn(`Cache get failed for key ${cacheKey}:`, error);
          }
        }

        const [row] = await this.db
          .select({
            tenantId: tenants.id,
            tenantPublicId: tenants.publicId,
            tenantType: tenants.type,
            tenantStatus: tenants.status,
            tenantSettings: tenants.settings,
            organizationId: organizations.id,
            organizationName: organizations.name,
            organizationSlug: organizations.slug
          })
          .from(organizations)
          .innerJoin(tenants, eq(tenants.id, organizations.tenantId))
          .where(eq(organizations.id, parsedId))
          .limit(1);

        if (!row) {
          return null;
        }

        const result: TenantResolutionResult = {
          id: row.tenantId,
          publicId: row.tenantPublicId,
          type: row.tenantType as TenantResolutionResult['type'],
          status: row.tenantStatus as TenantResolutionResult['status'],
          settings: (row.tenantSettings as Record<string, unknown>) ?? {},
          organization: {
            id: row.organizationId,
            name: row.organizationName,
            slug: row.organizationSlug
          }
        };

        // Cache the result (5-minute TTL)
        if (this.cacheEnabled) {
          try {
            await this.cache.set(cacheKey, result, { ttl: this.cacheConfig.defaultTTL });
          } catch (error) {
            this.logger.warn(`Cache set failed for key ${cacheKey}:`, error);
          }
        }

        return result;
      }
    );
  }

  /**
   * Resolve tenant by subdomain slug (from hostname)
   *
   * Two-step lookup using SINGLE JOIN QUERY (not N+1).
   * Only works for organization tenants (they have slugs).
   *
   * @param slug - Organization slug (2-50 characters)
   * @returns Tenant resolution result or null if not found
   * @throws ApiException.tenantIdInvalidFormat if slug is invalid
   *
   * @example
   * ```typescript
   * // From subdomain: acme.app.com
   * const tenant = await this.tenantResolution.findBySlug('acme');
   * ```
   */
  async findBySlug(slug: string): Promise<TenantResolutionResult | null> {
    return measurePhase0(
      'api.tenant_resolution.find_by_slug',
      {
        cacheEnabled: this.cacheEnabled
      },
      async () => {
        // Validate slug format
        if (!slug || slug.length < 2 || slug.length > 50) {
          throw ApiException.tenantIdInvalidFormat(slug, 'Slug must be 2-50 characters');
        }

        // Check cache first (5-minute TTL)
        const cacheKey = `${this.cacheConfig.prefixes.tenantSlug}${slug}`;
        if (this.cacheEnabled) {
          try {
            const cached = await this.cache.get<TenantResolutionResult>(cacheKey);
            if (cached) {
              this.logger.debug(`Cache hit for slug ${slug}`);
              recordPhase0Note('api.tenant_resolution.find_by_slug.cache_hit', {
                cacheEnabled: this.cacheEnabled
              });
              return cached;
            }

            recordPhase0Note('api.tenant_resolution.find_by_slug.cache_miss', {
              cacheEnabled: this.cacheEnabled
            });
          } catch (error) {
            this.logger.warn(`Cache get failed for key ${cacheKey}:`, error);
          }
        }

        const [row] = await this.db
          .select({
            tenantId: tenants.id,
            tenantPublicId: tenants.publicId,
            tenantType: tenants.type,
            tenantStatus: tenants.status,
            tenantSettings: tenants.settings,
            organizationId: organizations.id,
            organizationName: organizations.name,
            organizationSlug: organizations.slug
          })
          .from(organizations)
          .innerJoin(tenants, eq(tenants.id, organizations.tenantId))
          .where(eq(organizations.slug, slug))
          .limit(1);

        if (!row) {
          return null;
        }

        const tenantResult: TenantResolutionResult = {
          id: row.tenantId,
          publicId: row.tenantPublicId,
          type: row.tenantType as TenantResolutionResult['type'],
          status: row.tenantStatus as TenantResolutionResult['status'],
          settings: (row.tenantSettings as Record<string, unknown>) ?? {},
          organization: {
            id: row.organizationId,
            name: row.organizationName,
            slug: row.organizationSlug
          }
        };

        // Cache the result (5-minute TTL)
        if (this.cacheEnabled) {
          try {
            await this.cache.set(cacheKey, tenantResult, { ttl: this.cacheConfig.defaultTTL });
          } catch (error) {
            this.logger.warn(`Cache set failed for key ${cacheKey}:`, error);
          }
        }

        return tenantResult;
      }
    );
  }

  /**
   * Validate tenant is active and accessible
   *
   * Use this for protected routes that require an active tenant.
   *
   * @param tenantId - Tenant ID to validate
   * @returns Tenant resolution result
   * @throws ApiException.tenantNotFound if tenant doesn't exist
   * @throws ApiException.tenantSuspended if tenant is not active
   *
   * @example
   * ```typescript
   * try {
   *   const tenant = await this.tenantResolution.validateTenant('123');
   *   console.log('Tenant is active:', tenant.status === 'active');
   * } catch (error) {
   *   if (error instanceof ApiException) {
   *     // Handle tenant not found or suspended
   *   }
   * }
   * ```
   */
  async validateTenant(tenantId: string): Promise<TenantResolutionResult> {
    const tenant = await this.findById(tenantId);

    if (!tenant) {
      throw ApiException.tenantNotFound(tenantId);
    }

    if (tenant.status !== 'active') {
      throw ApiException.tenantSuspended(tenant.id.toString());
    }

    return tenant;
  }

  /**
   * Validate tenant by subdomain slug
   *
   * Use this for subdomain-based routing to organizations.
   *
   * @param slug - Organization slug to validate
   * @returns Tenant resolution result
   * @throws ApiException.tenantNotFound if organization doesn't exist
   * @throws ApiException.tenantSuspended if tenant is not active
   *
   * @example
   * ```typescript
   * const tenant = await this.tenantResolution.validateTenantBySlug('acme');
   * // Tenant is guaranteed to be active and accessible
   * ```
   */
  async validateTenantBySlug(slug: string): Promise<TenantResolutionResult> {
    const tenant = await this.findBySlug(slug);

    if (!tenant) {
      throw ApiException.tenantNotFound(slug);
    }

    if (tenant.status !== 'active') {
      throw ApiException.tenantSuspended(tenant.id.toString());
    }

    return tenant;
  }

  /**
   * Invalidate cache when tenant or organization status changes
   *
   * Call this when:
   * - Tenant status is updated (draft -> active -> suspended)
   * - Tenant settings are modified
   * - Organization slug is changed
   * - Tenant or organization is deleted
   *
   * @param organizationId - Organization ID to invalidate (this is what x-tenant-id contains)
   *
   * @example
   * ```typescript
   * await this.tenantResolution.invalidateTenantCache(123);
   * ```
   */
  async invalidateTenantCache(
    organizationId: number,
    options?: {
      previousSlug?: string | null;
    }
  ): Promise<void> {
    if (!this.cacheEnabled) {
      return;
    }

    try {
      // Invalidate by organization ID (matches the cache key in findById)
      await this.cache.delete(`${this.cacheConfig.prefixes.tenantOrg}${organizationId}`);

      const previousSlug = options?.previousSlug?.trim();
      if (previousSlug) {
        await this.cache.delete(`${this.cacheConfig.prefixes.tenantSlug}${previousSlug}`);
      }

      // Also invalidate slug cache - need to find it first
      const [org] = await this.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (org) {
        await this.cache.delete(`${this.cacheConfig.prefixes.tenantSlug}${org.slug}`);
      }

      this.logger.debug(`Invalidated cache for organization ${organizationId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache for organization ${organizationId}:`, error);
    }
  }
}
