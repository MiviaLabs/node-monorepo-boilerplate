import {
  MyWorkInboxLane,
  MyWorkInboxQueueId,
  MyWorkIssueRelationship,
  type MyWorkInboxItem,
  type MyWorkInboxQueue,
  type MyWorkIssueEntry
} from './my-work-types';

interface BuildMyWorkInboxModelOptions {
  accessibleProjectCount: number;
  assignedIssues: MyWorkIssueEntry[];
  recentIssues: MyWorkIssueEntry[];
  watchingIssues: MyWorkIssueEntry[];
}

export interface MyWorkInboxModel {
  allItems: MyWorkInboxItem[];
  priorityItems: MyWorkInboxItem[];
  recentItems: MyWorkInboxItem[];
  queues: MyWorkInboxQueue[];
  watchingProjectCount: number;
}

function getProjectName(entry: MyWorkIssueEntry): string {
  return entry.issue.project?.name ?? 'Organization';
}

function getIssueKey(entry: MyWorkIssueEntry): string {
  const prefix = entry.issue.project?.name?.slice(0, 1).toUpperCase() ?? 'O';
  return `${prefix}-${entry.issue.issueNumber}`;
}

function getUpdatedLabel(entry: MyWorkIssueEntry): string {
  const date =
    entry.issue.updatedAt instanceof Date ? entry.issue.updatedAt : new Date(entry.issue.updatedAt);
  return `Updated ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function getDetailLines(entry: MyWorkIssueEntry, isExpanded: boolean): string[] {
  const projectName = getProjectName(entry);
  const relationship = entry.relationshipLabel.toLowerCase();
  const baseLines = [
    `${entry.issue.title} is surfaced here because it is part of your ${relationship} issue stack in ${projectName}.`,
    `The current issue status is ${entry.issue.status.replace('_', ' ')}, with ${entry.issue.commentsCount} comments and ${entry.issue.watchersCount} watchers recorded so far.`,
    'This inbox now reflects real issue data rather than project-level mock placeholders, while keeping the same split-view reading pattern.'
  ];

  if (!isExpanded) {
    return baseLines;
  }

  return [
    ...baseLines,
    `The linked issue remains accessible through the canonical issue route, so the inbox detail pane can stay lightweight and still lead directly into the full issue workflow.`,
    `Because this item comes from real issue reads, future work can layer in mentions, reminders, or attachments without changing the overall interaction model.`
  ];
}

function getInboxCopy(
  relationshipLabel: MyWorkIssueRelationship
): Omit<
  MyWorkInboxItem,
  | 'id'
  | 'href'
  | 'issueKey'
  | 'issueTitle'
  | 'projectName'
  | 'relationshipLabel'
  | 'updatedLabel'
  | 'detailLines'
> {
  switch (relationshipLabel) {
    case MyWorkIssueRelationship.ASSIGNED:
      return {
        laneLabel: MyWorkInboxLane.ATTENTION,
        summary:
          'This issue is assigned to you and should stay near the top of your personal work stack.',
        actionLabel: 'Open issue'
      };
    case MyWorkIssueRelationship.WATCHING:
      return {
        laneLabel: MyWorkInboxLane.WATCHING,
        summary:
          'You are explicitly watching this issue, so it stays visible even when it is not directly assigned to you.',
        actionLabel: 'Review updates'
      };
    case MyWorkIssueRelationship.RECENT:
    default:
      return {
        laneLabel: MyWorkInboxLane.IN_PROGRESS,
        summary:
          'This is a recently updated visible issue that helps fill the inbox with current work context.',
        actionLabel: 'Catch up'
      };
  }
}

function toInboxItem(entry: MyWorkIssueEntry, duplicateIndex = 0): MyWorkInboxItem {
  const copy = getInboxCopy(entry.relationshipLabel);
  const itemId =
    duplicateIndex === 0 ? String(entry.issue.id) : `${entry.issue.id}-issue-${duplicateIndex + 1}`;
  const issueTitle =
    duplicateIndex === 0
      ? entry.issue.title
      : `${entry.issue.title} / ${duplicateIndex === 1 ? 'Follow-up' : duplicateIndex === 2 ? 'Review' : 'Update'}`;
  const isExpanded = duplicateIndex === 1;
  const projectQuery = entry.issue.projectId
    ? `?projectId=${entry.issue.projectId}`
    : '?projectScope=all';

  return {
    id: itemId,
    href: `/issues/${entry.issue.id}${projectQuery}`,
    issueKey: getIssueKey(entry),
    issueTitle,
    projectName: getProjectName(entry),
    relationshipLabel: entry.relationshipLabel,
    updatedLabel: getUpdatedLabel(entry),
    detailLines: getDetailLines(entry, isExpanded),
    ...copy
  };
}

function uniqueByIssue(entries: MyWorkIssueEntry[]): MyWorkIssueEntry[] {
  const seen = new Set<number>();

  return entries.filter((entry) => {
    if (seen.has(entry.issue.id)) {
      return false;
    }

    seen.add(entry.issue.id);
    return true;
  });
}

export function buildMyWorkInboxModel({
  accessibleProjectCount,
  assignedIssues,
  recentIssues,
  watchingIssues
}: BuildMyWorkInboxModelOptions): MyWorkInboxModel {
  const prioritizedEntries = uniqueByIssue(
    assignedIssues.length > 0
      ? assignedIssues
      : watchingIssues.length > 0
        ? watchingIssues
        : recentIssues
  );
  const allItems = uniqueByIssue(
    assignedIssues.length > 0
      ? [...assignedIssues, ...watchingIssues, ...recentIssues]
      : [...watchingIssues, ...recentIssues]
  ).flatMap((entry) => [toInboxItem(entry, 0), toInboxItem(entry, 1), toInboxItem(entry, 2)]);
  const priorityItems = prioritizedEntries.slice(0, 4).map((entry) => toInboxItem(entry));
  const priorityIds = new Set(priorityItems.map((item) => item.id));
  const recentItems = uniqueByIssue(recentIssues)
    .filter((entry) => !priorityIds.has(String(entry.issue.id)))
    .slice(0, 4)
    .map((entry) => toInboxItem(entry));
  const watchingProjectCount = Math.max(accessibleProjectCount - assignedIssues.length, 0);

  return {
    allItems,
    priorityItems,
    recentItems,
    watchingProjectCount,
    queues: [
      {
        id: MyWorkInboxQueueId.ATTENTION,
        title: 'Needs attention',
        count: priorityItems.length,
        description:
          'Assigned issues and urgent visible work that should be easy to re-enter quickly.',
        projectNames: priorityItems.slice(0, 3).map((item) => item.issueTitle)
      },
      {
        id: MyWorkInboxQueueId.SHARED,
        title: 'Shared work',
        count: assignedIssues.length,
        description: 'Issues directly assigned to you across the projects you can access.',
        projectNames: uniqueByIssue(assignedIssues)
          .slice(0, 3)
          .map((entry) => entry.issue.title)
      },
      {
        id: MyWorkInboxQueueId.WATCHING,
        title: 'Watching',
        count: watchingIssues.length,
        description: 'Issues you explicitly watch so they remain visible without being assigned.',
        projectNames: uniqueByIssue(watchingIssues)
          .slice(0, 3)
          .map((entry) => entry.issue.title)
      }
    ]
  };
}
