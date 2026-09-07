import type {
  IssuePriority,
  IssueRelationType,
  IssueStatus,
  ProjectVisibility
} from '@package/db-core';

export interface IssueParticipantDtoShape {
  userId: number;
  displayName: string | null;
  photoUrl: string | null;
}

export interface IssueLabelDtoShape {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
  projectId: number | null;
}

export interface IssueRelationDtoShape {
  id: number;
  relationType: IssueRelationType;
  relatedIssueId: number;
  relatedIssueTitle: string;
  relatedIssueNumber: number;
}

export interface IssueCommentDtoShape {
  id: number;
  authorUserId: number;
  authorDisplayName: string | null;
  authorPhotoUrl: string | null;
  bodyMarkdown: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IssueAttachmentDtoShape {
  id: number;
  issueId: number;
  uploadedByUserId: number;
  uploaderDisplayName: string | null;
  uploaderPhotoUrl: string | null;
  fileId: number | null;
  originalFilename: string;
  mimeType: string | null;
  byteSize: number;
  status: 'pending_upload' | 'ready' | 'pending_delete' | 'deleted' | 'upload_failed' | null;
  visibility: 'private' | 'tenant_public' | 'public' | null;
  storageInstance: string | null;
  bucket: string | null;
  objectKey: string | null;
  createdAt: string | Date;
}

export interface IssueActivityDtoShape {
  id: number;
  activityType: string;
  actorUserId: number | null;
  actorDisplayName: string | null;
  actorPhotoUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | Date;
}

export interface IssueProjectDtoShape {
  id: number;
  key: string;
  name: string;
  visibility: ProjectVisibility;
}

export interface IssueListItemDtoShape {
  id: number;
  organizationId: number;
  projectId: number | null;
  project: IssueProjectDtoShape | null;
  parentIssueId: number | null;
  issueNumber: number;
  title: string;
  descriptionMarkdown: string;
  status: IssueStatus;
  priority: IssuePriority;
  position: number;
  estimate: number | null;
  dueAt: string | Date | null;
  resolvedAt: string | Date | null;
  createdBy: number;
  updatedBy: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  assignees: IssueParticipantDtoShape[];
  labels: IssueLabelDtoShape[];
  commentsCount: number;
  attachmentsCount: number;
  watchersCount: number;
  subtaskCount: number;
  completedSubtaskCount: number;
  activity?: IssueActivityDtoShape[];
}

export interface IssueDetailDtoShape extends IssueListItemDtoShape {
  watchers: IssueParticipantDtoShape[];
  comments: IssueCommentDtoShape[];
  relations: IssueRelationDtoShape[];
  subtasks: IssueListItemDtoShape[];
  activity: IssueActivityDtoShape[];
}

export interface IssuesSummaryDtoShape {
  total: number;
  backlog: number;
  inProgress: number;
  blocked: number;
  done: number;
  open: number;
}

export interface IssueWorkspaceProjectDtoShape {
  id: number;
  organizationId: number;
  createdBy: number;
  key: string;
  name: string;
  visibility: ProjectVisibility;
  isMember: boolean;
}

export interface IssueWorkspaceProjectMemberDtoShape {
  userId: number;
  displayName: string | null;
  photoUrl: string | null;
  isCreator: boolean;
  assignedAt: string | Date;
}

export interface WorkspaceIssuesPageDtoShape {
  issues: {
    data: IssueListItemDtoShape[];
    metadata: {
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
      };
    };
  };
  labels: IssueLabelDtoShape[];
  projects: IssueWorkspaceProjectDtoShape[];
  organizationMembers: IssueWorkspaceProjectMemberDtoShape[];
  privateProjectMembersByProjectId: Record<string, IssueWorkspaceProjectMemberDtoShape[]>;
}

export interface MyWorkPageDtoShape {
  assignedIssues: IssueListItemDtoShape[];
  assignedIssueCount: number;
  watchingIssues: IssueListItemDtoShape[];
  recentIssues: IssueListItemDtoShape[];
  accessibleProjectCount: number;
  ownedProjectCount: number;
  collaborationProjectCount: number;
}

export interface IssuePageDtoShape {
  issue: IssueDetailDtoShape;
  attachments: IssueAttachmentDtoShape[];
  labels: IssueLabelDtoShape[];
  members: IssueWorkspaceProjectMemberDtoShape[];
  relationCandidates: IssueListItemDtoShape[];
}
