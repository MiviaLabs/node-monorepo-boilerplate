import { check, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const contentComments = pgTable(
  'content_comments',
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
    authorUserId: integer('author_user_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    bodyMarkdown: text('body_markdown').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (table) => ({
    entryCreatedIdx: index('content_comments_entry_created_idx').on(
      table.contentEntryId,
      table.createdAt
    ),
    organizationActiveIdx: index('content_comments_org_active_idx').on(
      table.organizationId,
      table.deletedAt
    ),
    entryActiveIdx: index('content_comments_entry_active_idx').on(
      table.organizationId,
      table.contentEntryId,
      table.deletedAt
    ),
    bodyNotBlankChk: check(
      'content_comments_body_not_blank_chk',
      sql`btrim(${table.bodyMarkdown}) <> ''`
    )
  })
);

export type ContentComment = typeof contentComments.$inferSelect;
export type NewContentComment = typeof contentComments.$inferInsert;
