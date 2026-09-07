import { index, integer, pgTable, serial, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const issueAssignees = pgTable(
  'issue_assignees',
  {
    id: serial('id').primaryKey(),
    issueId: integer('issue_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./issues.schema').issues.id,
        { onDelete: 'cascade' }
      ),
    userId: integer('user_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'cascade' }
      ),
    assignedByUserId: integer('assigned_by_user_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./users.schema').users.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    issueIdx: index('issue_assignees_issue_idx').on(table.issueId),
    userIdx: index('issue_assignees_user_idx').on(table.userId),
    issueUserUniqueIdx: uniqueIndex('issue_assignees_issue_user_uidx').on(
      table.issueId,
      table.userId
    )
  })
);

export type IssueAssignee = typeof issueAssignees.$inferSelect;
export type NewIssueAssignee = typeof issueAssignees.$inferInsert;
