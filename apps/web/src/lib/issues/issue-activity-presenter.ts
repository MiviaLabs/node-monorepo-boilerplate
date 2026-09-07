import type { IssueActivity, IssueListItem } from '~/types/issue.types';

const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function formatRelativeTime(value: string | Date, now: Date): string {
  const date = toDate(value);
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / (60 * 1000));

  if (Math.abs(diffMinutes) < 60) {
    return relativeTime.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return relativeTime.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  return relativeTime.format(diffDays, 'day');
}

function formatStatus(status: IssueListItem['status'] | string | undefined): string {
  switch (status) {
    case 'in_progress':
      return 'In progress';
    case 'blocked':
      return 'Blocked';
    case 'done':
      return 'Done';
    case 'backlog':
      return 'Backlog';
    default:
      return 'Unknown';
  }
}

function formatPriority(priority: IssueListItem['priority'] | string | undefined): string {
  switch (priority) {
    case 'urgent':
      return 'Urgent';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return 'Unknown';
  }
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function actorPrefix(entry: IssueActivity): string {
  return entry.actorDisplayName?.trim() || 'Someone';
}

export function formatIssueActivitySummary(entry: IssueActivity): string {
  const actor = actorPrefix(entry);
  const metadata = entry.metadata ?? {};

  switch (entry.activityType) {
    case 'issue.created':
      return `${actor} created the issue`;
    case 'issue.updated': {
      const changedFields = getStringArray(metadata['changedFields']);
      return changedFields.length > 0
        ? `${actor} updated ${changedFields.join(', ')}`
        : `${actor} updated the issue`;
    }
    case 'issue.status_changed':
      return `${actor} changed status from ${formatStatus(
        typeof metadata['fromStatus'] === 'string' ? metadata['fromStatus'] : undefined
      )} to ${formatStatus(typeof metadata['toStatus'] === 'string' ? metadata['toStatus'] : undefined)}`;
    case 'issue.priority_changed':
      return `${actor} changed priority from ${formatPriority(
        typeof metadata['fromPriority'] === 'string' ? metadata['fromPriority'] : undefined
      )} to ${formatPriority(
        typeof metadata['toPriority'] === 'string' ? metadata['toPriority'] : undefined
      )}`;
    case 'issue.comment_added':
      return `${actor} added a comment`;
    case 'issue.assigned':
      return `${actor} assigned ${typeof metadata['assigneeDisplayName'] === 'string' ? metadata['assigneeDisplayName'] : 'a teammate'}`;
    case 'issue.unassigned':
      return `${actor} removed ${typeof metadata['assigneeDisplayName'] === 'string' ? metadata['assigneeDisplayName'] : 'an assignee'}`;
    case 'issue.watcher_added':
      return `${actor} added ${typeof metadata['watcherDisplayName'] === 'string' ? metadata['watcherDisplayName'] : 'a watcher'}`;
    case 'issue.watcher_removed':
      return `${actor} removed ${typeof metadata['watcherDisplayName'] === 'string' ? metadata['watcherDisplayName'] : 'a watcher'}`;
    case 'issue.label_added':
      return `${actor} added label ${typeof metadata['labelName'] === 'string' ? metadata['labelName'] : ''}`.trim();
    case 'issue.label_removed':
      return `${actor} removed label ${typeof metadata['labelName'] === 'string' ? metadata['labelName'] : ''}`.trim();
    case 'issue.relation_added':
      return `${actor} linked ${typeof metadata['relationType'] === 'string' ? metadata['relationType'].replace('_', ' ') : 'related'} issue #${typeof metadata['relatedIssueNumber'] === 'number' ? metadata['relatedIssueNumber'] : 'unknown'}`;
    case 'issue.relation_removed':
      return `${actor} removed a relation`;
    default:
      return entry.actorDisplayName?.trim()
        ? `${entry.actorDisplayName} • ${entry.activityType}`
        : entry.activityType;
  }
}

export function formatIssueActivityTimeLabel(entry: IssueActivity, now: Date): string {
  return formatRelativeTime(entry.createdAt, now);
}
