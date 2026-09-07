import type { IssueListItem } from '~/types/issue.types';

export const enum MyWorkIssueRelationship {
  ASSIGNED = 'Assigned',
  WATCHING = 'Watching',
  RECENT = 'Recent'
}

export interface MyWorkIssueEntry {
  issue: IssueListItem;
  relationshipLabel: MyWorkIssueRelationship;
}

export const enum MyWorkInboxLane {
  ATTENTION = 'Needs attention',
  IN_PROGRESS = 'In progress',
  WATCHING = 'Watching'
}

export interface MyWorkInboxItem {
  id: string;
  href: string;
  issueKey: string;
  issueTitle: string;
  projectName: string;
  relationshipLabel: MyWorkIssueRelationship;
  laneLabel: MyWorkInboxLane;
  summary: string;
  actionLabel: string;
  updatedLabel: string;
  detailLines: string[];
}

export const enum MyWorkInboxQueueId {
  ATTENTION = 'attention',
  SHARED = 'shared',
  WATCHING = 'watching'
}

export interface MyWorkInboxQueue {
  id: MyWorkInboxQueueId;
  title: string;
  count: number;
  description: string;
  projectNames: string[];
}
