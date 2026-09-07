import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const ISSUE_STATUS_ENUM = ['backlog', 'in_progress', 'blocked', 'done'] as const;
export type IssueStatus = (typeof ISSUE_STATUS_ENUM)[number];

export const ISSUE_PRIORITY_ENUM = ['urgent', 'high', 'medium', 'low'] as const;
export type IssuePriority = (typeof ISSUE_PRIORITY_ENUM)[number];

export const issues = pgTable(
  'issues',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        { onDelete: 'cascade' }
      ),
    projectId: integer('project_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./projects.schema').projects.id,
      { onDelete: 'cascade' }
    ),
    parentIssueId: integer('parent_issue_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./issues.schema').issues.id,
      { onDelete: 'set null' }
    ),
    issueNumber: integer('issue_number').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    descriptionMarkdown: text('description_markdown').notNull().default(''),
    status: varchar('status', { length: 24, enum: ISSUE_STATUS_ENUM }).notNull().default('backlog'),
    priority: varchar('priority', { length: 16, enum: ISSUE_PRIORITY_ENUM })
      .notNull()
      .default('medium'),
    position: integer('position').notNull().default(0),
    estimate: integer('estimate'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdBy: integer('created_by')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    updatedBy: integer('updated_by')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (table) => ({
    organizationIdx: index('issues_organization_idx').on(table.organizationId),
    organizationIdIdUniqueIdx: uniqueIndex('issues_org_id_uidx').on(table.organizationId, table.id),
    activeByOrganizationIdx: index('issues_active_org_idx').on(
      table.organizationId,
      table.deletedAt
    ),
    activeByScopeIdx: index('issues_active_scope_idx').on(
      table.organizationId,
      table.projectId,
      table.deletedAt
    ),
    statusPositionIdx: index('issues_scope_status_position_idx').on(
      table.organizationId,
      table.projectId,
      table.status,
      table.position
    ),
    updatedAtIdx: index('issues_updated_at_active_idx').on(
      table.organizationId,
      table.updatedAt,
      table.deletedAt
    ),
    parentIssueIdx: index('issues_parent_issue_idx').on(table.parentIssueId),
    issueNumberActiveUniqueIdx: uniqueIndex('issues_org_number_active_uidx')
      .on(table.organizationId, table.issueNumber)
      .where(sql`${table.deletedAt} is null`),
    titleNotBlankChk: check('issues_title_not_blank_chk', sql`btrim(${table.title}) <> ''`),
    descriptionNotNullChk: check(
      'issues_description_not_null_chk',
      sql`${table.descriptionMarkdown} is not null`
    ),
    positionNonNegativeChk: check('issues_position_non_negative_chk', sql`${table.position} >= 0`),
    estimateNonNegativeChk: check(
      'issues_estimate_non_negative_chk',
      sql`${table.estimate} is null or ${table.estimate} >= 0`
    ),
    parentIssueNotSelfChk: check(
      'issues_parent_issue_not_self_chk',
      sql`${table.parentIssueId} is null or ${table.parentIssueId} <> ${table.id}`
    ),
    resolvedAtStatusChk: check(
      'issues_resolved_at_status_chk',
      sql`${table.resolvedAt} is null or ${table.status} = 'done'`
    )
  })
);

export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
