import { describe, expect, it } from 'vitest';

import { mapIssueToPreview, mapIssueToWorkspaceRecord } from './issue-view-models';

import type { IssueDetail, IssueListItem } from '~/types/issue.types';
import type { Project } from '~/types/project.types';

describe('issue view models', () => {
  it('maps API list items into the restored issue preview shape', () => {
    const issue: IssueListItem = {
      id: 42,
      organizationId: 7,
      projectId: 3,
      project: {
        id: 3,
        key: 'ROADMAP',
        name: 'Atlas',
        visibility: 'private'
      },
      parentIssueId: null,
      issueNumber: 142,
      title: 'Restore standalone issue details page',
      descriptionMarkdown: '# Restore\nBring back the previous issue details route.',
      status: 'in_progress',
      priority: 'high',
      position: 1,
      estimate: 5,
      dueAt: '2026-03-23T00:00:00.000Z',
      resolvedAt: null,
      createdBy: 9,
      updatedBy: 9,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-22T03:00:00.000Z',
      assignees: [
        {
          userId: 9,
          displayName: 'Jordan Lee',
          photoUrl: 'https://cdn.example.test/jordan.png'
        }
      ],
      labels: [{ id: 2, name: 'Frontend', color: null, description: null, projectId: 3 }],
      commentsCount: 3,
      attachmentsCount: 1,
      watchersCount: 2,
      subtaskCount: 4,
      completedSubtaskCount: 1,
      activity: [
        {
          id: 90,
          activityType: 'issue.created',
          actorUserId: 9,
          actorDisplayName: 'Jordan Lee',
          actorPhotoUrl: 'https://cdn.example.test/jordan.png',
          metadata: { issueNumber: 142 },
          createdAt: '2026-03-22T03:30:00.000Z'
        }
      ]
    };

    const preview = mapIssueToPreview(issue, {
      now: new Date('2026-03-22T04:00:00.000Z')
    });

    expect(preview.id).toBe('42');
    expect(preview.identifier).toBe('ROADMAP-142');
    expect(preview.statusLabel).toBe('In progress');
    expect(preview.priorityLabel).toBe('High');
    expect(preview.updatedLabel).toBe('Updated 1 hour ago');
    expect(preview.estimate).toBe(5);
    expect(preview.dueAt).toBe('2026-03-23T00:00:00.000Z');
    expect(preview.descriptionMarkdown).toBe(
      '# Restore\nBring back the previous issue details route.'
    );
    expect(preview.assignees[0]?.initials).toBe('JL');
    expect(preview.assignees[0]?.avatarUrl).toBe('https://cdn.example.test/jordan.png');
    expect(preview.recentActivity[0]?.summary).toBe('Jordan Lee created the issue');
  });

  it('creates a stable synthetic workspace project for org-scoped issues', () => {
    const issue: IssueListItem = {
      id: 7,
      organizationId: 4,
      projectId: null,
      project: null,
      parentIssueId: null,
      issueNumber: 17,
      title: 'Document organization-wide triage',
      descriptionMarkdown: 'No project bound.',
      status: 'backlog',
      priority: 'low',
      position: 1,
      estimate: null,
      dueAt: null,
      resolvedAt: null,
      createdBy: 1,
      updatedBy: 1,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:30:00.000Z',
      assignees: [],
      labels: [],
      commentsCount: 0,
      attachmentsCount: 0,
      watchersCount: 0,
      subtaskCount: 0,
      completedSubtaskCount: 0
    };

    const record = mapIssueToWorkspaceRecord(issue);

    expect(record.project.id).toBe('organization');
    expect(record.project.name).toBe('Organization');
    expect(record.issue.tone).toBe('backlog');
    expect(record.issue.estimate).toBeNull();
    expect(record.issue.recentActivity[0]?.summary).toBe('Someone created the issue');
  });

  it('preserves full workspace search text instead of the truncated preview summary', () => {
    const issue: IssueListItem = {
      id: 12,
      organizationId: 4,
      projectId: 3,
      project: {
        id: 3,
        key: 'ROADMAP',
        name: 'Atlas',
        visibility: 'private'
      },
      parentIssueId: null,
      issueNumber: 19,
      title: 'Search tail coverage',
      descriptionMarkdown: `${'A'.repeat(230)} unique-search-token after the preview boundary.`,
      status: 'backlog',
      priority: 'low',
      position: 1,
      estimate: null,
      dueAt: null,
      resolvedAt: null,
      createdBy: 1,
      updatedBy: 1,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:30:00.000Z',
      assignees: [],
      labels: [{ id: 2, name: 'Frontend', color: null, description: null, projectId: 3 }],
      commentsCount: 0,
      attachmentsCount: 0,
      watchersCount: 0,
      subtaskCount: 0,
      completedSubtaskCount: 0
    };

    const record = mapIssueToWorkspaceRecord(issue);

    expect(record.searchText).toContain('roadmap-19');
    expect(record.searchText).toContain('unique search token after the preview boundary');
  });

  it('uses detail activity when present', () => {
    const issue: IssueDetail = {
      id: 9,
      organizationId: 7,
      projectId: 3,
      project: {
        id: 3,
        key: 'ROADMAP',
        name: 'Atlas',
        visibility: 'private'
      },
      parentIssueId: null,
      issueNumber: 150,
      title: 'Track activity',
      descriptionMarkdown: 'Observe activity feed.',
      status: 'done',
      priority: 'medium',
      position: 1,
      estimate: 2,
      dueAt: null,
      resolvedAt: '2026-03-22T02:00:00.000Z',
      createdBy: 1,
      updatedBy: 1,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-22T02:00:00.000Z',
      assignees: [],
      labels: [],
      commentsCount: 0,
      attachmentsCount: 0,
      watchersCount: 0,
      subtaskCount: 0,
      completedSubtaskCount: 0,
      watchers: [],
      comments: [],
      relations: [],
      subtasks: [],
      activity: [
        {
          id: 1,
          activityType: 'issue.closed',
          actorUserId: 9,
          actorDisplayName: 'Jordan Lee',
          actorPhotoUrl: null,
          metadata: {},
          createdAt: '2026-03-22T02:30:00.000Z'
        }
      ]
    };
    const projectLookup = new Map<string, Project>([
      [
        '3',
        {
          id: '3',
          organizationId: '7',
          createdBy: '1',
          key: 'ROADMAP',
          name: 'Atlas',
          visibility: 'private',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-22T00:00:00.000Z'
        }
      ]
    ]);

    const preview = mapIssueToPreview(issue, {
      now: new Date('2026-03-22T03:00:00.000Z'),
      projectLookup
    });

    expect(preview.dueLabel).toBe('Completed');
    expect(preview.recentActivity[0]?.summary).toContain('Jordan Lee');
  });

  it('uses the issue payload photoUrl instead of a stale member photo fallback', () => {
    const issue: IssueListItem = {
      id: 43,
      organizationId: 7,
      projectId: 3,
      project: {
        id: 3,
        key: 'ROADMAP',
        name: 'Atlas',
        visibility: 'private'
      },
      parentIssueId: null,
      issueNumber: 143,
      title: 'Prefer issue photo',
      descriptionMarkdown: 'Avatar should come from the issue payload.',
      status: 'backlog',
      priority: 'medium',
      position: 1,
      estimate: null,
      dueAt: null,
      resolvedAt: null,
      createdBy: 9,
      updatedBy: 9,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-22T03:00:00.000Z',
      assignees: [{ userId: 9, displayName: 'Jordan Lee', photoUrl: null }],
      labels: [],
      commentsCount: 0,
      attachmentsCount: 0,
      watchersCount: 0,
      subtaskCount: 0,
      completedSubtaskCount: 0
    };

    const preview = mapIssueToPreview(issue, {
      members: [
        {
          userId: '9',
          displayName: 'Jordan Lee',
          photoUrl: 'https://stale.example.test/member.png',
          isCreator: false,
          assignedAt: '2026-03-20T00:00:00.000Z'
        }
      ]
    });

    expect(preview.assignees[0]?.avatarUrl).toBeNull();
  });
});
