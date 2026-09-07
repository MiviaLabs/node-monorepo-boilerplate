import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const issueComments = pgTable(
  'issue_comments',
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
    authorUserId: integer('author_user_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    parentCommentId: integer('parent_comment_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./issue-comments.schema').issueComments.id,
      { onDelete: 'set null' }
    ),
    bodyMarkdown: text('body_markdown').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (table) => ({
    issueCreatedIdx: index('issue_comments_issue_created_idx').on(table.issueId, table.createdAt),
    organizationActiveIdx: index('issue_comments_org_active_idx').on(
      table.organizationId,
      table.deletedAt
    ),
    parentCommentIdx: index('issue_comments_parent_idx').on(table.parentCommentId),
    issueIdIdUniqueIdx: uniqueIndex('issue_comments_issue_id_id_uidx').on(table.issueId, table.id),
    issueOrgFk: foreignKey({
      name: 'issue_comments_issue_org_fk',
      columns: [table.organizationId, table.issueId],
      foreignColumns: [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issues.schema').issues.organizationId,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issues.schema').issues.id
      ]
    }).onDelete('cascade'),
    bodyNotBlankChk: check(
      'issue_comments_body_not_blank_chk',
      sql`btrim(${table.bodyMarkdown}) <> ''`
    ),
    parentCommentNotSelfChk: check(
      'issue_comments_parent_not_self_chk',
      sql`${table.parentCommentId} is null or ${table.parentCommentId} <> ${table.id}`
    )
  })
);

export type IssueComment = typeof issueComments.$inferSelect;
export type NewIssueComment = typeof issueComments.$inferInsert;
