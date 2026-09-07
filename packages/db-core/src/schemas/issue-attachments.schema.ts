import { check, index, integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const issueAttachments = pgTable(
  'issue_attachments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        { onDelete: 'cascade' }
      ),
    issueId: integer('issue_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./issues.schema').issues.id,
        { onDelete: 'cascade' }
      ),
    uploadedByUserId: integer('uploaded_by_user_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    fileId: integer('file_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./files.schema').files.id,
      { onDelete: 'set null' }
    ),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 255 }),
    byteSize: integer('byte_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (table) => ({
    issueCreatedIdx: index('issue_attachments_issue_created_idx').on(
      table.issueId,
      table.createdAt
    ),
    fileActiveIdx: index('issue_attachments_file_active_idx').on(
      table.organizationId,
      table.fileId,
      table.deletedAt
    ),
    organizationActiveIdx: index('issue_attachments_org_active_idx').on(
      table.organizationId,
      table.deletedAt
    ),
    storageKeyActiveUniqueIdx: index('issue_attachments_storage_key_active_idx').on(
      table.organizationId,
      table.storageKey,
      table.deletedAt
    ),
    storageKeyNotBlankChk: check(
      'issue_attachments_storage_key_not_blank_chk',
      sql`btrim(${table.storageKey}) <> ''`
    ),
    originalFilenameNotBlankChk: check(
      'issue_attachments_original_filename_not_blank_chk',
      sql`btrim(${table.originalFilename}) <> ''`
    ),
    byteSizeNonNegativeChk: check(
      'issue_attachments_byte_size_non_negative_chk',
      sql`${table.byteSize} >= 0`
    )
  })
);

export type IssueAttachment = typeof issueAttachments.$inferSelect;
export type NewIssueAttachment = typeof issueAttachments.$inferInsert;
