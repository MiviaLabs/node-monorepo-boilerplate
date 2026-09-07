import { describe, expect, it } from '@jest/globals';

import { contentEntries } from '../content-entries.schema';
import type { ContentEntry, NewContentEntry } from '../index';

describe('contentEntries.schema', () => {
  it('should expose the content entries table', () => {
    expect(typeof contentEntries).toBe('object');
    expect(contentEntries).not.toBeNull();
  });

  it('should export inferred row types from the schema barrel', () => {
    const row: Partial<ContentEntry> = {
      id: 1,
      slug: 'docs-home'
    };
    const insert: Partial<NewContentEntry> = {
      slug: 'docs-home'
    };

    expect(row.slug).toBe('docs-home');
    expect(insert.slug).toBe('docs-home');
  });
});
