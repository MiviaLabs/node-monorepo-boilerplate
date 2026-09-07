import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { CachedPermissionService } from '@package/auth';
import { SYSTEM_PERMISSIONS, TENANT_PERMISSIONS } from '@package/constants';
import { organizations, eq, and, lt, isNotNull, type NodePgDatabase } from '@package/db-core';
import { Errors } from '@package/errors';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

/**
 * No-op permission service for unit tests
 * Always returns true (grants all permissions)
 */
class NoOpPermissionService {
  hasPermission(): boolean {
    return true;
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
 * Organization repository
 *
 * Handles organization-related data access with tenant scoping and authorization
 * Extends BaseRepository for consistent patterns
 *
 * Authorization rules:
 * - Organization owners/managers can access their own organization
 * - System permissions (system:tenants:*) allow cross-tenant access
 * - Tenant permissions (tenant:settings:*) allow same-tenant access
 * - Throws ForbiddenException for unauthorized access
 */
@Injectable()
export class OrganizationRepository extends BaseRepository<
  typeof organizations.$inferSelect,
  typeof organizations.$inferInsert,
  Record<string, never>,
  string
> {
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
   *
   * IMPORTANT: For OrganizationRepository, we return organizations.id (not organizations.tenantId)
   * because the organization itself IS the tenant unit. The x-tenant-id header contains the
   * organization ID, not the parent tenants table ID.
   *
   * - organizations.id = what x-tenant-id header contains (the tenant identifier)
   * - organizations.tenantId = foreign key to parent tenants table (not used for scoping)
   */
  protected getTenantColumn(): typeof organizations.id {
    return organizations.id;
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
   * Find organization by ID with public registration settings
   *
   * @param tenantId - Tenant ID (organization ID as string)
   * @returns Organization or null
   */
  override async findById(tenantId: string): Promise<typeof organizations.$inferSelect | null> {
    // Validate tenantId is a valid number string to prevent SQL injection
    const orgIdStr = tenantId.trim();
    if (!/^\d+$/.test(orgIdStr)) {
      return null;
    }
    const orgId = Number(orgIdStr);

    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return org ?? null;
  }

  /**
   * Find organization by ID within transaction
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID as string)
   * @returns Organization or null
   */
  async findByIdWithTransaction(
    tenantId: string,
    tx: NodePgDatabase
  ): Promise<typeof organizations.$inferSelect | null> {
    // Validate tenantId is a valid number string to prevent SQL injection
    const orgIdStr = tenantId.trim();
    if (!/^\d+$/.test(orgIdStr)) {
      return null;
    }
    const orgId = Number(orgIdStr);

    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return org ?? null;
  }

  /**
   * Check if organization allows public registration
   *
   * @param tenantId - Tenant ID (organization ID as string)
   * @returns true if public registration is allowed
   */
  async allowsPublicRegistration(tenantId: string): Promise<boolean> {
    const org = await this.findById(tenantId);
    // For now, all active organizations allow public registration
    // In the future, add a publicRegistrationEnabled column to organizations table
    return org?.isActive ?? false;
  }

  /**
   * Delete organization within transaction (hard delete)
   *
   * Deletes organization and all related entities via CASCADE.
   * This will automatically delete all users in the organization due to foreign key CASCADE.
   *
   * @param tx - Database transaction
   * @param orgId - Organization ID (as number)
   * @returns Deleted organization
   */
  async deleteWithTransaction(
    tx: NodePgDatabase,
    orgId: number
  ): Promise<typeof organizations.$inferSelect | undefined> {
    const [deletedOrg] = await tx
      .delete(organizations)
      .where(eq(organizations.id, orgId))
      .returning();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return deletedOrg;
  }

  /**
   * Soft delete organization (mark as deleted, don't remove data - GDPR compliance)
   *
   * @param tx - Database transaction
   * @param orgId - Organization ID (as number)
   * @returns Soft deleted organization
   */
  async softDeleteWithTransaction(
    tx: NodePgDatabase,
    orgId: number
  ): Promise<typeof organizations.$inferSelect> {
    const [deletedOrg] = await tx
      .update(organizations)
      .set({
        deletedAt: new Date(),
        isActive: false // Also mark as inactive
      })
      .where(eq(organizations.id, orgId))
      .returning();

    if (!deletedOrg) {
      throw Errors.databaserecordNotFound004({ entity: 'Organization' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return deletedOrg;
  }

  /**
   * Find organizations soft-deleted before retention cutoff date
   * @param retentionDays - Number of days to retain soft-deleted records
   * @returns Array of expired soft-deleted organizations
   */
  async findExpiredSoftDeleted(
    retentionDays: number
  ): Promise<(typeof organizations.$inferSelect)[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const expiredOrgs = await this.db
      .select()
      .from(organizations)
      .where(and(isNotNull(organizations.deletedAt), lt(organizations.deletedAt, cutoffDate)));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return expiredOrgs;
  }

  /**
   * Permanently delete organization (hard delete)
   * CASCADE will automatically delete all users in the organization
   * @param orgId - Organization ID to permanently delete
   */
  async hardDeletePermanently(orgId: number): Promise<void> {
    await this.db.delete(organizations).where(eq(organizations.id, orgId));
  }

  /**
   * Transfer organization ownership to a new owner
   *
   * @param tenantId - Tenant ID (organization ID as string)
   * @param newOwnerId - User ID of the new owner (as number)
   * @param tx - Optional database transaction
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns Updated organization
   */
  async transferOwnership(
    tenantId: string,
    newOwnerId: number,
    tx?: NodePgDatabase,
    userContext?: RepositoryUserContext
  ): Promise<typeof organizations.$inferSelect> {
    // Validate tenantId to prevent SQL injection
    const orgIdStr = tenantId.trim();
    if (!/^\d+$/.test(orgIdStr)) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'numeric string'
      });
    }
    const orgId = Number(orgIdStr);

    // Authorization check: user must have permission to transfer ownership
    if (userContext) {
      const hasSystemPermission = await this.permissionService.hasPermission(
        userContext.userId,
        undefined,
        SYSTEM_PERMISSIONS.TENANTS_UPDATE
      );

      const hasTenantPermission = await this.permissionService.hasPermission(
        userContext.userId,
        orgId,
        TENANT_PERMISSIONS.SETTINGS_UPDATE
      );

      if (!hasSystemPermission && !hasTenantPermission) {
        throw new ForbiddenException(
          `You do not have permission to transfer ownership of organization ${orgId}. ` +
            `Required permission: ${TENANT_PERMISSIONS.SETTINGS_UPDATE} or ${SYSTEM_PERMISSIONS.TENANTS_UPDATE}`
        );
      }
    }

    const db = tx ?? this.db;

    const [updatedOrg] = await db
      .update(organizations)
      .set({
        ownerId: newOwnerId,
        updatedAt: new Date()
      })
      .where(eq(organizations.id, orgId))
      .returning();

    if (!updatedOrg) {
      throw Errors.databaserecordNotFound004({ entity: 'Organization' });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return updatedOrg;
  }
}
