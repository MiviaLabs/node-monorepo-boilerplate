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

export const PROJECT_VISIBILITY_ENUM = ['public', 'private'] as const;

export type ProjectVisibility = (typeof PROJECT_VISIBILITY_ENUM)[number];

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        { onDelete: 'cascade' }
      ),
    createdBy: integer('created_by')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    key: varchar('key', { length: 8 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    visibility: varchar('visibility', { length: 16, enum: PROJECT_VISIBILITY_ENUM })
      .notNull()
      .default('public'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (table) => ({
    organizationIdx: index('projects_organization_idx').on(table.organizationId),
    activeByOrganizationIdx: index('projects_active_organization_idx').on(
      table.organizationId,
      table.deletedAt
    ),
    activeKeyUniqueIdx: uniqueIndex('projects_org_key_active_uidx')
      .on(table.organizationId, table.key)
      .where(sql`${table.deletedAt} is null`),
    visibilityByOrganizationIdx: index('projects_visibility_organization_idx').on(
      table.organizationId,
      table.visibility,
      table.deletedAt
    ),
    creatorByOrganizationIdx: index('projects_creator_organization_idx').on(
      table.organizationId,
      table.createdBy,
      table.deletedAt
    ),
    keyNotBlankChk: check('projects_key_not_blank_chk', sql`btrim(${table.key}) <> ''`)
  })
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
