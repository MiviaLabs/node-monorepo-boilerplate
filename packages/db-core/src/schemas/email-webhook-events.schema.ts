import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';

export const EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM = [
  'received',
  'duplicate',
  'persisted',
  'unmatched',
  'applied',
  'failed'
] as const;

export type EmailWebhookProcessingStatus = (typeof EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM)[number];

export const EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM = ['verified', 'rejected'] as const;
export type EmailWebhookVerificationStatus =
  (typeof EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM)[number];

export interface IEmailWebhookHeaders {
  [key: string]: string | string[] | undefined;
}

export interface IEmailWebhookPayload {
  [key: string]: unknown;
}

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  }
});

export const emailWebhookEvents = pgTable(
  'email_webhook_events',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./organizations.schema').organizations.id,
      { onDelete: 'set null' }
    ),
    emailMessageId: integer('email_message_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./email-messages.schema').emailMessages.id,
      { onDelete: 'set null' }
    ),
    emailProviderMessageId: integer('email_provider_message_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./email-provider-messages.schema').emailProviderMessages.id,
      { onDelete: 'set null' }
    ),
    provider: varchar('provider', { length: 64 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 255 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 255 }),
    providerDeliveryId: varchar('provider_delivery_id', { length: 255 }),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    providerEventType: varchar('provider_event_type', { length: 120 }).notNull(),
    normalizedEventType: varchar('normalized_event_type', { length: 64 }).notNull(),
    verificationStatus: varchar('verification_status', {
      length: 32,
      enum: EMAIL_WEBHOOK_VERIFICATION_STATUS_ENUM
    })
      .notNull()
      .default('verified'),
    processingStatus: varchar('processing_status', {
      length: 32,
      enum: EMAIL_WEBHOOK_PROCESSING_STATUS_ENUM
    })
      .notNull()
      .default('received'),
    attemptCount: integer('attempt_count').notNull().default(1),
    rawHeadersJson: jsonb('raw_headers_json').$type<IEmailWebhookHeaders>(),
    tagsJson: jsonb('tags_json').$type<Record<string, string>>(),
    safeMetadataJson: jsonb('safe_metadata_json').$type<Record<string, unknown>>(),
    rawBody: bytea('raw_body').notNull(),
    rawPayloadJson: jsonb('raw_payload_json').$type<IEmailWebhookPayload>(),
    contentType: varchar('content_type', { length: 255 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingError: varchar('processing_error', { length: 512 }),
    requestId: varchar('request_id', { length: 255 }),
    correlationId: varchar('correlation_id', { length: 255 }),
    causationId: varchar('causation_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    dedupeKeyUniqueIdx: uniqueIndex('email_webhook_events_dedupe_key_unique_idx').on(
      table.dedupeKey
    ),
    providerDeliveryIdx: index('email_webhook_events_provider_delivery_idx').on(
      table.provider,
      table.providerDeliveryId
    ),
    providerEventIdx: index('email_webhook_events_provider_event_idx').on(
      table.provider,
      table.providerEventId
    ),
    providerMessageIdx: index('email_webhook_events_provider_message_idx').on(
      table.provider,
      table.providerMessageId
    ),
    processingStatusReceivedIdx: index('email_webhook_events_processing_status_received_idx').on(
      table.processingStatus,
      table.receivedAt
    ),
    organizationEventReceivedIdx: index('email_webhook_events_org_event_received_idx').on(
      table.organizationId,
      table.normalizedEventType,
      table.receivedAt
    )
  })
);

export type EmailWebhookEvent = typeof emailWebhookEvents.$inferSelect;
export type NewEmailWebhookEvent = typeof emailWebhookEvents.$inferInsert;
