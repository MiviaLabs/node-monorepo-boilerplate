import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';
import { users } from './users.schema';

export type UserOrganizationSettingValue =
  | boolean
  | number
  | string
  | null
  | unknown[]
  | Record<string, unknown>;

export const userOrganizationSettings = pgTable(
  'user_organization_settings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    settingKey: varchar('setting_key', { length: 120 }).notNull(),
    valueJson: jsonb('value_json').$type<UserOrganizationSettingValue>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('user_org_settings_user_org_key_unique_idx').on(
      table.userId,
      table.organizationId,
      table.settingKey
    ),
    index('user_org_settings_org_user_idx').on(table.organizationId, table.userId),
    index('user_org_settings_user_key_idx').on(table.userId, table.settingKey)
  ]
);

export type UserOrganizationSetting = typeof userOrganizationSettings.$inferSelect;
export type NewUserOrganizationSetting = typeof userOrganizationSettings.$inferInsert;
