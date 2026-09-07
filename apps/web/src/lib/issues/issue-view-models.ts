import {
  formatIssueActivitySummary,
  formatIssueActivityTimeLabel
} from './issue-activity-presenter';
import {
  ProjectIssueStage,
  ProjectIssueStatusTone,
  type ProjectIssuePreview
} from './issue-preview-data';

import type { WorkspaceIssueRecord } from '~/components/issues/workspace-issues-page-content';
import type {
  IssueActivity,
  IssueDetail,
  IssueLabel,
  IssueListItem,
  IssueParticipant
} from '~/types/issue.types';
import type { Project, ProjectMember } from '~/types/project.types';

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getInitials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/[`*_>#~-]/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeMarkdown(markdown: string): string {
  const plain = stripMarkdown(markdown);
  if (!plain) {
    return 'No description yet.';
  }

  return plain.length > 220 ? `${plain.slice(0, 217).trimEnd()}...` : plain;
}

function formatRelativeLabel(value: string | Date, now: Date): string {
  const date = toDate(value);
  if (!date) {
    return 'Updated recently';
  }

  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 60) {
    return `Updated ${relativeTime.format(diffMinutes, 'minute')}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return `Updated ${relativeTime.format(diffHours, 'hour')}`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Updated ${relativeTime.format(diffDays, 'day')}`;
}

function formatDueLabel(issue: Pick<IssueListItem, 'dueAt' | 'resolvedAt'>, now: Date): string {
  if (issue.resolvedAt) {
    return 'Completed';
  }

  const dueAt = toDate(issue.dueAt);
  if (!dueAt) {
    return 'No due date';
  }

  const startOfNow = new Date(now);
  startOfNow.setHours(0, 0, 0, 0);
  const startOfDue = new Date(dueAt);
  startOfDue.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (startOfDue.getTime() - startOfNow.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0) {
    return 'Due today';
  }

  if (diffDays === 1) {
    return 'Due tomorrow';
  }

  if (diffDays > 1 && diffDays <= 7) {
    return 'Due this week';
  }

  if (diffDays < 0) {
    return 'Overdue';
  }

  return `Due ${dueAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function mapStatus(status: IssueListItem['status']): {
  stage: ProjectIssueStage;
  statusLabel: string;
  tone: ProjectIssueStatusTone;
} {
  switch (status) {
    case 'in_progress':
      return {
        stage: ProjectIssueStage.IN_PROGRESS,
        statusLabel: 'In progress',
        tone: ProjectIssueStatusTone.ACTIVE
      };
    case 'blocked':
      return {
        stage: ProjectIssueStage.BLOCKED,
        statusLabel: 'Blocked',
        tone: ProjectIssueStatusTone.BLOCKED
      };
    case 'done':
      return {
        stage: ProjectIssueStage.DONE,
        statusLabel: 'Done',
        tone: ProjectIssueStatusTone.DONE
      };
    default:
      return {
        stage: ProjectIssueStage.BACKLOG,
        statusLabel: 'Backlog',
        tone: ProjectIssueStatusTone.BACKLOG
      };
  }
}

function mapPriority(priority: IssueListItem['priority']): string {
  switch (priority) {
    case 'urgent':
      return 'Urgent';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    default:
      return 'Low';
  }
}

function mapAssignees(assignees: IssueParticipant[]): ProjectIssuePreview['assignees'] {
  return assignees.map((assignee) => {
    const fallbackName = assignee.displayName?.trim() || `User ${assignee.userId}`;

    return {
      avatarUrl: assignee.photoUrl,
      initials: getInitials(fallbackName),
      name: fallbackName,
      userId: assignee.userId
    };
  });
}

function mapRecentActivity(
  activity: IssueActivity[],
  now: Date
): ProjectIssuePreview['recentActivity'] {
  return activity.slice(0, 4).map((entry) => ({
    id: String(entry.id),
    summary: formatIssueActivitySummary(entry),
    timeLabel: formatIssueActivityTimeLabel(entry, now)
  }));
}

function getFallbackRecentActivity(
  issue: Pick<IssueListItem, 'createdAt' | 'id'>,
  now: Date
): ProjectIssuePreview['recentActivity'] {
  return [
    {
      id: `${issue.id}-created`,
      summary: 'Someone created the issue',
      timeLabel: formatRelativeLabel(issue.createdAt, now).replace(/^Updated /, '')
    }
  ];
}

function toProjectSummary(
  issue: Pick<IssueListItem, 'project' | 'organizationId'>,
  projectLookup: Map<string, Project>
): Project {
  if (issue.project) {
    const existing = projectLookup.get(String(issue.project.id));
    if (existing) {
      return existing;
    }

    const nowIso = new Date().toISOString();
    return {
      id: String(issue.project.id),
      organizationId: String(issue.organizationId),
      createdBy: '',
      key: issue.project.key,
      name: issue.project.name,
      visibility: issue.project.visibility,
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  const nowIso = new Date().toISOString();
  return {
    id: 'organization',
    organizationId: String(issue.organizationId),
    createdBy: '',
    key: 'ORG',
    name: 'Organization',
    visibility: 'private',
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export function mapIssueToPreview(
  issue: IssueListItem | IssueDetail,
  options: {
    members?: ProjectMember[];
    now?: Date;
    projectLookup?: Map<string, Project>;
  } = {}
): ProjectIssuePreview {
  const now = options.now ?? new Date();
  const status = mapStatus(issue.status);
  const assignees = mapAssignees(issue.assignees);

  return {
    assignees,
    attachmentsCount: issue.attachmentsCount,
    commentsCount: issue.commentsCount,
    description: summarizeMarkdown(issue.descriptionMarkdown),
    descriptionMarkdown: issue.descriptionMarkdown,
    dueAt: issue.dueAt,
    dueLabel: formatDueLabel(issue, now),
    estimate: issue.estimate,
    id: String(issue.id),
    identifier: `${issue.project?.key ?? 'ORG'}-${issue.issueNumber}`,
    labels: issue.labels.map((label) => label.name),
    revision: toDate(issue.updatedAt)?.toISOString(),
    title: issue.title,
    ownerLabel: assignees[0]?.name ?? issue.project?.name ?? 'Organization',
    priorityLabel: mapPriority(issue.priority),
    stage: status.stage,
    statusLabel: status.statusLabel,
    subtaskCompletedCount: issue.completedSubtaskCount,
    subtaskCount: issue.subtaskCount,
    tone: status.tone,
    updatedLabel: formatRelativeLabel(issue.updatedAt, now),
    recentActivity:
      'activity' in issue && Array.isArray(issue.activity) && issue.activity.length > 0
        ? mapRecentActivity(issue.activity, now)
        : getFallbackRecentActivity(issue, now)
  };
}

export function mapIssueToWorkspaceRecord(
  issue: IssueListItem | IssueDetail,
  options: {
    members?: ProjectMember[];
    now?: Date;
    projectLookup?: Map<string, Project>;
  } = {}
): WorkspaceIssueRecord {
  const projectLookup = options.projectLookup ?? new Map<string, Project>();
  const preview = mapIssueToPreview(issue, options);
  const searchText = [
    preview.identifier,
    issue.title,
    stripMarkdown(issue.descriptionMarkdown),
    issue.labels.map((label) => label.name).join(' '),
    issue.project?.name ?? 'Organization'
  ]
    .join(' ')
    .toLowerCase();

  return {
    issue: preview,
    labels: issue.labels as IssueLabel[],
    members: options.members ?? [],
    project: toProjectSummary(issue, projectLookup),
    searchText,
    sourceIssue: issue
  };
}

export function mapIssueDetailProject(
  issue: IssueDetail,
  projectLookup: Map<string, Project>
): Project {
  return toProjectSummary(issue, projectLookup);
}
