import { OutboxStatus, outbox } from '@package/db-outbox';
import { sql } from 'drizzle-orm';

import type { GetAdminOutboxOverviewQuery } from '../../queries';

export function buildOutboxFilters(
  query: GetAdminOutboxOverviewQuery,
  searchPattern?: string
): ReturnType<typeof sql>[] {
  const filters: ReturnType<typeof sql>[] = [];

  if (query.status !== 'all') {
    filters.push(sql`${outbox.status} = ${query.status}`);
  }

  if (query.deadLetterState === 'dead_lettered') {
    filters.push(sql`${outbox.deadLetteredAt} is not null`);
  } else if (query.deadLetterState === 'active') {
    filters.push(sql`${outbox.deadLetteredAt} is null`);
  }

  if (query.retryState === 'retryable') {
    filters.push(
      sql`${outbox.status} = ${OutboxStatus.FAILED} and ${outbox.nextRetryAt} is not null and ${outbox.nextRetryAt} <= now()`
    );
  } else if (query.retryState === 'awaiting_retry') {
    filters.push(
      sql`${outbox.status} = ${OutboxStatus.FAILED} and ${outbox.nextRetryAt} is not null and ${outbox.nextRetryAt} > now()`
    );
  } else if (query.retryState === 'no_retry') {
    filters.push(sql`${outbox.status} = ${OutboxStatus.FAILED} and ${outbox.nextRetryAt} is null`);
  }

  if (query.eventType) {
    filters.push(sql`lower(${outbox.eventType}) = lower(${query.eventType})`);
  }

  if (query.aggregateId) {
    filters.push(sql`lower(${outbox.aggregateId}) = lower(${query.aggregateId})`);
  }

  if (query.requestedTenantId) {
    filters.push(sql`${outbox.tenantId} = ${query.requestedTenantId}`);
  }

  if (searchPattern) {
    filters.push(sql`
      (
        lower(${outbox.eventType}) like ${searchPattern}
        or lower(${outbox.aggregateId}) like ${searchPattern}
        or lower(${outbox.tenantId}) like ${searchPattern}
        or ${outbox.eventId}::text like ${searchPattern}
      )
    `);
  }

  return filters;
}

export function buildOutboxOrderBy(
  query: GetAdminOutboxOverviewQuery
): ReturnType<typeof sql> {
  const direction = query.sortOrder === 'asc' ? sql`asc` : sql`desc`;

  switch (query.sortBy) {
    case 'status':
      return sql`${outbox.status} ${direction}, ${outbox.createdAt} desc`;
    case 'eventType':
      return sql`${outbox.eventType} ${direction}, ${outbox.createdAt} desc`;
    case 'retryCount':
      return sql`${outbox.retryCount} ${direction}, ${outbox.createdAt} desc`;
    case 'nextRetryAt':
      return sql`${outbox.nextRetryAt} ${direction} nulls last, ${outbox.createdAt} desc`;
    case 'publishedAt':
      return sql`${outbox.publishedAt} ${direction} nulls last, ${outbox.createdAt} desc`;
    case 'createdAt':
    default:
      return sql`${outbox.createdAt} ${direction}, ${outbox.eventId} asc`;
  }
}

export function toInt(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}
