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

export const contentEntries = pgTable(
  'content_entries',
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
    parentId: integer('parent_id').references(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('./content-entries.schema').contentEntries.id,
      { onDelete: 'set null' }
    ),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    contentMarkdown: text('content_markdown').notNull(),
    position: integer('position').notNull().default(0),
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
    organizationIdx: index('content_entries_organization_idx').on(table.organizationId),
    organizationProjectIdx: index('content_entries_org_project_idx').on(
      table.organizationId,
      table.projectId
    ),
    parentIdx: index('content_entries_parent_idx').on(table.parentId),
    activeByOrganizationIdx: index('content_entries_active_org_idx').on(
      table.organizationId,
      table.deletedAt
    ),
    activeByProjectScopeIdx: index('content_entries_active_scope_idx').on(
      table.organizationId,
      table.projectId,
      table.deletedAt
    ),
    siblingPositionIdx: index('content_entries_sibling_position_idx').on(
      table.organizationId,
      table.projectId,
      table.parentId,
      table.position
    ),
    activeSiblingPositionUniqueIdx: uniqueIndex('content_entries_active_sibling_position_uidx')
      .on(
        table.organizationId,
        sql`coalesce(${table.projectId}, 0)`,
        sql`coalesce(${table.parentId}, 0)`,
        table.position
      )
      .where(sql`${table.deletedAt} is null`),
    orgOnlySlugUniqueIdx: uniqueIndex('content_entries_org_slug_active_uidx')
      .on(table.organizationId, table.slug)
      .where(sql`${table.projectId} is null and ${table.deletedAt} is null`),
    projectSlugUniqueIdx: uniqueIndex('content_entries_project_slug_active_uidx')
      .on(table.organizationId, table.projectId, table.slug)
      .where(sql`${table.projectId} is not null and ${table.deletedAt} is null`),
    titleNotBlankChk: check(
      'content_entries_title_not_blank_chk',
      sql`btrim(${table.title}) <> ''`
    ),
    slugNotBlankChk: check('content_entries_slug_not_blank_chk', sql`btrim(${table.slug}) <> ''`),
    positionNonNegativeChk: check(
      'content_entries_position_non_negative_chk',
      sql`${table.position} >= 0`
    ),
    parentNotSelfChk: check(
      'content_entries_parent_not_self_chk',
      sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`
    )
  })
);

export type ContentEntry = typeof contentEntries.$inferSelect;
export type NewContentEntry = typeof contentEntries.$inferInsert;
