import { describe, expect, it } from 'vitest';

import { buildIssueAssigneeOptions } from './issue-inline-editors';

describe('issue inline editors', () => {
  it('prefers issue payload assignee avatars over member-directory fallbacks', () => {
    const options = buildIssueAssigneeOptions(
      [
        {
          userId: '7',
          displayName: 'Jordan Lee',
          photoUrl: 'https://stale.example.test/member.png',
          isCreator: false,
          assignedAt: '2026-03-20T00:00:00.000Z'
        }
      ],
      [
        {
          userId: 7,
          name: 'Jordan Lee',
          initials: 'JL',
          avatarUrl: null
        }
      ]
    );

    expect(options[0]).toEqual({
      userId: 7,
      name: 'Jordan Lee',
      initials: 'JL',
      avatarUrl: null
    });
  });
});
