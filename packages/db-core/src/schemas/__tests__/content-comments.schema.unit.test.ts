import { describe, expect, it } from '@jest/globals';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { contentComments } from '../index';

import type { ContentComment, NewContentComment } from '../index';

describe('contentComments.schema', () => {
  it('should expose the content comments table from the schema barrel', () => {
    expect(typeof contentComments).toBe('object');
    expect(contentComments).not.toBeNull();
  });

  it('should export inferred row types from the schema barrel', () => {
    const row = {
      id: 1,
      organizationId: 12,
      contentEntryId: 44,
      authorUserId: 9,
      bodyMarkdown: 'First content comment',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    } satisfies ContentComment;

    const insert = {
      organizationId: 12,
      contentEntryId: 44,
      authorUserId: 9,
      bodyMarkdown: 'First content comment'
    } satisfies NewContentComment;

    expect(row.bodyMarkdown).toBe('First content comment');
    expect(insert.contentEntryId).toBe(44);
  });

  it('should define the expected indexes and foreign keys', () => {
    const config = getTableConfig(contentComments);

    expect(
      config.indexes.some(
        (tableIndex) => tableIndex.config.name === 'content_comments_entry_created_idx'
      )
    ).toBe(true);
    expect(
      config.indexes.some(
        (tableIndex) => tableIndex.config.name === 'content_comments_org_active_idx'
      )
    ).toBe(true);
    expect(
      config.foreignKeys.some(
        (foreignKey) =>
          foreignKey.getName() === 'content_comments_content_entry_id_content_entries_id_fk'
      )
    ).toBe(true);
    expect(
      config.foreignKeys.some(
        (foreignKey) => foreignKey.getName() === 'content_comments_author_user_id_users_id_fk'
      )
    ).toBe(true);
  });
});
