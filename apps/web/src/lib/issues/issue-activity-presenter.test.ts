import { describe, expect, it } from 'vitest';

import {
  formatIssueActivitySummary,
  formatIssueActivityTimeLabel
} from './issue-activity-presenter';

import type { IssueActivity } from '~/types/issue.types';

describe('issue activity presenter', () => {
  it('formats status changes using metadata', () => {
    const activity: IssueActivity = {
      id: 1,
      activityType: 'issue.status_changed',
      actorUserId: 9,
      actorDisplayName: 'Jordan Lee',
      actorPhotoUrl: null,
      metadata: {
        fromStatus: 'backlog',
        toStatus: 'in_progress'
      },
      createdAt: '2026-03-23T00:00:00.000Z'
    };

    expect(formatIssueActivitySummary(activity)).toBe(
      'Jordan Lee changed status from Backlog to In progress'
    );
  });

  it('formats generic updates with changed fields', () => {
    const activity: IssueActivity = {
      id: 2,
      activityType: 'issue.updated',
      actorUserId: 9,
      actorDisplayName: 'Jordan Lee',
      actorPhotoUrl: null,
      metadata: {
        changedFields: ['title', 'description']
      },
      createdAt: '2026-03-23T00:00:00.000Z'
    };

    expect(formatIssueActivitySummary(activity)).toBe('Jordan Lee updated title, description');
  });

  it('formats relative timestamps for the timeline', () => {
    const activity: IssueActivity = {
      id: 3,
      activityType: 'issue.created',
      actorUserId: 9,
      actorDisplayName: 'Jordan Lee',
      actorPhotoUrl: null,
      metadata: {},
      createdAt: '2026-03-23T00:00:00.000Z'
    };

    expect(formatIssueActivityTimeLabel(activity, new Date('2026-03-23T01:00:00.000Z'))).toBe(
      '1 hour ago'
    );
  });
});
