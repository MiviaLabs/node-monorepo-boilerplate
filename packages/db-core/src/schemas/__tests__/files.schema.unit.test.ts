import { describe, expect, it } from '@jest/globals';
import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  FILE_STATUS_ENUM,
  FILE_VISIBILITY_ENUM,
  FILE_PURPOSE_ENUM,
  files,
  type File,
  type FilePurpose,
  type FileStatus,
  type FileVisibility,
  type NewFile
} from '../index';

describe('files.schema', () => {
  it('should expose the files table and lifecycle enums from the schema barrel', () => {
    expect(typeof files).toBe('object');
    expect(FILE_STATUS_ENUM).toEqual([
      'pending_upload',
      'ready',
      'pending_delete',
      'deleted',
      'upload_failed'
    ]);
    expect(FILE_VISIBILITY_ENUM).toEqual(['private', 'tenant_public', 'public']);
    expect(FILE_PURPOSE_ENUM).toEqual(['user_avatar', 'issue_attachment', 'content_upload']);
  });

  it('should define the expected files columns', () => {
    const columns = Object.keys(files);

    expect(columns.includes('organizationId')).toBe(true);
    expect(columns.includes('uploadedByUserId')).toBe(true);
    expect(columns.includes('storageInstance')).toBe(true);
    expect(columns.includes('bucket')).toBe(true);
    expect(columns.includes('objectKey')).toBe(true);
    expect(columns.includes('originalFilename')).toBe(true);
    expect(columns.includes('mimeType')).toBe(true);
    expect(columns.includes('byteSize')).toBe(true);
    expect(columns.includes('checksumSha256')).toBe(true);
    expect(columns.includes('etag')).toBe(true);
    expect(columns.includes('status')).toBe(true);
    expect(columns.includes('visibility')).toBe(true);
    expect(columns.includes('purpose')).toBe(true);
    expect(columns.includes('metadata')).toBe(true);
    expect(columns.includes('uploadedAt')).toBe(true);
    expect(columns.includes('lastAccessedAt')).toBe(true);
    expect(columns.includes('deletedAt')).toBe(true);
    expect(columns.includes('purgedAt')).toBe(true);
  });

  it('should expose inferred row types from the schema barrel', () => {
    const status: FileStatus = 'ready';
    const visibility: FileVisibility = 'private';
    const purpose: FilePurpose = 'issue_attachment';
    const row = {
      id: 1,
      organizationId: 10,
      uploadedByUserId: 20,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/10/issues/55/1/spec.pdf',
      originalFilename: 'spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 128,
      checksumSha256: null,
      etag: null,
      status,
      visibility,
      purpose,
      metadata: {},
      uploadedAt: null,
      lastAccessedAt: null,
      deletedAt: null,
      purgedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies File;
    const insert = {
      organizationId: 10,
      uploadedByUserId: 20,
      storageInstance: 'uploads',
      bucket: 'app-uploads',
      objectKey: 'org/10/issues/unbound/1/spec.pdf',
      originalFilename: 'spec.pdf',
      byteSize: 128,
      purpose: 'issue_attachment'
    } satisfies NewFile;

    expect(row.status).toBe('ready');
    expect(insert.purpose).toBe('issue_attachment');
  });

  it('should define the expected files indexes and foreign keys', () => {
    const config = getTableConfig(files);

    expect(
      config.indexes.some(
        (tableIndex) =>
          tableIndex.config.name === 'files_org_storage_bucket_key_active_uidx' &&
          tableIndex.config.unique === true
      )
    ).toBe(true);
    expect(
      config.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'files_organization_id_organizations_id_fk'
      )
    ).toBe(true);
    expect(
      config.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'files_uploaded_by_user_id_users_id_fk'
      )
    ).toBe(true);
  });
});
