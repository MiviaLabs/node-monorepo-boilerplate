import type { ProjectIssuePreview } from '~/lib/issues/issue-preview-data';
import type { IssueDetail } from '~/types/issue.types';

import { issuesApi } from '~/lib/api/issues-api';

type InlineIssueMutation =
  | {
      errorTitle: 'Failed to update issue';
      request: Promise<IssueDetail>;
    }
  | {
      errorTitle: 'Failed to update assignees';
      request: Promise<IssueDetail>;
    };

type AssigneeChange = {
  addedAssignee: ProjectIssuePreview['assignees'][number] | undefined;
  removedAssignee: ProjectIssuePreview['assignees'][number] | undefined;
};

function toApiStatus(stage: ProjectIssuePreview['stage']): IssueDetail['status'] {
  return stage;
}

function toApiPriority(priorityLabel: string): IssueDetail['priority'] {
  if (priorityLabel === 'Urgent') {
    return 'urgent';
  }

  if (priorityLabel === 'High') {
    return 'high';
  }

  if (priorityLabel === 'Medium') {
    return 'medium';
  }

  return 'low';
}

function getAssigneeChange(
  previous: ProjectIssuePreview,
  next: ProjectIssuePreview
): AssigneeChange {
  return {
    addedAssignee: next.assignees.find(
      (assignee) => !previous.assignees.some((current) => current.userId === assignee.userId)
    ),
    removedAssignee: previous.assignees.find(
      (assignee) => !next.assignees.some((current) => current.userId === assignee.userId)
    )
  };
}

export function canApplyInlineIssueUpdate(
  previous: ProjectIssuePreview,
  next: ProjectIssuePreview,
  options: {
    canUpdateIssue: boolean;
    currentUserId?: number;
  }
): boolean {
  if (options.canUpdateIssue) {
    return true;
  }

  const statusChanged = next.stage !== previous.stage;
  const priorityChanged = next.priorityLabel !== previous.priorityLabel;
  if (statusChanged || priorityChanged) {
    return false;
  }

  const { addedAssignee, removedAssignee } = getAssigneeChange(previous, next);
  return !addedAssignee && removedAssignee?.userId === options.currentUserId;
}

export function buildInlineIssueMutation(
  issueId: number,
  previous: ProjectIssuePreview,
  next: ProjectIssuePreview
): InlineIssueMutation | null {
  const statusChanged = next.stage !== previous.stage;
  const priorityChanged = next.priorityLabel !== previous.priorityLabel;
  const { addedAssignee, removedAssignee } = getAssigneeChange(previous, next);

  if (addedAssignee) {
    return {
      errorTitle: 'Failed to update assignees',
      request: issuesApi.addIssueAssignee(issueId, { userId: addedAssignee.userId })
    };
  }

  if (removedAssignee) {
    return {
      errorTitle: 'Failed to update assignees',
      request: issuesApi.removeIssueAssignee(issueId, removedAssignee.userId)
    };
  }

  if (statusChanged || priorityChanged) {
    return {
      errorTitle: 'Failed to update issue',
      request: issuesApi.updateIssue(issueId, {
        baseRevision: previous.revision,
        ...(statusChanged ? { status: toApiStatus(next.stage) } : {}),
        ...(priorityChanged ? { priority: toApiPriority(next.priorityLabel) } : {})
      })
    };
  }

  return null;
}
