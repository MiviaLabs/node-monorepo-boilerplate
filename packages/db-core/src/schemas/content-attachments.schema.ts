import {
  check,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const contentAttachments = pgTable(
  'content_attachments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        { onDelete: 'cascade' }
      ),
    contentEntryId: integer('content_entry_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./content-entries.schema').contentEntries.id,
        { onDelete: 'cascade' }
      ),
    fileId: integer('file_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./files.schema').files.id,
        { onDelete: 'restrict' }
      ),
    attachedByUserId: integer('attached_by_user_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (table) => ({
    contentEntryCreatedIdx: index('content_attachments_entry_created_idx').on(
      table.contentEntryId,
      table.createdAt
    ),
    organizationActiveIdx: index('content_attachments_org_active_idx').on(
      table.organizationId,
      table.deletedAt
    ),
    fileActiveIdx: index('content_attachments_file_active_idx').on(
      table.organizationId,
      table.fileId,
      table.deletedAt
    ),
    activeEntryFileUniqueIdx: uniqueIndex('content_attachments_entry_file_active_uidx')
      .on(table.organizationId, table.contentEntryId, table.fileId)
      .where(sql`${table.deletedAt} is null`),
    attachedByPositiveChk: check(
      'content_attachments_attached_by_positive_chk',
      sql`${table.attachedByUserId} > 0`
    )
  })
);

export type ContentAttachment = typeof contentAttachments.$inferSelect;
export type NewContentAttachment = typeof contentAttachments.$inferInsert;
