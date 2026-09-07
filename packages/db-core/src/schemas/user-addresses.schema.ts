import { boolean, index, integer, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations.schema';
import { users } from './users.schema';
import { encryptedStoreEntries } from './encrypted-store-entries.schema';

export const addressTypeEnum = ['primary', 'billing', 'shipping', 'office'] as const;
export type AddressType = (typeof addressTypeEnum)[number];

export const userAddresses = pgTable(
  'user_addresses',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addressType: varchar('address_type', { length: 50, enum: addressTypeEnum })
      .notNull()
      .default('primary'),
    label: varchar('label', { length: 100 }),
    streetEncryptedStoreId: integer('street_encrypted_store_id').references(() => encryptedStoreEntries.id, {
      onDelete: 'restrict'
    }),
    street2EncryptedStoreId: integer('street2_encrypted_store_id').references(() => encryptedStoreEntries.id, {
      onDelete: 'restrict'
    }),
    cityEncryptedStoreId: integer('city_encrypted_store_id').references(() => encryptedStoreEntries.id, {
      onDelete: 'restrict'
    }),
    stateEncryptedStoreId: integer('state_encrypted_store_id').references(() => encryptedStoreEntries.id, {
      onDelete: 'restrict'
    }),
    postalCodeEncryptedStoreId: integer('postal_code_encrypted_store_id').references(() => encryptedStoreEntries.id, {
      onDelete: 'restrict'
    }),
    countryEncryptedStoreId: integer('country_encrypted_store_id').references(() => encryptedStoreEntries.id, {
      onDelete: 'restrict'
    }),
    countryCode: varchar('country_code', { length: 2 }),
    isDefault: boolean('is_default').notNull().default(false),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at')
  },
  (table) => [
    index('user_addresses_tenant_user_type_idx').on(
      table.organizationId,
      table.userId,
      table.addressType,
      table.deletedAt
    ),
    index('user_addresses_default_idx').on(
      table.organizationId,
      table.userId,
      table.isDefault,
      table.deletedAt
    ),
    index('user_addresses_country_idx').on(
      table.organizationId,
      table.countryCode,
      table.deletedAt
    ),
    index('user_addresses_user_idx').on(table.organizationId, table.userId),
    index('user_addresses_street_encrypted_store_idx').on(table.streetEncryptedStoreId),
    index('user_addresses_street2_encrypted_store_idx').on(table.street2EncryptedStoreId),
    index('user_addresses_city_encrypted_store_idx').on(table.cityEncryptedStoreId),
    index('user_addresses_state_encrypted_store_idx').on(table.stateEncryptedStoreId),
    index('user_addresses_postal_code_encrypted_store_idx').on(table.postalCodeEncryptedStoreId),
    index('user_addresses_country_encrypted_store_idx').on(table.countryEncryptedStoreId)
  ]
);

export type UserAddress = typeof userAddresses.$inferSelect;
export type NewUserAddress = typeof userAddresses.$inferInsert;
export type UpdateUserAddress = Partial<
  Omit<NewUserAddress, 'id' | 'organizationId' | 'userId' | 'createdAt'>
>;
