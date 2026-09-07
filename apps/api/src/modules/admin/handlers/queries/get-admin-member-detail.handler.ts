import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  organizations,
  sql,
  tenants,
  userIdentities,
  userRoles,
  userTenants,
  users,
  type NodePgDatabase
} from '@package/db-core';

import { AdminMemberDetailDto } from '../../dto/admin-member-detail.dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminMemberDetailQuery } from '../../queries/get-admin-member-detail.query';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminMemberDetailQuery)
export class GetAdminMemberDetailHandler implements IQueryHandler<
  GetAdminMemberDetailQuery,
  AdminMemberDetailDto
> {
  private readonly logger = new Logger(GetAdminMemberDetailHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: GetAdminMemberDetailQuery): Promise<AdminMemberDetailDto> {
    this.logger.debug(
      `Fetching admin member detail for user=${query.userId} tenant=${query.tenantId}`
    );

    const [detailResult, systemRolesResult, membershipsResult] = await Promise.all([
      this.db.execute(sql`
        select
          ${users.id} as user_id,
          ${users.organizationId} as organization_id,
          ${users.displayName} as user_display_name,
          ${users.photoUrl} as user_photo_url,
          ${users.isActive} as user_is_active,
          ${users.isVerified} as user_is_verified,
          ${users.deletedAt} as user_deleted_at,
          ${users.createdAt} as user_created_at,
          ${users.updatedAt} as user_updated_at,
          ${users.lastSignInAt} as user_last_sign_in_at,
          ${organizations.name} as organization_name,
          ${organizations.displayName} as organization_display_name,
          ${organizations.slug} as organization_slug,
          ${organizations.isActive} as organization_is_active,
          ${organizations.deletedAt} as organization_deleted_at,
          ${userTenants.tenantId} as tenant_id,
          ${tenants.type} as tenant_type,
          ${tenants.status} as tenant_status,
          ${userTenants.role} as membership_role,
          ${userTenants.isDefault} as membership_is_default,
          ${userTenants.createdAt} as membership_created_at,
          ${userTenants.updatedAt} as membership_updated_at,
          ${userIdentities.provider} as identity_provider,
          ${userIdentities.displayName} as identity_display_name,
          ${userIdentities.emailVerified} as identity_email_verified,
          ${userIdentities.phoneVerified} as identity_phone_verified,
          case
            when ${tenants.status} in ('suspended', 'deleted') then 'suspended'
            when ${users.isActive} = false or ${userTenants.isActive} = false then 'inactive'
            else 'active'
          end as membership_status,
          (
            exists(
              select 1
              from ${userRoles}
              where ${userRoles.userId} = ${users.id}
                and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
            ) or ${userTenants.role} in ('tenant_owner', 'tenant_admin')
          ) as is_privileged
        from ${userTenants}
        inner join ${users}
          on ${users.id} = ${userTenants.userId}
        left join ${organizations}
          on ${organizations.id} = ${users.organizationId}
        inner join ${tenants}
          on ${tenants.id} = ${userTenants.tenantId}
        left join ${userIdentities}
          on ${userIdentities.userId} = ${users.id}
          and ${userIdentities.isPrimary} = true
        where ${userTenants.userId} = ${query.userId}
          and ${userTenants.tenantId} = ${query.tenantId}
        limit 1
      `),
      this.db.execute(sql`
        select
          ${userRoles.role} as system_role
        from ${userRoles}
        where ${userRoles.userId} = ${query.userId}
          and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
        order by ${userRoles.role} asc
      `),
      this.db.execute(sql`
        select
          ${users.organizationId} as organization_id,
          ${organizations.name} as organization_name,
          ${organizations.displayName} as organization_display_name,
          ${organizations.slug} as organization_slug,
          ${userTenants.tenantId} as tenant_id,
          ${tenants.type} as tenant_type,
          ${tenants.status} as tenant_status,
          ${userTenants.role} as membership_role,
          ${userTenants.isDefault} as membership_is_default,
          ${userTenants.createdAt} as membership_created_at,
          ${userTenants.updatedAt} as membership_updated_at,
          case
            when ${tenants.status} in ('suspended', 'deleted') then 'suspended'
            when ${users.isActive} = false or ${userTenants.isActive} = false then 'inactive'
            else 'active'
          end as membership_status,
          (
            exists(
              select 1
              from ${userRoles}
              where ${userRoles.userId} = ${users.id}
                and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
            ) or ${userTenants.role} in ('tenant_owner', 'tenant_admin')
          ) as is_privileged
        from ${userTenants}
        inner join ${users}
          on ${users.id} = ${userTenants.userId}
        left join ${organizations}
          on ${organizations.tenantId} = ${userTenants.tenantId}
        inner join ${tenants}
          on ${tenants.id} = ${userTenants.tenantId}
        where ${userTenants.userId} = ${query.userId}
        order by ${userTenants.isDefault} desc, ${userTenants.createdAt} asc
      `)
    ]);

    const row = detailResult.rows[0] as DetailRow | undefined;
    if (!row) {
      throw new NotFoundException(
        `Membership for user ${query.userId} in tenant ${query.tenantId} was not found`
      );
    }

    const systemRoles = (systemRolesResult.rows as unknown as SystemRoleRow[])
      .map((roleRow) => this.toSystemRole(roleRow.system_role))
      .filter((role): role is NonNullable<typeof role> => role !== undefined);

    const allMemberships = (membershipsResult.rows as unknown as MembershipRow[]).map(
      (membership) => this.mapMembership(membership, query.tenantId)
    );

    const detail: AdminMemberDetailDto = {
      generatedAt: new Date().toISOString(),
      userId: this.toInt(row.user_id),
      organizationId: this.toOptionalInt(row.organization_id),
      organizationName: this.toOptionalString(row.organization_name),
      organizationDisplayName: this.toOptionalString(row.organization_display_name),
      organizationSlug: this.toOptionalString(row.organization_slug),
      organizationActive: this.toOptionalBoolean(row.organization_is_active),
      organizationDeletedAt: this.toOptionalIsoString(row.organization_deleted_at),
      tenantId: this.toInt(row.tenant_id),
      tenantType: this.toTenantType(row.tenant_type),
      tenantStatus: this.toTenantStatus(row.tenant_status),
      displayName: this.toOptionalString(row.user_display_name),
      photoUrl: this.toOptionalString(row.user_photo_url),
      membershipRole: this.toTenantRole(row.membership_role),
      status: this.toMembershipStatus(row.membership_status),
      userLifecycle: row.user_deleted_at ? 'deleted' : 'active',
      userActive: this.toBoolean(row.user_is_active),
      userVerified: this.toBoolean(row.user_is_verified),
      userDeletedAt: this.toOptionalIsoString(row.user_deleted_at),
      systemRoles,
      isPrivileged: this.toBoolean(row.is_privileged),
      isDefault: this.toBoolean(row.membership_is_default),
      userCreatedAt: this.toIsoString(row.user_created_at),
      userUpdatedAt: this.toIsoString(row.user_updated_at),
      lastSignInAt: this.toOptionalIsoString(row.user_last_sign_in_at),
      membershipCreatedAt: this.toIsoString(row.membership_created_at),
      membershipUpdatedAt: this.toIsoString(row.membership_updated_at),
      identity: {
        provider: this.toOptionalString(row.identity_provider),
        providerDisplayName: this.toOptionalString(row.identity_display_name),
        emailVerified: this.toBoolean(row.identity_email_verified),
        phoneVerified: this.toBoolean(row.identity_phone_verified),
        hasPrimaryIdentity:
          row.identity_provider !== null ||
          row.identity_display_name !== null ||
          row.identity_email_verified !== null ||
          row.identity_phone_verified !== null
      },
      membershipStats: {
        totalMemberships: allMemberships.length,
        activeMemberships: allMemberships.filter((membership) => membership.status === 'active')
          .length,
        suspendedMemberships: allMemberships.filter(
          (membership) => membership.status === 'suspended'
        ).length,
        privilegedMemberships: allMemberships.filter((membership) => membership.isPrivileged).length
      },
      otherMemberships: allMemberships
    };

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.member.detail.viewed.audit',
        tenantId: detail.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: `${query.userId}:${query.tenantId}`,
        action: 'VIEW_ADMIN_MEMBER_DETAIL',
        target: {
          entityType: 'membership',
          entityId: `${query.userId}:${query.tenantId}`
        },
        details: {
          userId: query.userId,
          tenantId: query.tenantId,
          membershipRole: detail.membershipRole,
          systemRoleCount: detail.systemRoles.length,
          totalMemberships: detail.membershipStats.totalMemberships
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return detail;
  }

  private mapMembership(
    row: MembershipRow,
    currentTenantId: number
  ): AdminMemberDetailDto['otherMemberships'][number] {
    return {
      organizationId: this.toOptionalInt(row.organization_id),
      organizationName: this.toOptionalString(row.organization_name),
      organizationDisplayName: this.toOptionalString(row.organization_display_name),
      organizationSlug: this.toOptionalString(row.organization_slug),
      tenantId: this.toInt(row.tenant_id),
      tenantType: this.toTenantType(row.tenant_type),
      tenantStatus: this.toTenantStatus(row.tenant_status),
      membershipRole: this.toTenantRole(row.membership_role),
      status: this.toMembershipStatus(row.membership_status),
      isPrivileged: this.toBoolean(row.is_privileged),
      isDefault: this.toBoolean(row.membership_is_default),
      isCurrent: this.toInt(row.tenant_id) === currentTenantId,
      createdAt: this.toIsoString(row.membership_created_at),
      updatedAt: this.toIsoString(row.membership_updated_at)
    };
  }

  private toInt(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  private toOptionalInt(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    const parsed = this.toInt(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private toOptionalBoolean(value: unknown): boolean | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    return this.toBoolean(value);
  }

  private toString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return '';
  }

  private toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    return value.length > 0 ? value : undefined;
  }

  private toIsoString(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return this.toString(value);
  }

  private toOptionalIsoString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    return this.toIsoString(value);
  }

  private toTenantRole(value: unknown): AdminMemberDetailDto['membershipRole'] {
    switch (value) {
      case 'tenant_owner':
      case 'tenant_admin':
      case 'tenant_user':
      case 'tenant_viewer':
        return value;
      default:
        return 'tenant_user';
    }
  }

  private toMembershipStatus(value: unknown): AdminMemberDetailDto['status'] {
    switch (value) {
      case 'active':
      case 'inactive':
      case 'suspended':
      case 'pending':
        return value;
      default:
        return 'active';
    }
  }

  private toSystemRole(
    value: unknown
  ): AdminMemberDetailDto['systemRoles'][number] | undefined {
    if (value === 'system_owner' || value === 'system_admin') {
      return value;
    }

    return undefined;
  }

  private toTenantType(value: unknown): AdminMemberDetailDto['tenantType'] {
    switch (value) {
      case 'organization':
      case 'team':
      case 'individual':
        return value;
      default:
        return 'organization';
    }
  }

  private toTenantStatus(value: unknown): AdminMemberDetailDto['tenantStatus'] {
    switch (value) {
      case 'draft':
      case 'trial':
      case 'active':
      case 'suspended':
      case 'deleted':
        return value;
      default:
        return 'draft';
    }
  }
}

interface DetailRow {
  user_id: unknown;
  organization_id: unknown;
  user_display_name: unknown;
  user_photo_url: unknown;
  user_is_active: unknown;
  user_is_verified: unknown;
  user_deleted_at: unknown;
  user_created_at: unknown;
  user_updated_at: unknown;
  user_last_sign_in_at: unknown;
  organization_name: unknown;
  organization_display_name: unknown;
  organization_slug: unknown;
  organization_is_active: unknown;
  organization_deleted_at: unknown;
  tenant_id: unknown;
  tenant_type: unknown;
  tenant_status: unknown;
  membership_role: unknown;
  membership_is_default: unknown;
  membership_created_at: unknown;
  membership_updated_at: unknown;
  identity_provider: unknown;
  identity_display_name: unknown;
  identity_email_verified: unknown;
  identity_phone_verified: unknown;
  membership_status: unknown;
  is_privileged: unknown;
}

interface MembershipRow {
  organization_id: unknown;
  organization_name: unknown;
  organization_display_name: unknown;
  organization_slug: unknown;
  tenant_id: unknown;
  tenant_type: unknown;
  tenant_status: unknown;
  membership_role: unknown;
  membership_is_default: unknown;
  membership_created_at: unknown;
  membership_updated_at: unknown;
  membership_status: unknown;
  is_privileged: unknown;
}

interface SystemRoleRow {
  system_role: unknown;
}
