import { describe, expect, it } from '@jest/globals';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { contentAttachments, type ContentAttachment, type NewContentAttachment } from '../index';

describe('contentAttachments.schema', () => {
  it('should expose the content attachments table from the schema barrel', () => {
    expect(typeof contentAttachments).toBe('object');
    expect(contentAttachments).not.toBeNull();
  });

  it('should export inferred row types from the schema barrel', () => {
    const row = {
      id: 1,
      organizationId: 12,
      contentEntryId: 44,
      fileId: 101,
      attachedByUserId: 9,
      createdAt: new Date(),
      deletedAt: null
    } satisfies ContentAttachment;

    const insert = {
      organizationId: 12,
      contentEntryId: 44,
      fileId: 101,
      attachedByUserId: 9
    } satisfies NewContentAttachment;

    expect(row.fileId).toBe(101);
    expect(insert.contentEntryId).toBe(44);
  });

  it('should define the expected indexes and foreign keys', () => {
    const config = getTableConfig(contentAttachments);

    expect(
      config.indexes.some(
        (tableIndex) => tableIndex.config.name === 'content_attachments_entry_file_active_uidx'
      )
    ).toBe(true);
    expect(
      config.foreignKeys.some(
        (foreignKey) =>
          foreignKey.getName() === 'content_attachments_content_entry_id_content_entries_id_fk'
      )
    ).toBe(true);
    expect(
      config.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'content_attachments_file_id_files_id_fk'
      )
    ).toBe(true);
    expect(
      config.foreignKeys.some(
        (foreignKey) =>
          foreignKey.getName() === 'content_attachments_attached_by_user_id_users_id_fk'
      )
    ).toBe(true);
  });
});
