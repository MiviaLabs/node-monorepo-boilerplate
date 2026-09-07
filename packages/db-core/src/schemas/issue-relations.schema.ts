import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const ISSUE_RELATION_TYPE_ENUM = [
  'blocks',
  'blocked_by',
  'related',
  'duplicate_of'
] as const;
export type IssueRelationType = (typeof ISSUE_RELATION_TYPE_ENUM)[number];

export const issueRelations = pgTable(
  'issue_relations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        { onDelete: 'cascade' }
      ),
    sourceIssueId: integer('source_issue_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./issues.schema').issues.id,
        { onDelete: 'cascade' }
      ),
    targetIssueId: integer('target_issue_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./issues.schema').issues.id,
        { onDelete: 'cascade' }
      ),
    relationType: varchar('relation_type', {
      length: 24,
      enum: ISSUE_RELATION_TYPE_ENUM
    }).notNull(),
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
    sourceIssueIdx: index('issue_relations_source_issue_idx').on(table.sourceIssueId),
    targetIssueIdx: index('issue_relations_target_issue_idx').on(table.targetIssueId),
    organizationTypeIdx: index('issue_relations_org_type_idx').on(
      table.organizationId,
      table.relationType
    ),
    sourceIssueOrgFk: foreignKey({
      name: 'issue_relations_source_issue_org_fk',
      columns: [table.organizationId, table.sourceIssueId],
      foreignColumns: [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issues.schema').issues.organizationId,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issues.schema').issues.id
      ]
    }).onDelete('cascade'),
    targetIssueOrgFk: foreignKey({
      name: 'issue_relations_target_issue_org_fk',
      columns: [table.organizationId, table.targetIssueId],
      foreignColumns: [
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issues.schema').issues.organizationId,
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./issues.schema').issues.id
      ]
    }).onDelete('cascade'),
    relationUniqueIdx: uniqueIndex('issue_relations_source_target_type_uidx').on(
      table.sourceIssueId,
      table.targetIssueId,
      table.relationType
    ),
    sourceTargetNotSelfChk: check(
      'issue_relations_source_target_not_self_chk',
      sql`${table.sourceIssueId} <> ${table.targetIssueId}`
    )
  })
);

export type IssueRelation = typeof issueRelations.$inferSelect;
export type NewIssueRelation = typeof issueRelations.$inferInsert;
