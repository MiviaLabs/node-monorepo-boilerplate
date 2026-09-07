import { index, integer, pgTable, serial, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const issueWatchers = pgTable(
  'issue_watchers',
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
    addedByUserId: integer('added_by_user_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./users.schema').users.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    issueIdx: index('issue_watchers_issue_idx').on(table.issueId),
    userIdx: index('issue_watchers_user_idx').on(table.userId),
    issueUserUniqueIdx: uniqueIndex('issue_watchers_issue_user_uidx').on(
      table.issueId,
      table.userId
    )
  })
);

export type IssueWatcher = typeof issueWatchers.$inferSelect;
export type NewIssueWatcher = typeof issueWatchers.$inferInsert;
