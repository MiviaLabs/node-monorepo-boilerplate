import { Inject, Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  invitations,
  organizations,
  sql,
  tenants,
  userTenants,
  users,
  type ITenantSettings,
  type NodePgDatabase
} from '@package/db-core';

import { AdminTenantsOverviewDto, type AdminTenantInventoryItemDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminTenantsOverviewQuery } from '../../queries';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminTenantsOverviewQuery)
export class GetAdminTenantsOverviewHandler implements IQueryHandler<
  GetAdminTenantsOverviewQuery,
  AdminTenantsOverviewDto
> {
  private readonly logger = new Logger(GetAdminTenantsOverviewHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminTenantsOverviewQuery = new GetAdminTenantsOverviewQuery({})
  ): Promise<AdminTenantsOverviewDto> {
    this.logger.debug(
      `Fetching admin tenant inventory page=${query.page} pageSize=${query.pageSize}`
    );

    const searchPattern = query.search ? `%${query.search.toLowerCase()}%` : undefined;
    const offset = (query.page - 1) * query.pageSize;
    const filters = this.buildFilters(query, searchPattern);
    const orderBy = this.buildOrderBy(query);
    const inventorySql = this.buildInventorySql(filters);

    const [aggregateResult, pagedResult] = await Promise.all([
      this.db.execute(sql`
        with tenant_inventory as (${inventorySql})
        select
          count(*)::int as total_count,
          count(*) filter (where tenant_status = 'active')::int as active_count,
          count(*) filter (where gcp_tenant_id is null)::int as provisioning_gaps_count,
          count(*) filter (where pending_invitation_count > 0)::int as invite_backlog_count,
          coalesce(sum(member_count), 0)::int as members_tracked_total,
          coalesce(sum(admin_count), 0)::int as tenant_admins_total
        from tenant_inventory
      `),
      this.db.execute(sql`
        with tenant_inventory as (${inventorySql})
        select
          tenant_inventory.*,
          count(*) over()::int as total_count
        from tenant_inventory
        order by ${orderBy}
        limit ${query.pageSize}
        offset ${offset}
      `)
    ]);

    const aggregate = (aggregateResult.rows[0] ?? {}) as unknown as TenantAggregateRow;
    const total = this.toInt(aggregate.total_count);
    const items = pagedResult.rows.map((row) => this.mapRow(row as unknown as TenantInventoryRow));

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.tenants.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin',
        action: 'VIEW_ADMIN_TENANTS',
        target: {
          entityType: 'admin'
        },
        details: {
          page: query.page,
          pageSize: query.pageSize,
          resultCount: items.length,
          totalCount: total,
          searchApplied: Boolean(query.search),
          recordState: query.recordState,
          statusFilterApplied: query.status !== undefined,
          onboardingStateFilterApplied: query.onboardingState !== undefined,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return {
      generatedAt: new Date().toISOString(),
      metrics: [
        {
          key: 'tenants_total',
          label: 'Tenants',
          value: total,
          summary: `${this.toInt(aggregate.active_count)} active`
        },
        {
          key: 'provisioning_gaps_total',
          label: 'Provisioning gaps',
          value: this.toInt(aggregate.provisioning_gaps_count),
          summary:
            this.toInt(aggregate.provisioning_gaps_count) > 0
              ? 'Needs operator follow-up'
              : 'Provisioned'
        },
        {
          key: 'invite_backlog_total',
          label: 'Invite backlog',
          value: this.toInt(aggregate.invite_backlog_count),
          summary:
            this.toInt(aggregate.invite_backlog_count) > 0 ? 'Pending tenant onboarding' : 'Clear'
        },
        {
          key: 'members_tracked_total',
          label: 'Members tracked',
          value: this.toInt(aggregate.members_tracked_total),
          summary: `${this.toInt(aggregate.tenant_admins_total)} tenant admins`
        }
      ],
      items,
      pagination: this.buildPagination(query.page, query.pageSize, total)
    };
  }

  private buildInventorySql(filters: ReturnType<typeof this.buildFilters>): ReturnType<typeof sql> {
    const onboardingStateSql = sql`
      case
        when ${tenants.status} = 'deleted' then 'archived'
        when ${tenants.status} = 'suspended'
          or ${organizations.isActive} = false
          or owner_user.is_active = false then 'attention'
        when ${organizations.ownerId} is null or ${tenants.status} = 'draft' then 'setup'
        when ${organizations.gcpTenantId} is null then 'provisioning'
        when coalesce(invitation_counts.pending_invitation_count, 0) > 0 then 'invited'
        else 'ready'
      end
    `;
    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;

    return sql`
      select
        ${organizations.id} as organization_id,
        ${organizations.publicId} as public_id,
        ${organizations.tenantId} as tenant_id,
        ${organizations.name} as name,
        ${organizations.displayName} as display_name,
        ${organizations.slug} as slug,
        ${organizations.isActive} as organization_active,
        ${organizations.deletedAt} as organization_deleted_at,
        ${organizations.ownerId} as owner_user_id,
        ${organizations.gcpTenantId} as gcp_tenant_id,
        ${organizations.createdAt} as created_at,
        ${organizations.updatedAt} as updated_at,
        ${tenants.type} as tenant_type,
        ${tenants.status} as tenant_status,
        ${tenants.settings} as tenant_settings,
        owner_user.display_name as owner_display_name,
        owner_user.is_active as owner_active,
        coalesce(member_counts.member_count, 0) as member_count,
        coalesce(member_counts.admin_count, 0) as admin_count,
        coalesce(invitation_counts.pending_invitation_count, 0) as pending_invitation_count,
        ${onboardingStateSql} as onboarding_state
      from ${organizations}
      inner join ${tenants}
        on ${tenants.id} = ${organizations.tenantId}
      left join ${sql`${users} as owner_user`}
        on owner_user.id = ${organizations.ownerId}
        and owner_user.deleted_at is null
      left join (
        select
          ${userTenants.tenantId} as tenant_id,
          count(*)::int as member_count,
          count(*) filter (
            where ${userTenants.role} in ('tenant_owner', 'tenant_admin')
          )::int as admin_count
        from ${userTenants}
        inner join ${users}
          on ${users.id} = ${userTenants.userId}
          and ${users.deletedAt} is null
        where ${userTenants.isActive} = true
        group by ${userTenants.tenantId}
      ) as member_counts
        on member_counts.tenant_id = ${organizations.tenantId}
      left join (
        select
          ${invitations.organizationId} as organization_id,
          count(*) filter (
            where ${invitations.status} = 'pending'
          )::int as pending_invitation_count
        from ${invitations}
        group by ${invitations.organizationId}
      ) as invitation_counts
        on invitation_counts.organization_id = ${organizations.id}
      ${whereClause}
    `;
  }

  private buildFilters(
    query: GetAdminTenantsOverviewQuery,
    searchPattern?: string
  ): ReturnType<typeof sql>[] {
    const filters: ReturnType<typeof sql>[] = [];

    if (query.recordState === 'active') {
      filters.push(sql`${organizations.deletedAt} is null`);
    } else if (query.recordState === 'deleted') {
      filters.push(sql`${organizations.deletedAt} is not null`);
    }

    if (searchPattern) {
      filters.push(sql`
        (
          lower(coalesce(${organizations.displayName}, ${organizations.name})) like ${searchPattern}
          or lower(${organizations.slug}) like ${searchPattern}
          or lower(${organizations.publicId}::text) like ${searchPattern}
          or lower(coalesce(owner_user.display_name, '')) like ${searchPattern}
        )
      `);
    }

    if (query.status) {
      filters.push(sql`${tenants.status} = ${query.status}`);
    }

    if (query.onboardingState) {
      filters.push(sql`
        (
          case
            when ${tenants.status} = 'deleted' then 'archived'
            when ${tenants.status} = 'suspended'
              or ${organizations.isActive} = false
              or owner_user.is_active = false then 'attention'
            when ${organizations.ownerId} is null or ${tenants.status} = 'draft' then 'setup'
            when ${organizations.gcpTenantId} is null then 'provisioning'
            when coalesce(invitation_counts.pending_invitation_count, 0) > 0 then 'invited'
            else 'ready'
          end
        ) = ${query.onboardingState}
      `);
    }

    return filters;
  }

  private buildOrderBy(query: GetAdminTenantsOverviewQuery): ReturnType<typeof sql> {
    const direction = query.sortOrder === 'desc' ? sql.raw('desc') : sql.raw('asc');

    switch (query.sortBy) {
      case 'createdAt':
        return sql`created_at ${direction}, organization_id asc`;
      case 'updatedAt':
        return sql`updated_at ${direction}, organization_id asc`;
      case 'memberCount':
        return sql`member_count ${direction}, organization_id asc`;
      case 'pendingInvitationCount':
        return sql`pending_invitation_count ${direction}, organization_id asc`;
      case 'status':
        return sql`tenant_status ${direction}, organization_id asc`;
      default:
        return sql`lower(coalesce(display_name, name)) ${direction}, organization_id asc`;
    }
  }

  private buildPagination(
    page: number,
    pageSize: number,
    total: number
  ): AdminTenantsOverviewDto['pagination'] {
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    return {
      page,
      pageSize,
      total,
      totalPages,
      hasNext: totalPages > 0 && page < totalPages,
      hasPrevious: page > 1 && totalPages > 0
    };
  }

  private mapRow(row: TenantInventoryRow): AdminTenantInventoryItemDto {
    const diagnostics = this.buildDiagnostics(row.tenant_settings);
    const hasOwner = row.owner_user_id !== null;
    const hasProvisionedAuthTenant = Boolean(row.gcp_tenant_id);

    return {
      organizationId: this.toInt(row.organization_id),
      tenantId: this.toInt(row.tenant_id),
      publicId: this.toString(row.public_id),
      name: this.toString(row.name),
      displayName: this.toOptionalString(row.display_name),
      slug: this.toString(row.slug),
      status: this.toTenantStatus(row.tenant_status),
      tenantType: this.toTenantType(row.tenant_type),
      organizationActive: this.toBoolean(row.organization_active),
      isDeleted: row.organization_deleted_at !== null && row.organization_deleted_at !== undefined,
      deletedAt: this.toOptionalIsoString(row.organization_deleted_at),
      ownerUserId: hasOwner ? this.toInt(row.owner_user_id) : undefined,
      ownerDisplayName: this.toOptionalString(row.owner_display_name),
      ownerActive: hasOwner ? this.toBoolean(row.owner_active) : undefined,
      hasOwner,
      memberCount: this.toInt(row.member_count),
      adminCount: this.toInt(row.admin_count),
      pendingInvitationCount: this.toInt(row.pending_invitation_count),
      gcpTenantId: this.toOptionalString(row.gcp_tenant_id),
      hasProvisionedAuthTenant,
      onboardingState: this.toOnboardingState(row.onboarding_state),
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
      diagnostics
    };
  }

  private buildDiagnostics(settings: unknown): AdminTenantInventoryItemDto['diagnostics'] {
    const tenantSettings = this.isObject(settings) ? (settings as ITenantSettings) : {};
    const features = tenantSettings.features ?? {};
    const branding = tenantSettings.branding ?? {};
    const limits = tenantSettings.limits ?? {};

    return {
      ssoEnabled: Boolean(features.sso),
      apiAccessEnabled: Boolean(features.apiAccess),
      hasCustomDomain: Boolean(branding.customDomain),
      hasCustomEmail: Boolean(branding.customEmail),
      maxUsers: this.toOptionalNumber(features.maxUsers),
      apiRateLimit: this.toOptionalNumber(limits.apiRateLimit)
    };
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

  private toTenantStatus(value: unknown): AdminTenantInventoryItemDto['status'] {
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

  private toTenantType(value: unknown): AdminTenantInventoryItemDto['tenantType'] {
    switch (value) {
      case 'organization':
      case 'team':
      case 'individual':
        return value;
      default:
        return 'organization';
    }
  }

  private toOnboardingState(value: unknown): AdminTenantInventoryItemDto['onboardingState'] {
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

interface TenantAggregateRow {
  total_count: unknown;
  active_count: unknown;
  provisioning_gaps_count: unknown;
  invite_backlog_count: unknown;
  members_tracked_total: unknown;
  tenant_admins_total: unknown;
}

interface TenantInventoryRow {
  organization_id: unknown;
  public_id: unknown;
  tenant_id: unknown;
  name: unknown;
  display_name: unknown;
  slug: unknown;
  organization_active: unknown;
  organization_deleted_at: unknown;
  owner_user_id: unknown;
  gcp_tenant_id: unknown;
  created_at: unknown;
  updated_at: unknown;
  tenant_type: unknown;
  tenant_status: unknown;
  tenant_settings: unknown;
  owner_display_name: unknown;
  owner_active: unknown;
  member_count: unknown;
  admin_count: unknown;
  pending_invitation_count: unknown;
  onboarding_state: unknown;
}
