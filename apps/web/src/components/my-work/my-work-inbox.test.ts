import { describe, expect, it } from 'vitest';

import { buildMyWorkInboxModel } from './my-work-inbox';
import {
  MyWorkInboxLane,
  MyWorkInboxQueueId,
  MyWorkIssueRelationship,
  type MyWorkIssueEntry
} from './my-work-types';

const baseIssue = {
  id: 101,
  organizationId: 7,
  projectId: 3,
  project: {
    id: 3,
    key: 'ATLAS',
    name: 'Atlas',
    visibility: 'private' as const
  },
  parentIssueId: null,
  issueNumber: 41,
  title: 'Restore issue metrics',
  descriptionMarkdown: 'Use real issue data.',
  status: 'in_progress' as const,
  priority: 'high' as const,
  position: 1,
  estimate: 3,
  dueAt: null,
  resolvedAt: null,
  createdBy: 9,
  updatedBy: 9,
  createdAt: '2026-03-21T00:00:00.000Z',
  updatedAt: '2026-03-22T00:00:00.000Z',
  assignees: [{ userId: 9, displayName: 'Jordan Lee', photoUrl: null }],
  labels: [],
  commentsCount: 2,
  attachmentsCount: 0,
  watchersCount: 1,
  subtaskCount: 0,
  completedSubtaskCount: 0
};

function createEntry(
  id: number,
  title: string,
  relationshipLabel: MyWorkIssueRelationship
): MyWorkIssueEntry {
  return {
    issue: {
      ...baseIssue,
      id,
      issueNumber: id,
      title
    },
    relationshipLabel
  };
}

describe('buildMyWorkInboxModel', () => {
  it('maps assigned issues into inbox items with attention priority', () => {
    const model = buildMyWorkInboxModel({
      accessibleProjectCount: 4,
      assignedIssues: [createEntry(11, 'Assigned issue', MyWorkIssueRelationship.ASSIGNED)],
      recentIssues: [createEntry(12, 'Recent issue', MyWorkIssueRelationship.RECENT)],
      watchingIssues: [createEntry(13, 'Watching issue', MyWorkIssueRelationship.WATCHING)]
    });

    expect(model.priorityItems[0]).toMatchObject({
      id: '11',
      issueTitle: 'Assigned issue',
      laneLabel: MyWorkInboxLane.ATTENTION,
      relationshipLabel: MyWorkIssueRelationship.ASSIGNED
    });
  });

  it('falls back to watching issues when nothing is assigned', () => {
    const model = buildMyWorkInboxModel({
      accessibleProjectCount: 2,
      assignedIssues: [],
      recentIssues: [createEntry(21, 'Recent issue', MyWorkIssueRelationship.RECENT)],
      watchingIssues: [createEntry(22, 'Watching issue', MyWorkIssueRelationship.WATCHING)]
    });

    expect(model.priorityItems[0]?.id).toBe('22');
    expect(model.priorityItems[0]?.laneLabel).toBe(MyWorkInboxLane.WATCHING);
    expect(model.queues.find((queue) => queue.id === MyWorkInboxQueueId.WATCHING)?.count).toBe(1);
  });

  it('keeps recent issues distinct from the priority stack', () => {
    const model = buildMyWorkInboxModel({
      accessibleProjectCount: 5,
      assignedIssues: [createEntry(31, 'Assigned issue', MyWorkIssueRelationship.ASSIGNED)],
      recentIssues: [
        createEntry(31, 'Assigned issue', MyWorkIssueRelationship.RECENT),
        createEntry(32, 'Recent issue', MyWorkIssueRelationship.RECENT)
      ],
      watchingIssues: [createEntry(33, 'Watching issue', MyWorkIssueRelationship.WATCHING)]
    });

    expect(model.priorityItems.map((item) => item.id)).toEqual(['31']);
    expect(model.recentItems.map((item) => item.id)).toEqual(['32']);
  });
});
