import { Inject, Logger } from '@nestjs/common';
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

import { AdminUsersOverviewDto, type AdminUserInventoryItemDto } from '../../dto';
import { buildAdminAuditEvent } from '../../events';
import { GetAdminUsersOverviewQuery } from '../../queries';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@QueryHandler(GetAdminUsersOverviewQuery)
export class GetAdminUsersOverviewHandler implements IQueryHandler<
  GetAdminUsersOverviewQuery,
  AdminUsersOverviewDto
> {
  private readonly logger = new Logger(GetAdminUsersOverviewHandler.name);

  constructor(
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(
    query: GetAdminUsersOverviewQuery = new GetAdminUsersOverviewQuery({})
  ): Promise<AdminUsersOverviewDto> {
    this.logger.debug('Fetching admin users inventory');

    const searchPattern = query.search ? `%${query.search.toLowerCase()}%` : undefined;
    const offset = (query.page - 1) * query.pageSize;
    const filters = this.buildUserFilters(query, searchPattern);
    const orderBy = this.buildOrderBy(query);
    const inventorySql = this.buildUserInventorySql(filters);

    const [aggregateResult, pagedResult] = await Promise.all([
      this.db.execute(sql`
        with user_inventory as (${inventorySql})
        select
          count(*)::int as total_count,
          count(*) filter (where user_lifecycle = 'active' and user_is_active = true)::int as active_count,
          count(*) filter (where is_privileged = true)::int as privileged_count,
          count(*) filter (where has_primary_identity = false)::int as without_identity_count
        from user_inventory
      `),
      this.db.execute(sql`
        with user_inventory as (${inventorySql})
        select
          user_inventory.*
        from user_inventory
        order by ${orderBy}
        limit ${query.pageSize}
        offset ${offset}
      `)
    ]);

    const rows = pagedResult.rows as unknown as UserRow[];
    const systemRoleMap = await this.loadSystemRoleMap(rows);
    const items = rows.map((row) => this.mapRow(row, systemRoleMap));
    const aggregate = (aggregateResult.rows[0] ?? {}) as unknown as UsersAggregateRow;

    await this.auditOutbox.insert(
      this.db,
      buildAdminAuditEvent({
        eventType: 'admin.users.viewed.audit',
        tenantId: query.tenantId,
        actorId: query.actorId,
        requestId: query.requestId,
        aggregateId: 'admin-users',
        action: 'VIEW_ADMIN_USERS',
        target: {
          entityType: 'admin'
        },
        details: {
          page: query.page,
          pageSize: query.pageSize,
          resultCount: items.length,
          searchApplied: Boolean(query.search),
          tenantScopeApplied: query.userTenantId !== undefined,
          recordState: query.recordState,
          identityState: query.identityState,
          privilege: query.privilege,
          systemRoleFilterApplied: query.systemRole !== undefined
        },
        correlationId: query.correlationId,
        causationId: query.causationId
      })
    );

    const total = this.toInt(aggregate.total_count);

    return {
      generatedAt: new Date().toISOString(),
      metrics: [
        {
          key: 'users_total',
          label: 'Users',
          value: total,
          summary: `${this.toInt(aggregate.active_count)} active accounts`
        },
        {
          key: 'privileged_users_total',
          label: 'Privileged users',
          value: this.toInt(aggregate.privileged_count),
          summary:
            this.toInt(aggregate.privileged_count) > 0
              ? 'Elevated posture present'
              : 'No elevated posture'
        },
        {
          key: 'users_without_identity_total',
          label: 'Without identity',
          value: this.toInt(aggregate.without_identity_count),
          summary:
            this.toInt(aggregate.without_identity_count) > 0
              ? 'Needs auth review'
              : 'All users have a primary identity'
        }
      ],
      users: items,
      pagination: this.buildPagination(query.page, query.pageSize, total)
    };
  }

  private buildUserInventorySql(
    filters: ReturnType<typeof this.buildUserFilters>
  ): ReturnType<typeof sql> {
    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;

    return sql`
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
        primary_identity.provider as primary_identity_provider,
        (
          primary_identity.provider is not null
          or primary_identity.display_name is not null
          or primary_identity.email_verified is not null
          or primary_identity.phone_verified is not null
        ) as has_primary_identity,
        coalesce(membership_stats.total_memberships, 0)::int as membership_count,
        coalesce(membership_stats.active_memberships, 0)::int as active_membership_count,
        coalesce(membership_stats.privileged_memberships, 0)::int as privileged_membership_count,
        membership_stats.default_tenant_id as default_tenant_id,
        membership_stats.default_tenant_status as default_tenant_status,
        exists(
          select 1
          from ${userRoles}
          where ${userRoles.userId} = ${users.id}
            and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
        ) as has_system_role,
        case
          when ${users.deletedAt} is not null then 'deleted'
          else 'active'
        end as user_lifecycle,
        (
          exists(
            select 1
            from ${userRoles}
            where ${userRoles.userId} = ${users.id}
              and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
          ) or coalesce(membership_stats.privileged_memberships, 0) > 0
        ) as is_privileged
      from ${users}
      left join ${organizations}
        on ${organizations.id} = ${users.organizationId}
      left join (
        select
          ${userIdentities.userId} as user_id,
          ${userIdentities.provider} as provider,
          ${userIdentities.displayName} as display_name,
          ${userIdentities.emailVerified} as email_verified,
          ${userIdentities.phoneVerified} as phone_verified
        from ${userIdentities}
        where ${userIdentities.isPrimary} = true
      ) as primary_identity
        on primary_identity.user_id = ${users.id}
      left join (
        select
          ${userTenants.userId} as user_id,
          count(*)::int as total_memberships,
          count(*) filter (
            where ${tenants.status} not in ('suspended', 'deleted')
              and ${userTenants.isActive} = true
              and ${users.isActive} = true
          )::int as active_memberships,
          count(*) filter (
            where ${userTenants.role} in ('tenant_owner', 'tenant_admin')
          )::int as privileged_memberships,
          max(case when ${userTenants.isDefault} = true then ${userTenants.tenantId} end)::int as default_tenant_id,
          max(case when ${userTenants.isDefault} = true then ${tenants.status} end) as default_tenant_status
        from ${userTenants}
        inner join ${users}
          on ${users.id} = ${userTenants.userId}
        inner join ${tenants}
          on ${tenants.id} = ${userTenants.tenantId}
        group by ${userTenants.userId}
      ) as membership_stats
        on membership_stats.user_id = ${users.id}
      ${whereClause}
    `;
  }

  private buildUserFilters(
    query: GetAdminUsersOverviewQuery,
    searchPattern?: string
  ): ReturnType<typeof sql>[] {
    const filters: ReturnType<typeof sql>[] = [];

    if (query.recordState === 'active') {
      filters.push(sql`${users.deletedAt} is null`);
    } else if (query.recordState === 'deleted') {
      filters.push(sql`${users.deletedAt} is not null`);
    }

    if (query.userTenantId !== undefined) {
      filters.push(sql`
        exists(
          select 1
          from ${userTenants}
          where ${userTenants.userId} = ${users.id}
            and ${userTenants.tenantId} = ${query.userTenantId}
        )
      `);
    }

    if (query.identityState === 'with_identity') {
      filters.push(sql`
        exists(
          select 1
          from ${userIdentities}
          where ${userIdentities.userId} = ${users.id}
            and ${userIdentities.isPrimary} = true
        )
      `);
    } else if (query.identityState === 'without_identity') {
      filters.push(sql`
        not exists(
          select 1
          from ${userIdentities}
          where ${userIdentities.userId} = ${users.id}
            and ${userIdentities.isPrimary} = true
        )
      `);
    }

    if (query.privilege === 'privileged') {
      filters.push(sql`
        (
          exists(
            select 1
            from ${userRoles}
            where ${userRoles.userId} = ${users.id}
              and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
          )
          or exists(
            select 1
            from ${userTenants}
            where ${userTenants.userId} = ${users.id}
              and ${userTenants.role} in ('tenant_owner', 'tenant_admin')
          )
        )
      `);
    } else if (query.privilege === 'standard') {
      filters.push(sql`
        not exists(
          select 1
          from ${userRoles}
          where ${userRoles.userId} = ${users.id}
            and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
        )
        and not exists(
          select 1
          from ${userTenants}
          where ${userTenants.userId} = ${users.id}
            and ${userTenants.role} in ('tenant_owner', 'tenant_admin')
        )
      `);
    }

    if (query.systemRole !== undefined) {
      filters.push(sql`
        exists(
          select 1
          from ${userRoles}
          where ${userRoles.userId} = ${users.id}
            and ${userRoles.role} = ${query.systemRole}
            and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
        )
      `);
    }

    if (searchPattern) {
      filters.push(sql`
        (
          lower(coalesce(${users.displayName}, '')) like ${searchPattern}
          or lower(coalesce(${organizations.displayName}, ${organizations.name}, '')) like ${searchPattern}
          or lower(coalesce(${organizations.slug}, '')) like ${searchPattern}
          or lower(${users.id}::text) like ${searchPattern}
          or exists(
            select 1
            from ${userIdentities}
            where ${userIdentities.userId} = ${users.id}
              and ${userIdentities.isPrimary} = true
              and lower(coalesce(${userIdentities.provider}, '')) like ${searchPattern}
          )
        )
      `);
    }

    return filters;
  }

  private buildOrderBy(query: GetAdminUsersOverviewQuery): ReturnType<typeof sql> {
    const direction = query.sortOrder === 'desc' ? sql.raw('desc') : sql.raw('asc');

    switch (query.sortBy) {
      case 'createdAt':
        return sql`user_created_at ${direction}, user_id asc`;
      case 'lastSignInAt':
        return sql`user_last_sign_in_at ${direction} nulls last, user_id asc`;
      case 'membershipCount':
        return sql`membership_count ${direction}, user_id asc`;
      default:
        return sql`lower(coalesce(user_display_name, '')) ${direction}, user_id asc`;
    }
  }

  private async loadSystemRoleMap(
    rows: UserRow[]
  ): Promise<Map<number, Array<'system_owner' | 'system_admin'>>> {
    const userIds = Array.from(new Set(rows.map((row) => this.toInt(row.user_id))));
    if (userIds.length === 0) {
      return new Map<number, Array<'system_owner' | 'system_admin'>>();
    }

    const result = await this.db.execute(sql`
      select
        ${userRoles.userId} as user_id,
        ${userRoles.role} as system_role
      from ${userRoles}
      where ${userRoles.userId} in (${sql.join(
        userIds.map((userId) => sql`${userId}`),
        sql`, `
      )})
        and (${userRoles.expiresAt} is null or ${userRoles.expiresAt} > now())
    `);

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
  ): AdminUsersOverviewDto['pagination'] {
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

  private mapRow(
    row: UserRow,
    systemRoleMap: Map<number, Array<'system_owner' | 'system_admin'>>
  ): AdminUserInventoryItemDto {
    const userId = this.toInt(row.user_id);
    return {
      userId,
      organizationId: this.toOptionalInt(row.organization_id),
      organizationName: this.toOptionalString(row.organization_name),
      organizationDisplayName: this.toOptionalString(row.organization_display_name),
      organizationSlug: this.toOptionalString(row.organization_slug),
      displayName: this.toOptionalString(row.user_display_name),
      photoUrl: this.toOptionalString(row.user_photo_url),
      primaryIdentityProvider: this.toOptionalString(row.primary_identity_provider),
      hasPrimaryIdentity: this.toBoolean(row.has_primary_identity),
      defaultTenantId: this.toOptionalInt(row.default_tenant_id),
      defaultTenantStatus: this.toOptionalTenantStatus(row.default_tenant_status),
      userLifecycle: row.user_deleted_at ? 'deleted' : 'active',
      userActive: this.toBoolean(row.user_is_active),
      userVerified: this.toBoolean(row.user_is_verified),
      userDeletedAt: this.toOptionalIsoString(row.user_deleted_at),
      systemRoles: systemRoleMap.get(userId) ?? [],
      isPrivileged: this.toBoolean(row.is_privileged),
      membershipCount: this.toInt(row.membership_count),
      activeMembershipCount: this.toInt(row.active_membership_count),
      privilegedMembershipCount: this.toInt(row.privileged_membership_count),
      createdAt: this.toIsoString(row.user_created_at),
      updatedAt: this.toIsoString(row.user_updated_at),
      lastSignInAt: this.toOptionalIsoString(row.user_last_sign_in_at)
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

  private toOptionalTenantStatus(
    value: unknown
  ): AdminUserInventoryItemDto['defaultTenantStatus'] | undefined {
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

    return undefined;
  }

  private toSystemRole(value: unknown): 'system_owner' | 'system_admin' | undefined {
    const normalized = this.toOptionalString(value);
    if (normalized === 'system_owner' || normalized === 'system_admin') {
      return normalized;
    }
    return undefined;
  }
}

type UserRow = {
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
  primary_identity_provider: unknown;
  has_primary_identity: unknown;
  membership_count: unknown;
  active_membership_count: unknown;
  privileged_membership_count: unknown;
  default_tenant_id: unknown;
  default_tenant_status: unknown;
  is_privileged: unknown;
};

type SystemRoleRow = {
  user_id: unknown;
  system_role: unknown;
};

type UsersAggregateRow = {
  total_count: unknown;
  active_count: unknown;
  privileged_count: unknown;
  without_identity_count: unknown;
};
