import { index, integer, jsonb, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

export interface IIssueActivityMetadata {
  [key: string]: unknown;
}

export const ISSUE_ACTIVITY_TYPE_ENUM = [
  'issue.created',
  'issue.updated',
  'issue.status_changed',
  'issue.priority_changed',
  'issue.assigned',
  'issue.unassigned',
  'issue.watcher_added',
  'issue.watcher_removed',
  'issue.comment_added',
  'issue.label_added',
  'issue.label_removed',
  'issue.relation_added',
  'issue.relation_removed',
  'issue.attachment_added',
  'issue.attachment_removed'
] as const;
export type IssueActivityType = (typeof ISSUE_ACTIVITY_TYPE_ENUM)[number];

export const issueActivity = pgTable(
  'issue_activity',
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
    actorUserId: integer('actor_user_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./users.schema').users.id,
      { onDelete: 'set null' }
    ),
    activityType: varchar('activity_type', {
      length: 48,
      enum: ISSUE_ACTIVITY_TYPE_ENUM
    }).notNull(),
    metadataJson: jsonb('metadata_json').$type<IIssueActivityMetadata>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    issueCreatedIdx: index('issue_activity_issue_created_idx').on(table.issueId, table.createdAt),
    organizationCreatedIdx: index('issue_activity_org_created_idx').on(
      table.organizationId,
      table.createdAt
    )
  })
);

export type IssueActivity = typeof issueActivity.$inferSelect;
export type NewIssueActivity = typeof issueActivity.$inferInsert;
