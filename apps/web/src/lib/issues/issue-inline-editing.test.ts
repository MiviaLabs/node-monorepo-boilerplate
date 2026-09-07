import { describe, expect, it, vi, beforeEach } from 'vitest';

import { buildInlineIssueMutation, canApplyInlineIssueUpdate } from './issue-inline-editing';

import { issuesApi } from '~/lib/api/issues-api';
import {
  ProjectIssueStage,
  ProjectIssueStatusTone,
  type ProjectIssuePreview
} from '~/lib/issues/issue-preview-data';

vi.mock('~/lib/api/issues-api', () => ({
  issuesApi: {
    addIssueAssignee: vi.fn(),
    removeIssueAssignee: vi.fn(),
    updateIssue: vi.fn()
  }
}));

const baseIssue: ProjectIssuePreview = {
  assignees: [],
  attachmentsCount: 0,
  commentsCount: 0,
  description: 'Desc',
  dueAt: null,
  dueLabel: 'No due date',
  estimate: 0,
  id: '7',
  identifier: 'ORG-7',
  labels: [],
  revision: '2026-03-23T00:00:00.000Z',
  title: 'Issue',
  ownerLabel: 'Organization',
  priorityLabel: 'Medium',
  stage: ProjectIssueStage.BACKLOG,
  statusLabel: 'Backlog',
  subtaskCompletedCount: 0,
  subtaskCount: 0,
  tone: ProjectIssueStatusTone.BACKLOG,
  updatedLabel: 'Updated recently',
  recentActivity: []
};

describe('buildInlineIssueMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a status update request with baseRevision', () => {
    const request = Promise.resolve({} as never);
    vi.mocked(issuesApi.updateIssue).mockReturnValue(request);

    const mutation = buildInlineIssueMutation(7, baseIssue, {
      ...baseIssue,
      stage: ProjectIssueStage.DONE,
      statusLabel: 'Done',
      tone: ProjectIssueStatusTone.DONE
    });

    expect(mutation?.errorTitle).toBe('Failed to update issue');
    expect(issuesApi.updateIssue).toHaveBeenCalledWith(7, {
      baseRevision: '2026-03-23T00:00:00.000Z',
      status: 'done'
    });
  });

  it('prefers assignee add/remove mutations over generic issue updates', () => {
    const request = Promise.resolve({} as never);
    vi.mocked(issuesApi.addIssueAssignee).mockReturnValue(request);

    const mutation = buildInlineIssueMutation(7, baseIssue, {
      ...baseIssue,
      assignees: [{ userId: 12, name: 'Jordan Lee', initials: 'JL', avatarUrl: null }]
    });

    expect(mutation?.errorTitle).toBe('Failed to update assignees');
    expect(issuesApi.addIssueAssignee).toHaveBeenCalledWith(7, { userId: 12 });
    expect(issuesApi.updateIssue).not.toHaveBeenCalled();
  });

  it('allows self-unassign without broader update permission while blocking other assignee changes', () => {
    const assignedToSelf = {
      ...baseIssue,
      assignees: [{ userId: 12, name: 'Jordan Lee', initials: 'JL', avatarUrl: null }]
    };

    expect(
      canApplyInlineIssueUpdate(
        assignedToSelf,
        { ...assignedToSelf, assignees: [] },
        {
          canUpdateIssue: false,
          currentUserId: 12
        }
      )
    ).toBe(true);

    expect(
      canApplyInlineIssueUpdate(baseIssue, assignedToSelf, {
        canUpdateIssue: false,
        currentUserId: 12
      })
    ).toBe(false);

    expect(
      canApplyInlineIssueUpdate(
        {
          ...assignedToSelf,
          assignees: [
            assignedToSelf.assignees[0]!,
            { userId: 13, name: 'Taylor Kim', initials: 'TK', avatarUrl: null }
          ]
        },
        {
          ...assignedToSelf,
          assignees: [{ userId: 12, name: 'Jordan Lee', initials: 'JL', avatarUrl: null }]
        },
        {
          canUpdateIssue: false,
          currentUserId: 12
        }
      )
    ).toBe(false);
  });
});
