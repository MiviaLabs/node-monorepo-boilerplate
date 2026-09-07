import { Inject, Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  invitations,
  organizations,
  sql,
  tenants,
  userRoles,
  userTenants,
  users,
  type NodePgDatabase
} from '@package/db-core';

import { AdminAccessOverviewDto, type AdminAccessMembershipDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminAccessOverviewQuery } from '../../queries';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminAccessOverviewQuery)
export class GetAdminAccessOverviewHandler implements IQueryHandler<
  GetAdminAccessOverviewQuery,
  AdminAccessOverviewDto
> {
  private readonly logger = new Logger(GetAdminAccessOverviewHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminAccessOverviewQuery = new GetAdminAccessOverviewQuery({})
  ): Promise<AdminAccessOverviewDto> {
    this.logger.debug('Fetching admin access inventory');

    const memberSearchPattern = query.memberSearch
      ? `%${query.memberSearch.toLowerCase()}%`
      : undefined;
    const invitationSearchPattern = query.invitationSearch
      ? `%${query.invitationSearch.toLowerCase()}%`
      : undefined;
    const memberOffset = (query.memberPage - 1) * query.memberPageSize;
    const invitationOffset = (query.invitationPage - 1) * query.invitationPageSize;

    const memberFilters = this.buildMembershipFilters(query, memberSearchPattern);
    const memberOrderBy = this.buildMembershipOrderBy(query);
    const invitationFilters = this.buildInvitationFilters(query, invitationSearchPattern);
    const invitationOrderBy = this.buildInvitationOrderBy(query);

    const membershipInventorySql = this.buildMembershipInventorySql(memberFilters);
    const invitationInventorySql = this.buildInvitationInventorySql(invitationFilters);

    const [
      membershipAggregateResult,
      membershipPagedResult,
      invitationAggregateResult,
      invitationPagedResult
    ] = await Promise.all([
      this.db.execute(sql`
          with membership_inventory as (${membershipInventorySql})
          select
            count(*)::int as total_count,
            count(*) filter (where membership_status = 'active')::int as active_count,
            count(*) filter (where is_privileged = true)::int as privileged_count
          from membership_inventory
        `),
      this.db.execute(sql`
          with membership_inventory as (${membershipInventorySql})
          select
            membership_inventory.*,
            count(*) over()::int as total_count
          from membership_inventory
          order by ${memberOrderBy}
          limit ${query.memberPageSize}
          offset ${memberOffset}
        `),
      this.db.execute(sql`
          with invitation_inventory as (${invitationInventorySql})
          select
            count(*) filter (where invitation_status = 'pending')::int as active_count,
            count(*) filter (
              where invitation_status = 'expired' or invitation_status = 'cancelled'
            )::int as inactive_count,
            count(*)::int as total_count
          from invitation_inventory
        `),
      this.db.execute(sql`
          with invitation_inventory as (${invitationInventorySql})
          select
            invitation_inventory.*,
            count(*) over()::int as total_count
          from invitation_inventory
          order by ${invitationOrderBy}
          limit ${query.invitationPageSize}
          offset ${invitationOffset}
        `)
    ]);

    const membershipRows = membershipPagedResult.rows as unknown as MembershipRow[];
    const membershipRoleMap = await this.loadSystemRoleMap(membershipRows);
    const memberships = membershipRows.map((row) => this.mapMembershipRow(row, membershipRoleMap));
    const invitationsList = (invitationPagedResult.rows as unknown as InvitationRow[]).map((row) =>
      this.mapInvitationRow(row)
    );
    const membershipAggregate = (membershipAggregateResult.rows[0] ??
      {}) as unknown as MembershipAggregateRow;
    const invitationAggregate = (invitationAggregateResult.rows[0] ??
      {}) as unknown as InvitationAggregateRow;

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.access.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin',
        action: 'VIEW_ADMIN_ACCESS',
        target: {
          entityType: 'admin'
        },
        details: {
          membershipPage: query.memberPage,
          membershipPageSize: query.memberPageSize,
          membershipResultCount: memberships.length,
          invitationPage: query.invitationPage,
          invitationPageSize: query.invitationPageSize,
          invitationResultCount: invitationsList.length,
          memberSearchApplied: Boolean(query.memberSearch),
          invitationSearchApplied: Boolean(query.invitationSearch),
          memberOrganizationFilterApplied: query.memberOrganizationId !== undefined,
          memberTenantFilterApplied: query.memberTenantId !== undefined,
          memberRecordState: query.memberRecordState,
          memberStatusFilterApplied: query.memberStatus !== undefined,
          memberPrivilege: query.memberPrivilege,
          memberRoleFilterApplied: query.memberRole !== undefined,
          invitationStatusFilterApplied: query.invitationStatus !== undefined,
          invitationPrivilege: query.invitationPrivilege,
          invitationRoleFilterApplied: query.invitationRole !== undefined
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    return {
      generatedAt: new Date().toISOString(),
      metrics: [
        {
          key: 'members_total',
          label: 'Members',
          value: this.toInt(membershipAggregate.total_count),
          summary: `${this.toInt(membershipAggregate.active_count)} active memberships`
        },
        {
          key: 'privileged_members_total',
          label: 'Privileged members',
          value: this.toInt(membershipAggregate.privileged_count),
          summary:
            this.toInt(membershipAggregate.privileged_count) > 0
              ? 'Requires review'
              : 'No elevated posture'
        },
        {
          key: 'active_invitations_total',
          label: 'Active invitations',
          value: this.toInt(invitationAggregate.active_count),
          summary:
            this.toInt(invitationAggregate.active_count) > 0
              ? 'Pending acceptance'
              : 'No open invites'
        },
        {
          key: 'expired_or_cancelled_invitations_total',
          label: 'Inactive invitations',
          value: this.toInt(invitationAggregate.inactive_count),
          summary:
            this.toInt(invitationAggregate.inactive_count) > 0
              ? 'Historical posture'
              : 'No stale invites'
        }
      ],
      memberships,
      membershipsPagination: this.buildPagination(
        query.memberPage,
        query.memberPageSize,
        this.toInt(membershipAggregate.total_count)
      ),
      invitations: invitationsList,
      invitationsPagination: this.buildPagination(
        query.invitationPage,
        query.invitationPageSize,
        this.toInt(invitationAggregate.total_count)
      )
    };
  }

  private buildMembershipInventorySql(
    filters: ReturnType<typeof this.buildMembershipFilters>
  ): ReturnType<typeof sql> {
    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;

    return sql`
      select
        ${users.id} as user_id,
        ${users.organizationId} as organization_id,
        ${users.displayName} as user_display_name,
        ${users.isActive} as user_is_active,
        ${users.deletedAt} as user_deleted_at,
        ${organizations.name} as organization_name,
        ${organizations.displayName} as organization_display_name,
        ${organizations.slug} as organization_slug,
        ${organizations.isActive} as organization_is_active,
        ${organizations.deletedAt} as organization_deleted_at,
        ${userTenants.tenantId} as tenant_id,
        ${tenants.type} as tenant_type,
        ${tenants.status} as tenant_status,
        ${userTenants.role} as membership_role,
        ${userTenants.isActive} as membership_is_active,
        ${userTenants.isDefault} as membership_is_default,
        ${userTenants.createdAt} as membership_created_at,
        ${userTenants.updatedAt} as membership_updated_at,
        exists(
          select 1
          from ${userRoles}
          where ${userRoles.userId} = ${users.id}
            and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
        ) as has_system_role,
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
      ${whereClause}
    `;
  }

  private buildInvitationInventorySql(
    filters: ReturnType<typeof this.buildInvitationFilters>
  ): ReturnType<typeof sql> {
    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;

    return sql`
      select
        ${invitations.id} as invitation_id,
        ${invitations.organizationId} as organization_id,
        ${organizations.name} as organization_name,
        ${organizations.displayName} as organization_display_name,
        ${organizations.slug} as organization_slug,
        ${organizations.tenantId} as tenant_id,
        ${tenants.type} as tenant_type,
        ${invitations.role} as invitation_role,
        case
          when ${invitations.status} = 'pending'
            and ${invitations.expiresAt} is not null
            and ${invitations.expiresAt} <= now() then 'expired'
          else ${invitations.status}
        end as invitation_status,
        ${invitations.invitedByUserId} as invited_by_user_id,
        inviter.display_name as invited_by_display_name,
        ${invitations.createdAt} as invitation_created_at,
        ${invitations.expiresAt} as invitation_expires_at,
        (${invitations.role} in ('tenant_owner', 'tenant_admin')) as is_privileged
      from ${invitations}
      inner join ${organizations}
        on ${organizations.id} = ${invitations.organizationId}
        and ${organizations.deletedAt} is null
      inner join ${tenants}
        on ${tenants.id} = ${organizations.tenantId}
      left join ${sql`${users} as inviter`}
        on inviter.id = ${invitations.invitedByUserId}
        and inviter.deleted_at is null
      ${whereClause}
    `;
  }

  private buildMembershipFilters(
    query: GetAdminAccessOverviewQuery,
    searchPattern?: string
  ): ReturnType<typeof sql>[] {
    const filters: ReturnType<typeof sql>[] = [];

    if (query.memberRecordState === 'active') {
      filters.push(sql`${users.deletedAt} is null`);
    } else if (query.memberRecordState === 'deleted') {
      filters.push(sql`${users.deletedAt} is not null`);
    }

    if (query.memberOrganizationId !== undefined) {
      filters.push(sql`${users.organizationId} = ${query.memberOrganizationId}`);
    }

    if (query.memberTenantId !== undefined) {
      filters.push(sql`${userTenants.tenantId} = ${query.memberTenantId}`);
    }

    if (searchPattern) {
      filters.push(sql`
        (
          lower(coalesce(${users.displayName}, '')) like ${searchPattern}
          or lower(coalesce(${organizations.displayName}, ${organizations.name}, '')) like ${searchPattern}
          or lower(coalesce(${organizations.slug}, '')) like ${searchPattern}
          or lower(${users.id}::text) like ${searchPattern}
          or lower(${users.organizationId}::text) like ${searchPattern}
          or lower(${userTenants.tenantId}::text) like ${searchPattern}
        )
      `);
    }

    if (query.memberStatus) {
      filters.push(sql`
        (
          case
            when ${tenants.status} in ('suspended', 'deleted') then 'suspended'
            when ${users.isActive} = false or ${userTenants.isActive} = false then 'inactive'
            else 'active'
          end
        ) = ${query.memberStatus}
      `);
    }

    if (query.memberPrivilege === 'privileged') {
      filters.push(sql`
        (
          exists(
            select 1
            from ${userRoles}
            where ${userRoles.userId} = ${users.id}
              and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
          ) or ${userTenants.role} in ('tenant_owner', 'tenant_admin')
        )
      `);
    }

    if (query.memberPrivilege === 'standard') {
      filters.push(sql`
        not (
          exists(
            select 1
            from ${userRoles}
            where ${userRoles.userId} = ${users.id}
              and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
          ) or ${userTenants.role} in ('tenant_owner', 'tenant_admin')
        )
      `);
    }

    if (query.memberRole) {
      filters.push(sql`${userTenants.role} = ${query.memberRole}`);
    }

    return filters;
  }

  private buildInvitationFilters(
    query: GetAdminAccessOverviewQuery,
    searchPattern?: string
  ): ReturnType<typeof sql>[] {
    const filters: ReturnType<typeof sql>[] = [sql`${organizations.deletedAt} is null`];

    if (searchPattern) {
      filters.push(sql`
        (
          lower(coalesce(${organizations.displayName}, ${organizations.name})) like ${searchPattern}
          or lower(${organizations.slug}) like ${searchPattern}
          or lower(coalesce(inviter.display_name, '')) like ${searchPattern}
          or lower(${invitations.id}::text) like ${searchPattern}
          or lower(${invitations.organizationId}::text) like ${searchPattern}
          or lower(${organizations.tenantId}::text) like ${searchPattern}
        )
      `);
    }

    if (query.invitationStatus) {
      filters.push(sql`
        (
          case
            when ${invitations.status} = 'pending'
              and ${invitations.expiresAt} is not null
              and ${invitations.expiresAt} <= now() then 'expired'
            else ${invitations.status}
          end
        ) = ${query.invitationStatus}
      `);
    }

    if (query.invitationPrivilege === 'privileged') {
      filters.push(sql`${invitations.role} in ('tenant_owner', 'tenant_admin')`);
    }

    if (query.invitationPrivilege === 'standard') {
      filters.push(sql`${invitations.role} not in ('tenant_owner', 'tenant_admin')`);
    }

    if (query.invitationRole) {
      filters.push(sql`${invitations.role} = ${query.invitationRole}`);
    }

    return filters;
  }

  private buildMembershipOrderBy(query: GetAdminAccessOverviewQuery): ReturnType<typeof sql> {
    const direction = query.memberSortOrder === 'desc' ? sql.raw('desc') : sql.raw('asc');

    switch (query.memberSortBy) {
      case 'createdAt':
        return sql`membership_created_at ${direction}, user_id asc, tenant_id asc`;
      case 'membershipRole':
        return sql`membership_role ${direction}, user_id asc, tenant_id asc`;
      case 'status':
        return sql`membership_status ${direction}, user_id asc, tenant_id asc`;
      default:
        return sql`lower(coalesce(user_display_name, '')) ${direction}, user_id asc, tenant_id asc`;
    }
  }

  private buildInvitationOrderBy(query: GetAdminAccessOverviewQuery): ReturnType<typeof sql> {
    const direction = query.invitationSortOrder === 'asc' ? sql.raw('asc') : sql.raw('desc');

    switch (query.invitationSortBy) {
      case 'organizationName':
        return sql`lower(coalesce(organization_display_name, organization_name)) ${direction}, invitation_id desc`;
      case 'role':
        return sql`invitation_role ${direction}, invitation_id desc`;
      case 'status':
        return sql`invitation_status ${direction}, invitation_id desc`;
      default:
        return sql`invitation_created_at ${direction}, invitation_id desc`;
    }
  }

  private async loadSystemRoleMap(
    rows: MembershipRow[]
  ): Promise<Map<number, Array<'system_owner' | 'system_admin'>>> {
    const userIds = Array.from(new Set(rows.map((row) => this.toInt(row.user_id))));
    if (userIds.length === 0) {
      return new Map<number, Array<'system_owner' | 'system_admin'>>();
    }

    const roleQuery = sql`
      select
        ${userRoles.userId} as user_id,
        ${userRoles.role} as system_role
      from ${userRoles}
      where ${userRoles.userId} in (${sql.join(
        userIds.map((userId) => sql`${userId}`),
        sql`, `
      )})
        and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
    `;

    const result = await this.db.execute(roleQuery);
    const roleMap = new Map<number, Array<'system_owner' | 'system_admin'>>();

    for (const row of result.rows as unknown as SystemRoleRow[]) {
      const userId = this.toInt(row.user_id);
      const role = this.toSystemRole(row.system_role);
      if (!role) {
        continue;
      }

      const current = roleMap.get(userId) ?? [];
      if (!current.includes(role)) {
        current.push(role);
      }
      roleMap.set(userId, current.sort());
    }

    return roleMap;
  }

  private buildPagination(
    page: number,
    pageSize: number,
    total: number
  ): AdminAccessOverviewDto['membershipsPagination'] {
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

  private mapMembershipRow(
    row: MembershipRow,
    systemRolesByUser: Map<number, Array<'system_owner' | 'system_admin'>>
  ): AdminAccessMembershipDto {
    const userId = this.toInt(row.user_id);
    const systemRoles = systemRolesByUser.get(userId) ?? [];
    const membershipRole = this.toTenantRole(row.membership_role);
    const tenantStatus = this.toTenantStatus(row.tenant_status);

    return {
      userId,
      organizationId: this.toOptionalInt(row.organization_id),
      organizationName: this.toOptionalString(row.organization_name),
      organizationDisplayName: this.toOptionalString(row.organization_display_name),
      organizationSlug: this.toOptionalString(row.organization_slug),
      tenantId: this.toInt(row.tenant_id),
      tenantType: this.toTenantType(row.tenant_type),
      tenantStatus,
      displayName: this.toOptionalString(row.user_display_name),
      membershipRole,
      status: this.toMembershipStatus(row.membership_status),
      userLifecycle: row.user_deleted_at ? 'deleted' : 'active',
      userActive: this.toBoolean(row.user_is_active),
      userDeletedAt: this.toOptionalIsoString(row.user_deleted_at),
      organizationActive: this.toOptionalBoolean(row.organization_is_active),
      organizationDeletedAt: this.toOptionalIsoString(row.organization_deleted_at),
      systemRoles,
      isPrivileged: this.toBoolean(row.is_privileged),
      isDefault: this.toBoolean(row.membership_is_default),
      createdAt: this.toIsoString(row.membership_created_at),
      updatedAt: this.toIsoString(row.membership_updated_at)
    };
  }

  private mapInvitationRow(row: InvitationRow): AdminAccessOverviewDto['invitations'][number] {
    const role = this.toTenantRole(row.invitation_role);
    const expiresAt = this.toOptionalIsoString(row.invitation_expires_at);

    return {
      invitationId: this.toInt(row.invitation_id),
      organizationId: this.toInt(row.organization_id),
      organizationName: this.toString(row.organization_name),
      organizationDisplayName: this.toOptionalString(row.organization_display_name),
      organizationSlug: this.toString(row.organization_slug),
      tenantId: this.toInt(row.tenant_id),
      tenantType: this.toTenantType(row.tenant_type),
      role,
      status: this.toInvitationStatus(row.invitation_status),
      invitedByUserId: this.toOptionalInt(row.invited_by_user_id),
      invitedByDisplayName: this.toOptionalString(row.invited_by_display_name),
      isPrivileged: this.toBoolean(row.is_privileged),
      createdAt: this.toIsoString(row.invitation_created_at),
      expiresAt
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

  private toTenantRole(value: unknown): AdminAccessMembershipDto['membershipRole'] {
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

  private toMembershipStatus(value: unknown): AdminAccessMembershipDto['status'] {
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
  ): AdminAccessMembershipDto['systemRoles'][number] | undefined {
    if (value === 'system_owner' || value === 'system_admin') {
      return value;
    }

    return undefined;
  }

  private toTenantType(value: unknown): AdminAccessMembershipDto['tenantType'] {
    switch (value) {
      case 'organization':
      case 'team':
      case 'individual':
        return value;
      default:
        return 'organization';
    }
  }

  private toTenantStatus(value: unknown): AdminAccessMembershipDto['tenantStatus'] {
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

  private toInvitationStatus(
    value: unknown
  ): AdminAccessOverviewDto['invitations'][number]['status'] {
    switch (value) {
      case 'pending':
      case 'accepted':
      case 'expired':
      case 'cancelled':
        return value;
      default:
        return 'pending';
    }
  }
}

interface MembershipAggregateRow {
  total_count: unknown;
  active_count: unknown;
  privileged_count: unknown;
}

interface InvitationAggregateRow {
  total_count: unknown;
  active_count: unknown;
  inactive_count: unknown;
}

interface MembershipRow {
  user_id: unknown;
  organization_id: unknown;
  user_display_name: unknown;
  user_is_active: unknown;
  user_deleted_at: unknown;
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
  membership_status: unknown;
  is_privileged: unknown;
}

interface InvitationRow {
  invitation_id: unknown;
  organization_id: unknown;
  organization_name: unknown;
  organization_display_name: unknown;
  organization_slug: unknown;
  tenant_id: unknown;
  tenant_type: unknown;
  invitation_role: unknown;
  invitation_status: unknown;
  invited_by_user_id: unknown;
  invited_by_display_name: unknown;
  invitation_created_at: unknown;
  invitation_expires_at: unknown;
  is_privileged: unknown;
}

interface SystemRoleRow {
  user_id: unknown;
  system_role: unknown;
}
