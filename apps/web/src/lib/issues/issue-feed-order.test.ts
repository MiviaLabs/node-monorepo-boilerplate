import { describe, expect, it } from 'vitest';

import { orderIssueActivityDesc, orderIssueCommentsDesc } from './issue-feed-order';

describe('issue feed order', () => {
  it('orders comments newest first', () => {
    expect(
      orderIssueCommentsDesc([
        {
          id: 2,
          bodyMarkdown: 'older',
          authorUserId: 7,
          authorDisplayName: 'A',
          authorPhotoUrl: null,
          createdAt: '2026-03-23T00:00:00.000Z',
          updatedAt: '2026-03-23T00:00:00.000Z'
        },
        {
          id: 9,
          bodyMarkdown: 'newer',
          authorUserId: 7,
          authorDisplayName: 'A',
          authorPhotoUrl: null,
          createdAt: '2026-03-23T02:00:00.000Z',
          updatedAt: '2026-03-23T02:00:00.000Z'
        }
      ]).map((comment) => comment.id)
    ).toEqual([9, 2]);
  });

  it('orders activity newest first and breaks ties by id descending', () => {
    expect(
      orderIssueActivityDesc([
        {
          id: 3,
          activityType: 'issue.created',
          actorUserId: 7,
          actorDisplayName: 'A',
          actorPhotoUrl: null,
          metadata: {},
          createdAt: '2026-03-23T01:00:00.000Z'
        },
        {
          id: 11,
          activityType: 'issue.updated',
          actorUserId: 7,
          actorDisplayName: 'A',
          actorPhotoUrl: null,
          metadata: {},
          createdAt: '2026-03-23T01:00:00.000Z'
        },
        {
          id: 5,
          activityType: 'issue.comment_added',
          actorUserId: 7,
          actorDisplayName: 'A',
          actorPhotoUrl: null,
          metadata: {},
          createdAt: '2026-03-23T02:00:00.000Z'
        }
      ]).map((entry) => entry.id)
    ).toEqual([5, 11, 3]);
  });
});
