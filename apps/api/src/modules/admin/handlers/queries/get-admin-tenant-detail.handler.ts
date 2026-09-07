import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  organizations,
  sql,
  tenants,
  userIdentities,
  userTenants,
  users,
  invitations,
  type ITenantSettings,
  type NodePgDatabase
} from '@package/db-core';

import { AdminTenantDetailDto } from '../../dto/admin-tenant-detail.dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminTenantDetailQuery } from '../../queries/get-admin-tenant-detail.query';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminTenantDetailQuery)
export class GetAdminTenantDetailHandler implements IQueryHandler<
  GetAdminTenantDetailQuery,
  AdminTenantDetailDto
> {
  private readonly logger = new Logger(GetAdminTenantDetailHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(query: GetAdminTenantDetailQuery): Promise<AdminTenantDetailDto> {
    this.logger.debug(`Fetching admin tenant detail for organization=${query.organizationId}`);

    const [detailResult, ownersResult, providerUsageResult] = await Promise.all([
      this.db.execute(sql`
        select
          ${organizations.id} as organization_id,
          ${organizations.publicId} as public_id,
          ${organizations.tenantId} as tenant_id,
          ${tenants.publicId} as tenant_public_id,
          ${organizations.name} as name,
          ${organizations.displayName} as display_name,
          ${organizations.slug} as slug,
          ${organizations.isActive} as organization_active,
          ${organizations.deletedAt} as organization_deleted_at,
          ${organizations.ownerId} as owner_user_id,
          ${organizations.gcpTenantId} as gcp_tenant_id,
          ${organizations.createdAt} as organization_created_at,
          ${organizations.updatedAt} as organization_updated_at,
          ${tenants.type} as tenant_type,
          ${tenants.status} as tenant_status,
          ${tenants.settings} as tenant_settings,
          owner_user.display_name as owner_display_name,
          coalesce(member_counts.member_count, 0) as member_count,
          coalesce(member_counts.active_member_count, 0) as active_member_count,
          coalesce(member_counts.inactive_member_count, 0) as inactive_member_count,
          coalesce(member_counts.owner_count, 0) as membership_owner_count,
          coalesce(member_counts.admin_count, 0) as admin_count,
          coalesce(member_counts.elevated_access_count, 0) as elevated_access_count,
          coalesce(invitation_counts.pending_invitation_count, 0) as pending_invitation_count,
          coalesce(invitation_counts.accepted_invitation_count, 0) as accepted_invitation_count,
          coalesce(invitation_counts.expired_invitation_count, 0) as expired_invitation_count,
          coalesce(invitation_counts.cancelled_invitation_count, 0) as cancelled_invitation_count,
          case
            when ${tenants.status} = 'deleted' then 'archived'
            when ${tenants.status} = 'suspended'
              or ${organizations.isActive} = false
              or owner_user.is_active = false then 'attention'
            when ${organizations.ownerId} is null or ${tenants.status} = 'draft' then 'setup'
            when ${organizations.gcpTenantId} is null then 'provisioning'
            when coalesce(invitation_counts.pending_invitation_count, 0) > 0 then 'invited'
            else 'ready'
          end as onboarding_state
        from ${organizations}
        inner join ${tenants}
          on ${tenants.id} = ${organizations.tenantId}
        left join ${sql`${users} as owner_user`}
          on owner_user.id = ${organizations.ownerId}
        left join (
          select
            ${userTenants.tenantId} as tenant_id,
            count(*) filter (where ${users.deletedAt} is null)::int as member_count,
            count(*) filter (
              where ${users.deletedAt} is null
                and ${userTenants.isActive} = true
                and ${users.isActive} = true
            )::int as active_member_count,
            count(*) filter (
              where ${users.deletedAt} is null
                and (${userTenants.isActive} = false or ${users.isActive} = false)
            )::int as inactive_member_count,
            count(*) filter (
              where ${users.deletedAt} is null
                and ${userTenants.isActive} = true
                and ${userTenants.role} = 'tenant_owner'
            )::int as owner_count,
            count(*) filter (
              where ${users.deletedAt} is null
                and ${userTenants.isActive} = true
                and ${userTenants.role} in ('tenant_owner', 'tenant_admin')
            )::int as admin_count,
            count(*) filter (
              where ${users.deletedAt} is null
                and ${userTenants.isActive} = true
                and ${userTenants.role} in ('tenant_owner', 'tenant_admin')
            )::int as elevated_access_count
          from ${userTenants}
          inner join ${users}
            on ${users.id} = ${userTenants.userId}
          group by ${userTenants.tenantId}
        ) as member_counts
          on member_counts.tenant_id = ${organizations.tenantId}
        left join (
          select
            ${invitations.organizationId} as organization_id,
            count(*) filter (where ${invitations.status} = 'pending')::int as pending_invitation_count,
            count(*) filter (where ${invitations.status} = 'accepted')::int as accepted_invitation_count,
            count(*) filter (where ${invitations.status} = 'expired')::int as expired_invitation_count,
            count(*) filter (where ${invitations.status} = 'cancelled')::int as cancelled_invitation_count
          from ${invitations}
          group by ${invitations.organizationId}
        ) as invitation_counts
          on invitation_counts.organization_id = ${organizations.id}
        where ${organizations.id} = ${query.organizationId}
        limit 1
      `),
      this.db.execute(sql`
        select
          ${users.id} as user_id,
          ${users.displayName} as display_name,
          ${users.isActive} as user_active,
          ${users.deletedAt} as user_deleted_at,
          ${userTenants.role} as membership_role,
          ${userTenants.isDefault} as membership_is_default,
          ${userTenants.createdAt} as membership_created_at,
          ${userTenants.updatedAt} as membership_updated_at,
          ${userIdentities.provider} as identity_provider,
          ${userIdentities.emailVerified} as identity_email_verified
        from ${userTenants}
        inner join ${users}
          on ${users.id} = ${userTenants.userId}
        left join ${userIdentities}
          on ${userIdentities.userId} = ${users.id}
          and ${userIdentities.isPrimary} = true
        where ${userTenants.tenantId} = (
          select ${organizations.tenantId}
          from ${organizations}
          where ${organizations.id} = ${query.organizationId}
        )
          and ${userTenants.role} = 'tenant_owner'
        order by ${userTenants.createdAt} asc
      `),
      this.db.execute(sql`
        select
          ${userIdentities.provider} as provider,
          count(*)::int as provider_count
        from ${userTenants}
        inner join ${users}
          on ${users.id} = ${userTenants.userId}
          and ${users.deletedAt} is null
        inner join ${userIdentities}
          on ${userIdentities.userId} = ${users.id}
          and ${userIdentities.isPrimary} = true
        where ${userTenants.tenantId} = (
          select ${organizations.tenantId}
          from ${organizations}
          where ${organizations.id} = ${query.organizationId}
        )
          and ${userTenants.isActive} = true
        group by ${userIdentities.provider}
        order by count(*) desc, ${userIdentities.provider} asc
      `)
    ]);

    const row = detailResult.rows[0] as DetailRow | undefined;
    if (!row) {
      throw new NotFoundException(`Organization ${query.organizationId} was not found`);
    }

    const settings = this.toTenantSettings(row.tenant_settings);
    const detail: AdminTenantDetailDto = {
      generatedAt: new Date().toISOString(),
      organizationId: this.toInt(row.organization_id),
      tenantId: this.toInt(row.tenant_id),
      publicId: this.toString(row.public_id),
      tenantPublicId: this.toString(row.tenant_public_id),
      name: this.toString(row.name),
      displayName: this.toOptionalString(row.display_name),
      slug: this.toString(row.slug),
      tenantType: this.toTenantType(row.tenant_type),
      status: this.toTenantStatus(row.tenant_status),
      onboardingState: this.toOnboardingState(row.onboarding_state),
      organizationActive: this.toBoolean(row.organization_active),
      isDeleted: row.organization_deleted_at !== null && row.organization_deleted_at !== undefined,
      deletedAt: this.toOptionalIsoString(row.organization_deleted_at),
      ownerUserId:
        row.owner_user_id === null || row.owner_user_id === undefined
          ? undefined
          : this.toInt(row.owner_user_id),
      ownerDisplayName: this.toOptionalString(row.owner_display_name),
      hasOwner: row.owner_user_id !== null && row.owner_user_id !== undefined,
      createdAt: this.toIsoString(row.organization_created_at),
      updatedAt: this.toIsoString(row.organization_updated_at),
      diagnostics: this.buildDiagnostics(settings),
      membership: {
        totalMembers: this.toInt(row.member_count),
        activeMembers: this.toInt(row.active_member_count),
        inactiveMembers: this.toInt(row.inactive_member_count),
        ownerCount: this.toInt(row.membership_owner_count),
        adminCount: this.toInt(row.admin_count),
        elevatedAccessCount: this.toInt(row.elevated_access_count)
      },
      invitationStatusCounts: [
        { status: 'pending', count: this.toInt(row.pending_invitation_count) },
        { status: 'accepted', count: this.toInt(row.accepted_invitation_count) },
        { status: 'expired', count: this.toInt(row.expired_invitation_count) },
        { status: 'cancelled', count: this.toInt(row.cancelled_invitation_count) }
      ],
      owners: ownersResult.rows.map((owner) => this.mapOwner(owner as unknown as OwnerRow, row)),
      auth: {
        authProvider: row.gcp_tenant_id ? 'Google Identity Platform' : undefined,
        hasProvisionedAuthTenant: Boolean(row.gcp_tenant_id),
        gcpTenantId: this.toOptionalString(row.gcp_tenant_id),
        ssoEnabled: Boolean(settings.features?.sso),
        apiAccessEnabled: Boolean(settings.features?.apiAccess),
        providersInUse: providerUsageResult.rows.map((provider) => {
          const usage = provider as unknown as ProviderUsageRow;

          return {
            provider: this.toString(usage.provider),
            count: this.toInt(usage.provider_count)
          };
        })
      },
      settings: {
        ...(settings.features ? { features: settings.features } : {}),
        ...(settings.branding ? { branding: settings.branding } : {}),
        ...(settings.limits ? { limits: settings.limits } : {}),
        ...(settings.metadata ? { metadata: settings.metadata } : {})
      }
    };

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.tenant.detail.viewed.audit',
        tenantId: detail.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: String(query.organizationId),
        action: 'VIEW_ADMIN_TENANT_DETAIL',
        target: {
          entityType: 'organization',
          entityId: String(query.organizationId)
        },
        details: {
          organizationId: query.organizationId,
          tenantId: detail.tenantId,
          ownerCount: detail.owners.length,
          memberCount: detail.membership.totalMembers,
          pendingInvitationCount:
            detail.invitationStatusCounts.find((item) => item.status === 'pending')?.count ?? 0
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return detail;
  }

  private mapOwner(
    row: OwnerRow,
    detailRow: DetailRow
  ): AdminTenantDetailDto['owners'][number] {
    const ownerUserId =
      detailRow.owner_user_id === null ? undefined : this.toInt(detailRow.owner_user_id);

    return {
      userId: this.toInt(row.user_id),
      displayName: this.toOptionalString(row.display_name),
      membershipRole: this.toString(row.membership_role),
      isActive: this.toBoolean(row.user_active),
      isDeleted: row.user_deleted_at !== null && row.user_deleted_at !== undefined,
      isDefault: this.toBoolean(row.membership_is_default),
      isDesignatedOwner: ownerUserId === this.toInt(row.user_id),
      primaryIdentityProvider: this.toOptionalString(row.identity_provider),
      emailVerified:
        row.identity_email_verified === null || row.identity_email_verified === undefined
          ? undefined
          : this.toBoolean(row.identity_email_verified),
      createdAt: this.toIsoString(row.membership_created_at),
      updatedAt: this.toIsoString(row.membership_updated_at)
    };
  }

  private buildDiagnostics(settings: ITenantSettings): AdminTenantDetailDto['diagnostics'] {
    return {
      ssoEnabled: Boolean(settings.features?.sso),
      apiAccessEnabled: Boolean(settings.features?.apiAccess),
      hasCustomDomain: Boolean(settings.branding?.customDomain),
      hasCustomEmail: Boolean(settings.branding?.customEmail),
      maxUsers: this.toOptionalNumber(settings.features?.maxUsers),
      apiRateLimit: this.toOptionalNumber(settings.limits?.apiRateLimit)
    };
  }

  private toTenantSettings(settings: unknown): ITenantSettings {
    return this.isObject(settings) ? (settings as ITenantSettings) : {};
  }

  private toInt(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  private toBoolean(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
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

  private toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
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

  private toTenantStatus(value: unknown): AdminTenantDetailDto['status'] {
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

  private toTenantType(value: unknown): AdminTenantDetailDto['tenantType'] {
    switch (value) {
      case 'organization':
      case 'team':
      case 'individual':
        return value;
      default:
        return 'organization';
    }
  }

  private toOnboardingState(value: unknown): AdminTenantDetailDto['onboardingState'] {
    switch (value) {
      case 'setup':
      case 'provisioning':
      case 'invited':
      case 'ready':
      case 'attention':
      case 'archived':
        return value;
      default:
        return 'attention';
    }
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

interface DetailRow {
  organization_id: unknown;
  public_id: unknown;
  tenant_id: unknown;
  tenant_public_id: unknown;
  name: unknown;
  display_name: unknown;
  slug: unknown;
  organization_active: unknown;
  organization_deleted_at: unknown;
  owner_user_id: unknown;
  gcp_tenant_id: unknown;
  organization_created_at: unknown;
  organization_updated_at: unknown;
  tenant_type: unknown;
  tenant_status: unknown;
  tenant_settings: unknown;
  owner_display_name: unknown;
  member_count: unknown;
  active_member_count: unknown;
  inactive_member_count: unknown;
  membership_owner_count: unknown;
  admin_count: unknown;
  elevated_access_count: unknown;
  pending_invitation_count: unknown;
  accepted_invitation_count: unknown;
  expired_invitation_count: unknown;
  cancelled_invitation_count: unknown;
  onboarding_state: unknown;
}

interface OwnerRow {
  user_id: unknown;
  display_name: unknown;
  user_active: unknown;
  user_deleted_at: unknown;
  membership_role: unknown;
  membership_is_default: unknown;
  membership_created_at: unknown;
  membership_updated_at: unknown;
  identity_provider: unknown;
  identity_email_verified: unknown;
}

interface ProviderUsageRow {
  provider: unknown;
  provider_count: unknown;
}
