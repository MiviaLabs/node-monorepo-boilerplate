import { organizations } from '@package/db-core';
import { sql } from 'drizzle-orm';

import type {
  GetAdminEmailSummaryQuery,
  GetAdminEmailsOverviewQuery
} from '../../queries';

type EmailAdminQuery = GetAdminEmailsOverviewQuery | GetAdminEmailSummaryQuery;

export function buildAdminEmailFilters(
  query: EmailAdminQuery,
  searchPattern?: string
): ReturnType<typeof sql>[] {
  const filters: ReturnType<typeof sql>[] = [];

  if (query.organizationId !== undefined) {
    filters.push(sql`email_inventory.organization_id = ${query.organizationId}`);
  }

  if (query.messageStatus !== 'all') {
    filters.push(sql`email_inventory.message_status = ${query.messageStatus}`);
  }

  if (query.provider) {
    filters.push(sql`lower(coalesce(email_inventory.provider, '')) = lower(${query.provider})`);
  }

  if (query.providerStatus) {
    filters.push(
      sql`lower(coalesce(email_inventory.provider_status, '')) = lower(${query.providerStatus})`
    );
  }

  if (query.normalizedProviderStatus) {
    filters.push(
      sql`lower(coalesce(email_inventory.normalized_provider_status, '')) = lower(${query.normalizedProviderStatus})`
    );
  }

  if (query.referenceType) {
    filters.push(
      sql`lower(coalesce(email_inventory.reference_type, '')) = lower(${query.referenceType})`
    );
  }

  if (query.referenceId) {
    filters.push(
      sql`lower(coalesce(email_inventory.reference_id, '')) = lower(${query.referenceId})`
    );
  }

  if (query.webhookAttentionState === 'attention') {
    filters.push(sql`email_inventory.webhook_attention_state = 'attention'`);
  } else if (query.webhookAttentionState === 'clear') {
    filters.push(sql`email_inventory.webhook_attention_state = 'clear'`);
  }

  if (query.dateFrom) {
    filters.push(sql`email_inventory.created_at >= ${query.dateFrom}::timestamptz`);
  }

  if (query.dateTo) {
    filters.push(sql`email_inventory.created_at <= ${query.dateTo}::timestamptz`);
  }

  if (searchPattern) {
    filters.push(sql`
      (
        lower(coalesce(email_inventory.subject, '')) like ${searchPattern}
        or lower(coalesce(email_inventory.reference_type, '')) like ${searchPattern}
        or lower(coalesce(email_inventory.reference_id, '')) like ${searchPattern}
        or lower(email_inventory.public_id::text) like ${searchPattern}
        or lower(coalesce(email_inventory.organization_name, '')) like ${searchPattern}
        or lower(coalesce(email_inventory.provider_message_id, '')) like ${searchPattern}
        or lower(coalesce(email_inventory.provider_delivery_id, '')) like ${searchPattern}
        or lower(coalesce(email_inventory.provider_event_id, '')) like ${searchPattern}
        or lower(coalesce(email_inventory.correlation_id, '')) like ${searchPattern}
        or exists (
          select 1
          from email_provider_messages
          where email_provider_messages.email_message_id = email_inventory.email_message_id
            and (
              lower(coalesce(email_provider_messages.provider_message_id, '')) like ${searchPattern}
              or lower(coalesce(email_provider_messages.provider_delivery_id, '')) like ${searchPattern}
              or lower(coalesce(email_provider_messages.provider_event_id, '')) like ${searchPattern}
            )
        )
      )
    `);
  }

  return filters;
}

export function buildAdminEmailInventorySql(): ReturnType<typeof sql> {
  return sql`
    with latest_provider as materialized (
      select
        provider_rows.email_message_id,
        provider_rows.provider,
        provider_rows.attempt_number,
        provider_rows.provider_message_id,
        provider_rows.provider_delivery_id,
        provider_rows.provider_event_id,
        provider_rows.provider_status,
        provider_rows.normalized_status,
        provider_rows.last_webhook_occurred_at,
        provider_rows.last_webhook_at,
        provider_rows.correlation_id
      from (
        select
          email_provider_messages.email_message_id,
          email_provider_messages.provider,
          email_provider_messages.attempt_number,
          email_provider_messages.provider_message_id,
          email_provider_messages.provider_delivery_id,
          email_provider_messages.provider_event_id,
          email_provider_messages.provider_status,
          email_provider_messages.normalized_status,
          email_provider_messages.last_webhook_occurred_at,
          email_provider_messages.last_webhook_at,
          email_provider_messages.correlation_id,
          row_number() over (
            partition by email_provider_messages.email_message_id
            order by email_provider_messages.attempt_number desc, email_provider_messages.id desc
          ) as row_number
        from email_provider_messages
      ) as provider_rows
      where provider_rows.row_number = 1
    ),
    webhook_aggregate as materialized (
      select
        email_webhook_events.email_message_id,
        count(*) filter (
          where email_webhook_events.processing_status = 'failed'
        )::int as failed_webhook_count,
        count(*) filter (
          where email_webhook_events.processing_status = 'unmatched'
        )::int as unmatched_webhook_count,
        (
          array_agg(
            email_webhook_events.processing_status
            order by email_webhook_events.received_at desc, email_webhook_events.id desc
          )
        )[1] as latest_webhook_processing_status
      from email_webhook_events
      where email_webhook_events.email_message_id is not null
      group by email_webhook_events.email_message_id
    )
    select
      email_messages.id as email_message_id,
      email_messages.public_id as public_id,
      email_messages.organization_id as organization_id,
      coalesce(${organizations.displayName}, ${organizations.name}) as organization_name,
      email_messages.reference_type as reference_type,
      email_messages.reference_id as reference_id,
      email_messages.subject as subject,
      email_messages.status as message_status,
      latest_provider.provider as provider,
      latest_provider.attempt_number as attempt_number,
      latest_provider.provider_message_id as provider_message_id,
      latest_provider.provider_delivery_id as provider_delivery_id,
      latest_provider.provider_event_id as provider_event_id,
      latest_provider.provider_status as provider_status,
      latest_provider.normalized_status as normalized_provider_status,
      email_messages.accepted_at as accepted_at,
      email_messages.delivered_at as delivered_at,
      email_messages.failed_at as failed_at,
      latest_provider.last_webhook_occurred_at as last_webhook_occurred_at,
      latest_provider.last_webhook_at as last_webhook_at,
      coalesce(webhook_aggregate.failed_webhook_count, 0)::int as failed_webhook_count,
      coalesce(webhook_aggregate.unmatched_webhook_count, 0)::int as unmatched_webhook_count,
      webhook_aggregate.latest_webhook_processing_status as latest_webhook_processing_status,
      coalesce(email_messages.correlation_id, latest_provider.correlation_id) as correlation_id,
      email_messages.metadata as metadata,
      email_messages.created_at as created_at,
      email_messages.updated_at as updated_at,
      case
        when coalesce(webhook_aggregate.failed_webhook_count, 0) > 0
          or coalesce(webhook_aggregate.unmatched_webhook_count, 0) > 0
        then 'attention'
        else 'clear'
      end as webhook_attention_state
    from email_messages
    inner join ${organizations}
      on ${organizations.id} = email_messages.organization_id
    left join latest_provider
      on latest_provider.email_message_id = email_messages.id
    left join webhook_aggregate
      on webhook_aggregate.email_message_id = email_messages.id
  `;
}

export function buildAdminEmailOrderBy(
  query: GetAdminEmailsOverviewQuery
): ReturnType<typeof sql> {
  const direction = query.sortOrder === 'asc' ? sql`asc` : sql`desc`;

  switch (query.sortBy) {
    case 'updatedAt':
      return sql`email_inventory.updated_at ${direction} nulls last, email_inventory.email_message_id desc`;
    case 'acceptedAt':
      return sql`email_inventory.accepted_at ${direction} nulls last, email_inventory.email_message_id desc`;
    case 'deliveredAt':
      return sql`email_inventory.delivered_at ${direction} nulls last, email_inventory.email_message_id desc`;
    case 'failedAt':
      return sql`email_inventory.failed_at ${direction} nulls last, email_inventory.email_message_id desc`;
    case 'lastWebhookAt':
      return sql`email_inventory.last_webhook_at ${direction} nulls last, email_inventory.email_message_id desc`;
    default:
      return sql`email_inventory.created_at ${direction} nulls last, email_inventory.email_message_id desc`;
  }
}
