import {
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

export const issueLabelAssignments = pgTable(
  'issue_label_assignments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').references(
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
    labelId: integer('label_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./issue-labels.schema').issueLabels.id,
        { onDelete: 'cascade' }
      ),
    createdBy: integer('created_by')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    organizationIdx: index('issue_label_assignments_org_idx').on(table.organizationId),
    issueIdx: index('issue_label_assignments_issue_idx').on(table.issueId),
    labelIdx: index('issue_label_assignments_label_idx').on(table.labelId),
    issueOrgFk: foreignKey({
      name: 'issue_label_assignments_issue_org_fk',
      columns: [table.organizationId, table.issueId],
      foreignColumns: [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issues.schema').issues.organizationId,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issues.schema').issues.id
      ]
    }).onDelete('cascade'),
    labelOrgFk: foreignKey({
      name: 'issue_label_assignments_label_org_fk',
      columns: [table.organizationId, table.labelId],
      foreignColumns: [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issue-labels.schema').issueLabels.organizationId,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issue-labels.schema').issueLabels.id
      ]
    }).onDelete('cascade'),
    issueLabelUniqueIdx: uniqueIndex('issue_label_assignments_issue_label_uidx').on(
      table.issueId,
      table.labelId
    )
  })
);

export type IssueLabelAssignment = typeof issueLabelAssignments.$inferSelect;
export type NewIssueLabelAssignment = typeof issueLabelAssignments.$inferInsert;
