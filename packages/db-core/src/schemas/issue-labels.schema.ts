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

export const issueLabels = pgTable(
  'issue_labels',
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
    name: varchar('name', { length: 120 }).notNull(),
    color: varchar('color', { length: 24 }),
    description: text('description'),
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
    organizationActiveIdx: index('issue_labels_org_active_idx').on(
      table.organizationId,
      table.deletedAt
    ),
    scopeActiveIdx: index('issue_labels_scope_active_idx').on(
      table.organizationId,
      table.projectId,
      table.deletedAt
    ),
    orgNameActiveUniqueIdx: uniqueIndex('issue_labels_org_name_active_uidx')
      .on(table.organizationId, sql`lower(${table.name})`)
      .where(sql`${table.projectId} is null and ${table.deletedAt} is null`),
    scopedNameActiveUniqueIdx: uniqueIndex('issue_labels_scope_name_active_uidx')
      .on(table.organizationId, table.projectId, sql`lower(${table.name})`)
      .where(sql`${table.projectId} is not null and ${table.deletedAt} is null`),
    organizationIdIdUniqueIdx: uniqueIndex('issue_labels_org_id_uidx').on(
      table.organizationId,
      table.id
    ),
    nameNotBlankChk: check('issue_labels_name_not_blank_chk', sql`btrim(${table.name}) <> ''`)
  })
);

export type IssueLabel = typeof issueLabels.$inferSelect;
export type NewIssueLabel = typeof issueLabels.$inferInsert;
