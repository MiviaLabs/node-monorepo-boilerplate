import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { getPermissionsForRole, SystemRole, TenantRole } from '@package/constants';

import { UserRolesResponseDto } from '../../dto/user-roles-response.dto';
import { buildAuthAuditEvent } from '../../events';
import { GetUserRolesQuery } from '../../queries/get-user-roles.query';
import { RoleRepository } from '../../repositories';

import type { NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Get user roles query handler
 *
 * Retrieves all roles (system and tenant) for a user and resolves their permissions.
 * System roles provide global permissions across all tenants.
 * Tenant roles provide permissions scoped to a specific tenant.
 *
 * Uses RoleRepository for proper DI and testcontainers compatibility.
 */
@QueryHandler(GetUserRolesQuery)
@Injectable()
export class GetUserRolesHandler implements IQueryHandler<GetUserRolesQuery> {
  private readonly logger = new Logger(GetUserRolesHandler.name);

  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: GetUserRolesQuery): Promise<UserRolesResponseDto> {
    this.logger.debug(`Getting roles for user ${query.userId} in tenant ${query.tenantId}`);

    // Step 1: Fetch system roles via repository
    const systemRoles = await this.roleRepository.getSystemRolesForUser(query.userId);

    // Step 2: Fetch tenant role via repository
    const tenantRole = await this.roleRepository.getTenantRoleForUser(query.tenantId, query.userId);

    // Step 3: Combine all roles into one array
    const allRoles: string[] = [...systemRoles];
    if (tenantRole) {
      allRoles.push(tenantRole);
    }

    // Step 4: Resolve permissions for each role and deduplicate
    const allPermissions: string[] = [];
    for (const role of allRoles) {
      const permissions = getPermissionsForRole(role as SystemRole | TenantRole);
      allPermissions.push(...permissions);
    }

    // Deduplicate permissions using Set
    const deduplicatedPermissions = [...new Set(allPermissions)];

    this.logger.debug(
      `User ${query.userId} has ${allRoles.length} roles and ${deduplicatedPermissions.length} unique permissions`
    );

    // Step 5: Return response DTO
    const response = UserRolesResponseDto.create(allRoles, deduplicatedPermissions);

    await this.auditOutbox.insert(
      this.db,
      buildAuthAuditEvent({
        eventType: 'auth.roles.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: query.userId,
        action: 'VIEW_USER_ROLES',
        target: {
          entityType: 'user',
          entityId: String(query.userId)
        },
        details: {
          roleCount: allRoles.length,
          permissionCount: deduplicatedPermissions.length
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return response;
  }
}
