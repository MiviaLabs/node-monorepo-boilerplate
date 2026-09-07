import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContentComments } from './content-comments';

describe('ContentComments', () => {
  it('renders the newest comments first and only exposes delete actions for owned comments', () => {
    const markup = renderToStaticMarkup(
      <ContentComments
        contentEntryId={123}
        canCreateComment
        initialComments={[
          {
            id: 2,
            contentEntryId: 123,
            authorUserId: 9,
            authorDisplayName: 'Jordan Lee',
            authorPhotoUrl: 'https://signed.example.test/avatar.png',
            bodyMarkdown: 'Newest comment',
            createdAt: '2026-03-28T12:00:00.000Z',
            updatedAt: '2026-03-28T12:00:00.000Z',
            canDelete: true
          },
          {
            id: 1,
            contentEntryId: 123,
            authorUserId: 11,
            authorDisplayName: 'Taylor Kim',
            authorPhotoUrl: null,
            bodyMarkdown: 'Older comment',
            createdAt: '2026-03-28T11:00:00.000Z',
            updatedAt: '2026-03-28T11:00:00.000Z',
            canDelete: false
          }
        ]}
      />
    );

    expect(markup).toContain('Comments');
    expect(markup).toContain('Newest comment');
    expect(markup).toContain('Older comment');
    expect(markup.indexOf('Newest comment')).toBeLessThan(markup.indexOf('Older comment'));
    expect(markup).toContain('Comment');
    expect(markup).toContain('Delete');
  });
});
