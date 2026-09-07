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

import { AdminUserDetailDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminUserDetailQuery } from '../../queries';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminUserDetailQuery)
export class GetAdminUserDetailHandler implements IQueryHandler<
  GetAdminUserDetailQuery,
  AdminUserDetailDto
> {
  private readonly logger = new Logger(GetAdminUserDetailHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: GetAdminUserDetailQuery): Promise<AdminUserDetailDto> {
    this.logger.debug(`Fetching admin user detail for user=${query.userId}`);

    const [detailResult, systemRolesResult, membershipsResult, identitiesResult] =
      await Promise.all([
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
          ${userIdentities.provider} as identity_provider,
          ${userIdentities.displayName} as identity_display_name,
          ${userIdentities.emailVerified} as identity_email_verified,
          ${userIdentities.phoneVerified} as identity_phone_verified
        from ${users}
        left join ${organizations}
          on ${organizations.id} = ${users.organizationId}
        left join ${userIdentities}
          on ${userIdentities.userId} = ${users.id}
          and ${userIdentities.isPrimary} = true
        where ${users.id} = ${query.userId}
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
          ${organizations.id} as organization_id,
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
          (${userTenants.role} in ('tenant_owner', 'tenant_admin')) as is_privileged
        from ${userTenants}
        inner join ${users}
          on ${users.id} = ${userTenants.userId}
        left join ${organizations}
          on ${organizations.tenantId} = ${userTenants.tenantId}
        inner join ${tenants}
          on ${tenants.id} = ${userTenants.tenantId}
        where ${userTenants.userId} = ${query.userId}
        order by ${userTenants.isDefault} desc, ${userTenants.createdAt} asc
      `),
        this.db.execute(sql`
        select
          ${userIdentities.provider} as provider
        from ${userIdentities}
        where ${userIdentities.userId} = ${query.userId}
        group by ${userIdentities.provider}
        order by count(*) desc, ${userIdentities.provider} asc
      `)
      ]);

    const row = detailResult.rows[0] as DetailRow | undefined;
    if (!row) {
      throw new NotFoundException(`User ${query.userId} was not found`);
    }

    const systemRoles = (systemRolesResult.rows as unknown as SystemRoleRow[])
      .map((roleRow) => this.toSystemRole(roleRow.system_role))
      .filter((role): role is NonNullable<typeof role> => role !== undefined);

    const memberships = (membershipsResult.rows as unknown as MembershipRow[]).map((membership) =>
      this.mapMembership(membership)
    );
    const providersInUse = (identitiesResult.rows as unknown as IdentityProviderRow[])
      .map((identity) => this.toOptionalString(identity.provider))
      .filter((provider): provider is string => provider !== undefined);

    const detail: AdminUserDetailDto = {
      generatedAt: new Date().toISOString(),
      userId: this.toInt(row.user_id),
      organizationId: this.toOptionalInt(row.organization_id),
      organizationName: this.toOptionalString(row.organization_name),
      organizationDisplayName: this.toOptionalString(row.organization_display_name),
      organizationSlug: this.toOptionalString(row.organization_slug),
      organizationActive: this.toOptionalBoolean(row.organization_is_active),
      organizationDeletedAt: this.toOptionalIsoString(row.organization_deleted_at),
      displayName: this.toOptionalString(row.user_display_name),
      photoUrl: this.toOptionalString(row.user_photo_url),
      userLifecycle: row.user_deleted_at ? 'deleted' : 'active',
      userActive: this.toBoolean(row.user_is_active),
      userVerified: this.toBoolean(row.user_is_verified),
      userDeletedAt: this.toOptionalIsoString(row.user_deleted_at),
      systemRoles,
      isPrivileged:
        systemRoles.length > 0 || memberships.some((membership) => membership.isPrivileged),
      userCreatedAt: this.toIsoString(row.user_created_at),
      userUpdatedAt: this.toIsoString(row.user_updated_at),
      lastSignInAt: this.toOptionalIsoString(row.user_last_sign_in_at),
      identity: {
        provider: this.toOptionalString(row.identity_provider),
        providerDisplayName: this.toOptionalString(row.identity_display_name),
        emailVerified: this.toBoolean(row.identity_email_verified),
        phoneVerified: this.toBoolean(row.identity_phone_verified),
        hasPrimaryIdentity:
          row.identity_provider !== null ||
          row.identity_display_name !== null ||
          row.identity_email_verified !== null ||
          row.identity_phone_verified !== null,
        providersInUse,
        totalIdentities: providersInUse.length
      },
      membershipStats: {
        totalMemberships: memberships.length,
        activeMemberships: memberships.filter((membership) => membership.status === 'active')
          .length,
        suspendedMemberships: memberships.filter((membership) => membership.status === 'suspended')
          .length,
        privilegedMemberships: memberships.filter((membership) => membership.isPrivileged).length
      },
      memberships
    };

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.user.detail.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: String(query.userId),
        action: 'VIEW_ADMIN_USER_DETAIL',
        target: {
          entityType: 'user',
          entityId: String(query.userId)
        },
        details: {
          userId: query.userId,
          systemRoleCount: detail.systemRoles.length,
          totalMemberships: detail.membershipStats.totalMemberships,
          hasPrimaryIdentity: detail.identity.hasPrimaryIdentity
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return detail;
  }

  private mapMembership(row: MembershipRow): AdminUserDetailDto['memberships'][number] {
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
      createdAt: this.toIsoString(row.membership_created_at),
      updatedAt: this.toIsoString(row.membership_updated_at)
    };
  }

  private toInt(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  private toOptionalInt(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    return this.toInt(value);
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private toOptionalBoolean(value: unknown): boolean | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    return this.toBoolean(value);
  }

  private toString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (value instanceof Date) {
      return value.toISOString();
    }

    return '';
  }

  private toOptionalString(value: unknown): string | undefined {
    const normalized = this.toString(value).trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private toIsoString(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date(this.toString(value)).toISOString();
  }

  private toOptionalIsoString(value: unknown): string | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    return this.toIsoString(value);
  }

  private toTenantType(value: unknown): 'organization' | 'team' | 'individual' {
    const normalized = this.toOptionalString(value);
    if (normalized === 'team' || normalized === 'individual') {
      return normalized;
    }
    return 'organization';
  }

  private toTenantStatus(value: unknown): 'draft' | 'trial' | 'active' | 'suspended' | 'deleted' {
    const normalized = this.toOptionalString(value);
    if (
      normalized === 'draft' ||
      normalized === 'trial' ||
      normalized === 'active' ||
      normalized === 'suspended' ||
      normalized === 'deleted'
    ) {
      return normalized;
    }
    return 'active';
  }

  private toTenantRole(
    value: unknown
  ): 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer' {
    const normalized = this.toOptionalString(value);
    if (
      normalized === 'tenant_owner' ||
      normalized === 'tenant_admin' ||
      normalized === 'tenant_user' ||
      normalized === 'tenant_viewer'
    ) {
      return normalized;
    }
    return 'tenant_user';
  }

  private toMembershipStatus(value: unknown): 'active' | 'inactive' | 'suspended' | 'pending' {
    const normalized = this.toOptionalString(value);
    if (normalized === 'inactive' || normalized === 'suspended' || normalized === 'pending') {
      return normalized;
    }
    return 'active';
  }

  private toSystemRole(value: unknown): 'system_owner' | 'system_admin' | undefined {
    const normalized = this.toOptionalString(value);
    if (normalized === 'system_owner' || normalized === 'system_admin') {
      return normalized;
    }
    return undefined;
  }
}

type DetailRow = {
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
  identity_provider: unknown;
  identity_display_name: unknown;
  identity_email_verified: unknown;
  identity_phone_verified: unknown;
};

type MembershipRow = {
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
};

type SystemRoleRow = {
  system_role: unknown;
};

type IdentityProviderRow = {
  provider: unknown;
};
