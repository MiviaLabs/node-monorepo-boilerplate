import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';

export const FILE_STATUS_ENUM = [
  'pending_upload',
  'ready',
  'pending_delete',
  'deleted',
  'upload_failed'
] as const;
export type FileStatus = (typeof FILE_STATUS_ENUM)[number];

export const FILE_VISIBILITY_ENUM = ['private', 'tenant_public', 'public'] as const;
export type FileVisibility = (typeof FILE_VISIBILITY_ENUM)[number];

export const FILE_PURPOSE_ENUM = ['user_avatar', 'issue_attachment', 'content_upload'] as const;
export type FilePurpose = (typeof FILE_PURPOSE_ENUM)[number];

export interface IFileMetadata {
  contentDispositionFilename?: string;
  source?: string;
  issueId?: number;
  projectId?: number | null;
  [key: string]: unknown;
}

export const files = pgTable(
  'files',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./organizations.schema').organizations.id,
        { onDelete: 'cascade' }
      ),
    uploadedByUserId: integer('uploaded_by_user_id')
      .notNull()
      .references(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        () => require('./users.schema').users.id,
        { onDelete: 'restrict' }
      ),
    storageInstance: varchar('storage_instance', { length: 64 }).notNull(),
    bucket: varchar('bucket', { length: 255 }).notNull(),
    objectKey: varchar('object_key', { length: 1024 }).notNull(),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 255 }),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    etag: varchar('etag', { length: 255 }),
    status: varchar('status', { length: 32, enum: FILE_STATUS_ENUM })
      .notNull()
      .default('pending_upload'),
    visibility: varchar('visibility', { length: 32, enum: FILE_VISIBILITY_ENUM })
      .notNull()
      .default('private'),
    purpose: varchar('purpose', { length: 64, enum: FILE_PURPOSE_ENUM }).notNull(),
    metadata: jsonb('metadata').$type<IFileMetadata>().notNull().default({}),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    organizationActiveIdx: index('files_org_active_idx').on(table.organizationId, table.deletedAt),
    organizationPurposeActiveIdx: index('files_org_purpose_active_idx').on(
      table.organizationId,
      table.purpose,
      table.deletedAt
    ),
    organizationStatusActiveIdx: index('files_org_status_active_idx').on(
      table.organizationId,
      table.status,
      table.deletedAt
    ),
    uploadedByCreatedAtIdx: index('files_uploaded_by_created_at_idx').on(
      table.uploadedByUserId,
      table.createdAt
    ),
    organizationStorageObjectActiveUniqueIdx: uniqueIndex(
      'files_org_storage_bucket_key_active_uidx'
    )
      .on(table.organizationId, table.storageInstance, table.bucket, table.objectKey)
      .where(sql`${table.deletedAt} is null`),
    storageInstanceNotBlankChk: check(
      'files_storage_instance_not_blank_chk',
      sql`btrim(${table.storageInstance}) <> ''`
    ),
    bucketNotBlankChk: check('files_bucket_not_blank_chk', sql`btrim(${table.bucket}) <> ''`),
    objectKeyNotBlankChk: check(
      'files_object_key_not_blank_chk',
      sql`btrim(${table.objectKey}) <> ''`
    ),
    originalFilenameNotBlankChk: check(
      'files_original_filename_not_blank_chk',
      sql`btrim(${table.originalFilename}) <> ''`
    ),
    byteSizeNonNegativeChk: check('files_byte_size_non_negative_chk', sql`${table.byteSize} >= 0`),
    checksumSha256FormatChk: check(
      'files_checksum_sha256_format_chk',
      sql`${table.checksumSha256} is null or ${table.checksumSha256} ~ '^[0-9a-f]{64}$'`
    ),
    deletedAtRequiresUploadStateChk: check(
      'files_deleted_at_requires_upload_state_chk',
      sql`${table.deletedAt} is null or ${table.uploadedAt} is not null or ${table.status} in ('upload_failed', 'pending_upload')`
    )
  })
);

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
