import { ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CachedPermissionService } from '@package/auth';
import { SYSTEM_PERMISSIONS, TENANT_PERMISSIONS } from '@package/constants';
import { and, organizations, eq, isNull, type NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

import type { OrganizationWithGcpTenant } from '../tenants.types';

/**
 * No-op permission service for unit tests
 * Always returns true (grants all permissions)
 */
class NoOpPermissionService {
  hasPermission(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/**
 * User context interface for authorization checks
 *
 * Provided by controllers/handlers to repositories for authorization.
 */
export interface RepositoryUserContext {
  /** User ID from JWT */
  userId: number;
  /** Tenant ID (organization ID) from x-tenant-id header */
  tenantId: number;
  /** User roles from JWT */
  roles?: string[];
}

/**
 * GCP Tenant Repository
 *
 * Manages GCP tenant ID storage and retrieval for organizations.
 * Extends BaseRepository for consistent data access patterns.
 *
 * Authorization rules:
 * - Organization members can read their own organization's GCP tenant ID
 * - System permissions (system:tenants:*) allow cross-tenant access
 * - Tenant permissions (tenant:settings:*) allow modifying organization settings
 * - Throws ForbiddenException for unauthorized access
 */
@Injectable()
export class GcpTenantRepository extends BaseRepository<
  typeof organizations.$inferSelect,
  typeof organizations.$inferInsert,
  Record<string, never>,
  string
> {
  private readonly logger = new Logger(GcpTenantRepository.name);

  constructor(
    @Inject(MAIN_DB) protected override readonly db: NodePgDatabase,
    @Optional()
    private readonly permissionService:
      | CachedPermissionService
      | NoOpPermissionService = new NoOpPermissionService()
  ) {
    super(db);
  }

  /**
   * Get the organizations table
   */
  protected getTable(): typeof organizations {
    return organizations;
  }

  /**
   * Get the ID column for queries
   */
  protected getIdColumn(): typeof organizations.id {
    return organizations.id;
  }

  /**
   * Get the tenant column for scoping
   */
  protected getTenantColumn(): typeof organizations.tenantId {
    return organizations.tenantId;
  }

  /**
   * Get the entity name for error messages
   */
  protected getEntityName(): string {
    return 'Organization';
  }

  protected override usesOrganizationIdForTenant(): boolean {
    return false;
  }

  /**
   * Authorization helper: Check if user can access organization
   *
   * Rules:
   * - Users can always access their own organization
   * - System permissions (system:tenants:read) allow cross-tenant access
   * - Tenant permissions (tenant:settings:update) allow same-tenant access
   *
   * @param userContext - Requesting user context
   * @param targetOrganizationId - Target organization ID to access
   * @param requiredPermission - Permission to check (defaults to read)
   * @throws ForbiddenException if unauthorized
   */
  private async authorizeAccess(
    userContext: RepositoryUserContext | undefined,
    targetOrganizationId: number,
    requiredPermission: string = TENANT_PERMISSIONS.SETTINGS_UPDATE
  ): Promise<void> {
    // If no user context, allow public access (for system operations)
    if (!userContext) {
      return;
    }

    const { userId, tenantId } = userContext;

    // Rule 1: Users can always access their own organization
    if (tenantId === targetOrganizationId) {
      // Still need to check if they have the required permission
      const hasTenantPermission = await this.permissionService.hasPermission(
        userId,
        tenantId,
        requiredPermission
      );

      if (hasTenantPermission) {
        return;
      }
    }

    // Rule 2: System permissions - allow cross-tenant access
    const systemReadPermission = SYSTEM_PERMISSIONS.TENANTS_READ;
    const hasSystemPermission = await this.permissionService.hasPermission(
      userId,
      undefined,
      systemReadPermission
    );

    if (hasSystemPermission) {
      return;
    }

    // Access denied - throw ForbiddenException
    throw new ForbiddenException(
      `You do not have permission to access organization ${targetOrganizationId}. ` +
        `Required permission: ${requiredPermission} or ${systemReadPermission}`
    );
  }

  /**
   * Authorization helper: Check if user can perform write operation
   *
   * @param userContext - Requesting user context
   * @param targetOrganizationId - Target organization ID
   * @param operation - Operation type (update)
   * @throws ForbiddenException if unauthorized
   */
  private async authorizeWrite(
    userContext: RepositoryUserContext | undefined,
    targetOrganizationId: number,
    operation: 'update'
  ): Promise<void> {
    const tenantPermissionMap = {
      update: TENANT_PERMISSIONS.SETTINGS_UPDATE
    };

    await this.authorizeAccess(userContext, targetOrganizationId, tenantPermissionMap[operation]);
  }

  /**
   * Find organization by ID with GCP tenant info
   *
   * @param _tenantId - Tenant ID (for scoping)
   * @param organizationId - Organization ID
   * @param userContext - User context for authorization (optional for system operations)
   * @returns Organization with GCP tenant or null
   */
  async findByIdWithGcpTenant(
    _tenantId: string,
    organizationId: number,
    userContext?: RepositoryUserContext
  ): Promise<OrganizationWithGcpTenant | null> {
    // Authorization check
    await this.authorizeAccess(userContext, organizationId);

    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return org ?? null;
  }

  /**
   * Update GCP tenant ID for an organization
   *
   * @param organizationId - Organization ID
   * @param gcpTenantId - GCP tenant ID (UUID from Firebase)
   * @param userContext - User context for authorization (optional for system operations)
   * @returns Updated organization
   */
  async updateGcpTenantId(
    organizationId: number,
    gcpTenantId: string,
    userContext?: RepositoryUserContext
  ): Promise<typeof organizations.$inferSelect | null> {
    this.logger.log(`Updating GCP tenant ID for organization ${organizationId}: ${gcpTenantId}`);

    // Authorization check before update
    await this.authorizeWrite(userContext, organizationId, 'update');

    const [org] = await this.db
      .update(organizations)
      .set({ gcpTenantId, updatedAt: new Date() })
      .where(and(eq(organizations.id, organizationId), isNull(organizations.gcpTenantId)))
      .returning();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return org ?? null;
  }

  /**
   * Find organization by GCP tenant ID
   *
   * NOTE: This is intentionally public as it's used for Firebase authentication
   * token lookup during the authentication flow. The gcpTenantId is a UUID
   * from Firebase, not user input, so it's safe to query without authorization.
   *
   * @param gcpTenantId - GCP tenant ID (UUID from Firebase)
   * @returns Organization or null
   */
  async findByGcpTenantId(gcpTenantId: string): Promise<OrganizationWithGcpTenant | null> {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.gcpTenantId, gcpTenantId))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return org ?? null;
  }
}
