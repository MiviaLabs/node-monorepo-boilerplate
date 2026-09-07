import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

export const EMAIL_MESSAGE_DIRECTION_ENUM = ['outbound', 'inbound'] as const;
export const EMAIL_MESSAGE_STATUS_ENUM = [
  'pending',
  'accepted',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'cancelled'
] as const;

export type EmailMessageDirection = (typeof EMAIL_MESSAGE_DIRECTION_ENUM)[number];
export type EmailMessageStatus = (typeof EMAIL_MESSAGE_STATUS_ENUM)[number];

export interface IEmailMessageMetadata {
  templateKey?: string;
  tags?: string[];
  headers?: Record<string, string>;
  providerHints?: Record<string, unknown>;
  [key: string]: unknown;
}

export const emailMessages = pgTable(
  'email_messages',
  {
    id: serial('id').primaryKey(),
    publicId: uuid('public_id').defaultRandom().notNull(),
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        { onDelete: 'cascade' }
      ),
    direction: varchar('direction', { length: 16, enum: EMAIL_MESSAGE_DIRECTION_ENUM })
      .notNull()
      .default('outbound'),
    status: varchar('status', { length: 32, enum: EMAIL_MESSAGE_STATUS_ENUM })
      .notNull()
      .default('pending'),
    referenceType: varchar('reference_type', { length: 100 }),
    referenceId: varchar('reference_id', { length: 255 }),
    subject: varchar('subject', { length: 998 }),
    toEmailHash: varchar('to_email_hash', { length: 64 }),
    fromEmailHash: varchar('from_email_hash', { length: 64 }),
    requestId: varchar('request_id', { length: 255 }),
    correlationId: varchar('correlation_id', { length: 255 }),
    causationId: varchar('causation_id', { length: 255 }),
    metadata: jsonb('metadata').$type<IEmailMessageMetadata>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    publicIdIdx: uniqueIndex('email_messages_public_id_unique_idx').on(table.publicId),
    organizationStatusIdx: index('email_messages_org_status_idx').on(
      table.organizationId,
      table.status
    ),
    referenceIdx: index('email_messages_reference_idx').on(
      table.organizationId,
      table.referenceType,
      table.referenceId
    ),
    requestIdx: index('email_messages_request_idx').on(table.requestId),
    correlationIdx: index('email_messages_correlation_idx').on(table.correlationId)
  })
);

export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;
