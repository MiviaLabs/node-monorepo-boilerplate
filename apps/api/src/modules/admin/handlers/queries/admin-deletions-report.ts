import { organizations, sql, userIdentities, users } from '@package/db-core';

import type { GetAdminDeletionsOverviewQuery } from '../../queries';
import type { ConfigService } from '@nestjs/config';

export type DeletionRetentionConfig = {
  retentionDays: number;
  purgeCron: string;
  purgeBatchSize: number;
  dryRun: boolean;
};

export function getDeletionRetentionConfig(config: ConfigService): DeletionRetentionConfig {
  return {
    retentionDays: Number(config.get<string>('SOFT_DELETE_RETENTION_DAYS', '90')),
    purgeCron: config.get<string>('SOFT_DELETE_PURGE_CRON', '0 2 * * *') ?? '0 2 * * *',
    purgeBatchSize: Number(config.get<string>('SOFT_DELETE_PURGE_BATCH_SIZE', '100')),
    dryRun: config.get<string>('SOFT_DELETE_PURGE_DRY_RUN') === 'true'
  };
}

export function buildDeletionQueueSql(retentionDays: number): ReturnType<typeof sql> {
  return sql`
    select
      'user'::text as entity_type,
      ${users.id} as entity_id,
      ${users.organizationId} as organization_id,
      ${organizations.tenantId} as tenant_id,
      coalesce(${users.displayName}, 'User #' || ${users.id}::text) as display_name,
      coalesce(${organizations.displayName}, ${organizations.name}) as organization_name,
      ${users.deletedAt} as deleted_at,
      ${users.deletedAt} + (${retentionDays} * interval '1 day') as scheduled_purge_at,
      exists(
        select 1
        from ${userIdentities}
        where ${userIdentities.userId} = ${users.id}
          and ${userIdentities.isPrimary} = true
          and ${userIdentities.providerUid} is not null
      ) as has_provider_identity,
      ${organizations.gcpTenantId} is not null as has_provider_tenant,
      (
        exists(
          select 1
          from ${userIdentities}
          where ${userIdentities.userId} = ${users.id}
            and ${userIdentities.isPrimary} = true
            and ${userIdentities.providerUid} is not null
        )
        and ${organizations.gcpTenantId} is not null
      ) as provider_cleanup_planned
    from ${users}
    inner join ${organizations}
      on ${organizations.id} = ${users.organizationId}
    where ${users.deletedAt} is not null

    union all

    select
      'organization'::text as entity_type,
      ${organizations.id} as entity_id,
      ${organizations.id} as organization_id,
      ${organizations.tenantId} as tenant_id,
      coalesce(${organizations.displayName}, ${organizations.name}) as display_name,
      null::text as organization_name,
      ${organizations.deletedAt} as deleted_at,
      ${organizations.deletedAt} + (${retentionDays} * interval '1 day') as scheduled_purge_at,
      false as has_provider_identity,
      ${organizations.gcpTenantId} is not null as has_provider_tenant,
      ${organizations.gcpTenantId} is not null as provider_cleanup_planned
    from ${organizations}
    where ${organizations.deletedAt} is not null
  `;
}

export function buildDeletionQueueFilters(
  query: GetAdminDeletionsOverviewQuery,
  searchPattern?: string
): ReturnType<typeof sql>[] {
  const filters: ReturnType<typeof sql>[] = [];

  if (query.entityType !== 'all') {
    filters.push(sql`entity_type = ${query.entityType}`);
  }

  if (query.purgeState === 'pending') {
    filters.push(sql`scheduled_purge_at > now()`);
  } else if (query.purgeState === 'eligible') {
    filters.push(sql`scheduled_purge_at <= now()`);
  } else if (query.purgeState === 'overdue') {
    filters.push(sql`scheduled_purge_at < now()`);
  } else if (query.purgeState === 'within_7_days') {
    filters.push(
      sql`scheduled_purge_at > now() and scheduled_purge_at <= now() + interval '7 day'`
    );
  }

  if (query.providerState === 'pending') {
    filters.push(sql`provider_cleanup_planned = true`);
  } else if (query.providerState === 'not_applicable') {
    filters.push(
      sql`provider_cleanup_planned = false and has_provider_identity = false and has_provider_tenant = false`
    );
  } else if (query.providerState === 'unknown') {
    filters.push(
      sql`provider_cleanup_planned = false and (has_provider_identity = true or has_provider_tenant = true)`
    );
  }

  if (searchPattern) {
    filters.push(sql`
      (
        lower(coalesce(display_name, '')) like ${searchPattern}
        or lower(coalesce(organization_name, '')) like ${searchPattern}
        or entity_id::text like ${searchPattern}
        or coalesce(organization_id::text, '') like ${searchPattern}
      )
    `);
  }

  return filters;
}

export function buildDeletionQueueOrderBy(
  query: GetAdminDeletionsOverviewQuery
): ReturnType<typeof sql> {
  switch (query.sortBy) {
    case 'deletedAt':
      return query.sortOrder === 'desc'
        ? sql`deleted_at desc, entity_id asc`
        : sql`deleted_at asc, entity_id asc`;
    case 'displayName':
      return query.sortOrder === 'desc'
        ? sql`display_name desc, entity_id asc`
        : sql`display_name asc, entity_id asc`;
    case 'entityType':
      return query.sortOrder === 'desc'
        ? sql`entity_type desc, scheduled_purge_at asc, entity_id asc`
        : sql`entity_type asc, scheduled_purge_at asc, entity_id asc`;
    case 'scheduledPurgeAt':
    default:
      return query.sortOrder === 'desc'
        ? sql`scheduled_purge_at desc, entity_id asc`
        : sql`scheduled_purge_at asc, entity_id asc`;
  }
}

export function toInt(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}
