import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  emailWebhookEvents,
  emailMessages,
  emailProviderMessages,
  eq,
  inArray,
  organizations,
  sql,
  type EmailWebhookEvent,
  type EmailWebhookProcessingStatus,
  type EmailWebhookVerificationStatus,
  type NewEmailWebhookEvent,
  type NodePgDatabase
} from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';

@Injectable()
export class EmailWebhookEventRepository {
  constructor(@Inject(MAIN_DB) private readonly db: NodePgDatabase) {}

  async findByDedupeKey(dedupeKey: string): Promise<EmailWebhookEvent | null> {
    return this.findByDedupeKeyWithDatabase(this.db, dedupeKey);
  }

  async findByDedupeKeyWithDatabase(
    database: NodePgDatabase,
    dedupeKey: string
  ): Promise<EmailWebhookEvent | null> {
    const [event] = await database
      .select()
      .from(emailWebhookEvents)
      .where(eq(emailWebhookEvents.dedupeKey, dedupeKey))
      .limit(1);

    return event ?? null;
  }

  async createIfAbsentWithDatabase(
    database: NodePgDatabase,
    data: NewEmailWebhookEvent
  ): Promise<EmailWebhookEvent | null> {
    const [created] = await database
      .insert(emailWebhookEvents)
      .values(data)
      .onConflictDoNothing({ target: emailWebhookEvents.dedupeKey })
      .returning();

    return created ?? null;
  }

  async findById(id: number): Promise<EmailWebhookEvent | null> {
    return this.findByIdWithDatabase(this.db, id);
  }

  async findByIdWithDatabase(
    database: NodePgDatabase,
    id: number
  ): Promise<EmailWebhookEvent | null> {
    const [event] = await database
      .select()
      .from(emailWebhookEvents)
      .where(eq(emailWebhookEvents.id, id))
      .limit(1);

    return event ?? null;
  }

  async updateProcessingWithDatabase(
    database: NodePgDatabase,
    id: number,
    update: {
      organizationId?: number | null;
      emailMessageId?: number | null;
      emailProviderMessageId?: number | null;
      processingStatus: EmailWebhookProcessingStatus;
      processingError?: string | null;
      processedAt: Date;
    }
  ): Promise<EmailWebhookEvent> {
    const [updated] = await database
      .update(emailWebhookEvents)
      .set({
        organizationId: update.organizationId,
        emailMessageId: update.emailMessageId,
        emailProviderMessageId: update.emailProviderMessageId,
        processingStatus: update.processingStatus,
        processingError: update.processingError ?? null,
        processedAt: update.processedAt,
        updatedAt: new Date()
      })
      .where(eq(emailWebhookEvents.id, id))
      .returning();

    if (!updated) {
      throw new Error(`EmailWebhookEvent ${id} not found for update`);
    }

    return updated;
  }

  async markFailedWithDatabase(
    database: NodePgDatabase,
    id: number,
    params: {
      processingError: string;
      processedAt: Date;
    }
  ): Promise<EmailWebhookEvent> {
    return this.updateProcessingWithDatabase(database, id, {
      processingStatus: 'failed',
      processingError: params.processingError,
      processedAt: params.processedAt
    });
  }

  async prepareForReprocessWithDatabase(
    database: NodePgDatabase,
    id: number,
    _processedAt?: Date
  ): Promise<EmailWebhookEvent | null> {
    const [updated] = await database
      .update(emailWebhookEvents)
      .set({
        processingStatus: 'received',
        processingError: null,
        processedAt: null,
        updatedAt: new Date(),
        attemptCount: sql`${emailWebhookEvents.attemptCount} + 1`
      })
      .where(
        and(
          eq(emailWebhookEvents.id, id),
          eq(emailWebhookEvents.verificationStatus, 'verified'),
          inArray(emailWebhookEvents.processingStatus, ['failed', 'unmatched', 'persisted'])
        )
      )
      .returning();

    return updated ?? null;
  }

  async getProcessingSummary(): Promise<{
    totalEvents: number;
    appliedEvents: number;
    unmatchedEvents: number;
    failedEvents: number;
    pendingEvents: number;
    retryableEvents: number;
    latestReceivedAt?: Date;
  }> {
    const [row] = await this.db
      .select({
        totalEvents: sql<number>`count(*)::int`,
        appliedEvents: sql<number>`count(*) filter (where ${emailWebhookEvents.processingStatus} = 'applied')::int`,
        unmatchedEvents: sql<number>`count(*) filter (where ${emailWebhookEvents.processingStatus} = 'unmatched')::int`,
        failedEvents: sql<number>`count(*) filter (where ${emailWebhookEvents.processingStatus} = 'failed')::int`,
        pendingEvents: sql<number>`count(*) filter (where ${emailWebhookEvents.processingStatus} in ('received', 'persisted'))::int`,
        retryableEvents: sql<number>`count(*) filter (where ${emailWebhookEvents.processingStatus} in ('failed', 'unmatched', 'persisted'))::int`,
        latestReceivedAt: sql<Date | null>`max(${emailWebhookEvents.receivedAt})`
      })
      .from(emailWebhookEvents);

    return {
      totalEvents: row?.totalEvents ?? 0,
      appliedEvents: row?.appliedEvents ?? 0,
      unmatchedEvents: row?.unmatchedEvents ?? 0,
      failedEvents: row?.failedEvents ?? 0,
      pendingEvents: row?.pendingEvents ?? 0,
      retryableEvents: row?.retryableEvents ?? 0,
      latestReceivedAt: row?.latestReceivedAt ?? undefined
    };
  }

  async listOperationalOverview(params: {
    page: number;
    pageSize: number;
    processingStatus?: EmailWebhookProcessingStatus;
    verificationStatus?: EmailWebhookVerificationStatus;
    provider?: string;
    organizationId?: number;
    normalizedEventType?: string;
    providerEventType?: string;
    providerMessageId?: string;
    providerDeliveryId?: string;
    providerEventId?: string;
    emailMessageId?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    total: number;
    items: EmailWebhookOperationalOverviewRow[];
  }> {
    const filters: ReturnType<typeof sql>[] = [];

    if (params.provider) {
      filters.push(sql`email_webhook_inventory.provider = ${params.provider}`);
    }

    if (params.organizationId !== undefined) {
      filters.push(sql`email_webhook_inventory.organization_id = ${params.organizationId}`);
    }

    if (params.processingStatus) {
      filters.push(sql`email_webhook_inventory.processing_status = ${params.processingStatus}`);
    }

    if (params.verificationStatus) {
      filters.push(sql`email_webhook_inventory.verification_status = ${params.verificationStatus}`);
    }

    if (params.normalizedEventType) {
      filters.push(
        sql`email_webhook_inventory.normalized_event_type = ${params.normalizedEventType}`
      );
    }

    if (params.providerEventType) {
      filters.push(sql`email_webhook_inventory.provider_event_type = ${params.providerEventType}`);
    }

    if (params.providerMessageId) {
      filters.push(sql`email_webhook_inventory.provider_message_id = ${params.providerMessageId}`);
    }

    if (params.providerDeliveryId) {
      filters.push(
        sql`email_webhook_inventory.provider_delivery_id = ${params.providerDeliveryId}`
      );
    }

    if (params.providerEventId) {
      filters.push(sql`email_webhook_inventory.provider_event_id = ${params.providerEventId}`);
    }

    if (params.emailMessageId !== undefined) {
      filters.push(sql`email_webhook_inventory.email_message_id = ${params.emailMessageId}`);
    }

    if (params.dateFrom) {
      filters.push(sql`email_webhook_inventory.received_at >= ${params.dateFrom}::timestamptz`);
    }

    if (params.dateTo) {
      filters.push(sql`email_webhook_inventory.received_at <= ${params.dateTo}::timestamptz`);
    }

    const whereClause = filters.length > 0 ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
    const offset = (params.page - 1) * params.pageSize;
    const directProviderSql = sql`
      select
        ${emailProviderMessages.id} as id,
        ${emailProviderMessages.providerStatus} as provider_status,
        ${emailProviderMessages.normalizedStatus} as normalized_status
      from ${emailProviderMessages}
    `;
    const latestProviderSql = sql`
      select
        provider_rows.email_message_id,
        provider_rows.provider,
        provider_rows.id,
        provider_rows.provider_status,
        provider_rows.normalized_status
      from (
        select
          ${emailProviderMessages.id} as id,
          ${emailProviderMessages.emailMessageId} as email_message_id,
          ${emailProviderMessages.provider} as provider,
          ${emailProviderMessages.providerStatus} as provider_status,
          ${emailProviderMessages.normalizedStatus} as normalized_status,
          row_number() over (
            partition by ${emailProviderMessages.emailMessageId}, ${emailProviderMessages.provider}
            order by ${emailProviderMessages.attemptNumber} desc, ${emailProviderMessages.id} desc
          ) as row_number
        from ${emailProviderMessages}
      ) as provider_rows
      where provider_rows.row_number = 1
    `;

    const [itemsResult, totalRows] = await Promise.all([
      this.db.execute(sql`
        with latest_provider as (${latestProviderSql}),
        direct_provider as (${directProviderSql}),
        email_webhook_inventory as (
          select
            ${emailWebhookEvents.id} as id,
            ${emailWebhookEvents.provider} as provider,
            ${emailWebhookEvents.providerEventType} as provider_event_type,
            ${emailWebhookEvents.normalizedEventType} as normalized_event_type,
            ${emailWebhookEvents.processingStatus} as processing_status,
            ${emailWebhookEvents.verificationStatus} as verification_status,
            ${emailWebhookEvents.providerMessageId} as provider_message_id,
            ${emailWebhookEvents.providerDeliveryId} as provider_delivery_id,
            ${emailWebhookEvents.providerEventId} as provider_event_id,
            ${emailWebhookEvents.organizationId} as organization_id,
            coalesce(${organizations.displayName}, ${organizations.name}) as organization_name,
            ${emailWebhookEvents.emailMessageId} as email_message_id,
            ${emailWebhookEvents.emailProviderMessageId} as email_provider_message_id,
            ${emailMessages.status} as message_status,
            coalesce(direct_provider.provider_status, latest_provider.provider_status) as latest_provider_status,
            coalesce(direct_provider.normalized_status, latest_provider.normalized_status) as latest_normalized_provider_status,
            ${emailMessages.referenceType} as reference_type,
            ${emailMessages.referenceId} as reference_id,
            ${emailWebhookEvents.attemptCount} as attempt_count,
            ${emailWebhookEvents.processingError} as processing_error,
            ${emailWebhookEvents.occurredAt} as occurred_at,
            ${emailWebhookEvents.receivedAt} as received_at,
            ${emailWebhookEvents.processedAt} as processed_at
          from ${emailWebhookEvents}
          left join ${organizations}
            on ${organizations.id} = ${emailWebhookEvents.organizationId}
          left join ${emailMessages}
            on ${emailMessages.id} = ${emailWebhookEvents.emailMessageId}
          left join direct_provider
            on direct_provider.id = ${emailWebhookEvents.emailProviderMessageId}
          left join latest_provider
            on latest_provider.email_message_id = ${emailWebhookEvents.emailMessageId}
           and latest_provider.provider = ${emailWebhookEvents.provider}
        )
        select *
        from email_webhook_inventory
        ${whereClause}
        order by email_webhook_inventory.received_at desc, email_webhook_inventory.id desc
        limit ${params.pageSize}
        offset ${offset}
      `),
      this.db.execute(sql`
        with latest_provider as (${latestProviderSql}),
        direct_provider as (${directProviderSql}),
        email_webhook_inventory as (
          select
            ${emailWebhookEvents.id} as id,
            ${emailWebhookEvents.provider} as provider,
            ${emailWebhookEvents.providerEventType} as provider_event_type,
            ${emailWebhookEvents.normalizedEventType} as normalized_event_type,
            ${emailWebhookEvents.processingStatus} as processing_status,
            ${emailWebhookEvents.verificationStatus} as verification_status,
            ${emailWebhookEvents.providerMessageId} as provider_message_id,
            ${emailWebhookEvents.providerDeliveryId} as provider_delivery_id,
            ${emailWebhookEvents.providerEventId} as provider_event_id,
            ${emailWebhookEvents.organizationId} as organization_id,
            coalesce(${organizations.displayName}, ${organizations.name}) as organization_name,
            ${emailWebhookEvents.emailMessageId} as email_message_id,
            ${emailWebhookEvents.emailProviderMessageId} as email_provider_message_id,
            ${emailMessages.status} as message_status,
            coalesce(direct_provider.provider_status, latest_provider.provider_status) as latest_provider_status,
            coalesce(direct_provider.normalized_status, latest_provider.normalized_status) as latest_normalized_provider_status,
            ${emailMessages.referenceType} as reference_type,
            ${emailMessages.referenceId} as reference_id,
            ${emailWebhookEvents.attemptCount} as attempt_count,
            ${emailWebhookEvents.processingError} as processing_error,
            ${emailWebhookEvents.occurredAt} as occurred_at,
            ${emailWebhookEvents.receivedAt} as received_at,
            ${emailWebhookEvents.processedAt} as processed_at
          from ${emailWebhookEvents}
          left join ${organizations}
            on ${organizations.id} = ${emailWebhookEvents.organizationId}
          left join ${emailMessages}
            on ${emailMessages.id} = ${emailWebhookEvents.emailMessageId}
          left join direct_provider
            on direct_provider.id = ${emailWebhookEvents.emailProviderMessageId}
          left join latest_provider
            on latest_provider.email_message_id = ${emailWebhookEvents.emailMessageId}
           and latest_provider.provider = ${emailWebhookEvents.provider}
        )
        select count(*)::int as total
        from email_webhook_inventory
        ${whereClause}
      `)
    ]);

    return {
      items: itemsResult.rows as EmailWebhookOperationalOverviewRow[],
      total: Number((totalRows.rows[0] as { total?: number | string } | undefined)?.total ?? 0)
    };
  }
}

export type EmailWebhookOperationalOverviewRow = {
  id: number;
  provider: string;
  provider_event_type: string;
  normalized_event_type: string;
  processing_status: EmailWebhookProcessingStatus;
  verification_status: EmailWebhookVerificationStatus;
  provider_message_id: string | null;
  provider_delivery_id: string | null;
  provider_event_id: string | null;
  organization_id: number | null;
  organization_name: string | null;
  email_message_id: number | null;
  email_provider_message_id: number | null;
  message_status: string | null;
  latest_provider_status: string | null;
  latest_normalized_provider_status: string | null;
  reference_type: string | null;
  reference_id: string | null;
  attempt_count: number;
  processing_error: string | null;
  occurred_at: Date | string | null;
  received_at: Date | string;
  processed_at: Date | string | null;
};
