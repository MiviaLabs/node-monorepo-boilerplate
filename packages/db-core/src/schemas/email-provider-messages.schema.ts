import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export interface IEmailProviderMessagePayload {
  response?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface IEmailProviderMessageTags {
  [key: string]: string;
}

export interface IEmailProviderMessageMetadata {
  [key: string]: unknown;
}

export const emailProviderMessages = pgTable(
  'email_provider_messages',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        { onDelete: 'cascade' }
      ),
    emailMessageId: integer('email_message_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./email-messages.schema').emailMessages.id,
        { onDelete: 'cascade' }
      ),
    provider: varchar('provider', { length: 64 }).notNull(),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    providerDeliveryId: varchar('provider_delivery_id', { length: 255 }),
    providerEventId: varchar('provider_event_id', { length: 255 }),
    attemptNumber: integer('attempt_number').notNull().default(1),
    providerStatus: varchar('provider_status', { length: 64 }),
    normalizedStatus: varchar('normalized_status', { length: 64 }),
    payload: jsonb('payload').$type<IEmailProviderMessagePayload>(),
    tagsJson: jsonb('tags_json').$type<IEmailProviderMessageTags>(),
    metadataJson: jsonb('metadata_json').$type<IEmailProviderMessageMetadata>(),
    requestId: varchar('request_id', { length: 255 }),
    correlationId: varchar('correlation_id', { length: 255 }),
    causationId: varchar('causation_id', { length: 255 }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    lastWebhookOccurredAt: timestamp('last_webhook_occurred_at', { withTimezone: true }),
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    providerMessageUniqueIdx: uniqueIndex('email_provider_messages_provider_message_unique_idx')
      .on(table.provider, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    messageAttemptUniqueIdx: uniqueIndex('email_provider_messages_message_attempt_unique_idx').on(
      table.emailMessageId,
      table.attemptNumber
    ),
    messageIdx: index('email_provider_messages_message_idx').on(table.emailMessageId),
    organizationProviderIdx: index('email_provider_messages_org_provider_idx').on(
      table.organizationId,
      table.provider
    ),
    providerDeliveryIdx: index('email_provider_messages_provider_delivery_idx').on(
      table.provider,
      table.providerDeliveryId
    ),
    providerEventIdx: index('email_provider_messages_provider_event_idx').on(
      table.provider,
      table.providerEventId
    ),
    requestIdx: index('email_provider_messages_request_idx').on(table.requestId),
    correlationIdx: index('email_provider_messages_correlation_idx').on(table.correlationId)
  })
);

export type EmailProviderMessage = typeof emailProviderMessages.$inferSelect;
export type NewEmailProviderMessage = typeof emailProviderMessages.$inferInsert;
