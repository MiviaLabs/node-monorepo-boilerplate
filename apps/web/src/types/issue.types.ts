export const enum IssueProjectVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private'
}
export type IssueProjectVisibilityValue = `${IssueProjectVisibility}`;

export const enum IssueRelationType {
  BLOCKS = 'blocks',
  BLOCKED_BY = 'blocked_by',
  RELATED = 'related',
  DUPLICATE_OF = 'duplicate_of'
}
export type IssueRelationTypeValue = `${IssueRelationType}`;

export const enum IssueStatus {
  BACKLOG = 'backlog',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  DONE = 'done'
}
export type IssueStatusValue = `${IssueStatus}`;

export const enum IssuePriority {
  URGENT = 'urgent',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}
export type IssuePriorityValue = `${IssuePriority}`;

export const enum IssueAttachmentUploadTransport {
  API_PROXY = 'api_proxy',
  PRESIGNED = 'presigned'
}
export type IssueAttachmentUploadTransportValue = `${IssueAttachmentUploadTransport}`;

export interface IssueParticipant {
  userId: number;
  displayName: string | null;
  photoUrl: string | null;
}

export interface IssueLabel {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
  projectId: number | null;
}

export interface IssueProject {
  id: number;
  key: string;
  name: string;
  visibility: IssueProjectVisibilityValue;
}

export interface IssueComment {
  id: number;
  authorUserId: number;
  authorDisplayName: string | null;
  authorPhotoUrl: string | null;
  bodyMarkdown: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface IssueRelation {
  id: number;
  relationType: IssueRelationTypeValue;
  relatedIssueId: number;
  relatedIssueTitle: string;
  relatedIssueNumber: number;
}

export interface IssueActivity {
  id: number;
  activityType: string;
  actorUserId: number | null;
  actorDisplayName: string | null;
  actorPhotoUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | Date;
}

export interface IssueAttachment {
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

export interface IssueAttachmentUploadReservation {
  file: {
    id: number;
  };
  upload: {
    transport: IssueAttachmentUploadTransportValue;
    url: string;
    headers?: Record<string, string>;
  };
}

export interface IssueListItem {
  id: number;
  organizationId: number;
  projectId: number | null;
  project: IssueProject | null;
  parentIssueId: number | null;
  issueNumber: number;
  title: string;
  descriptionMarkdown: string;
  status: IssueStatusValue;
  priority: IssuePriorityValue;
  position: number;
  estimate: number | null;
  dueAt: string | Date | null;
  resolvedAt: string | Date | null;
  createdBy: number;
  updatedBy: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  assignees: IssueParticipant[];
  labels: IssueLabel[];
  commentsCount: number;
  attachmentsCount: number;
  watchersCount: number;
  subtaskCount: number;
  completedSubtaskCount: number;
  activity?: IssueActivity[];
}

export interface IssueDetail extends IssueListItem {
  watchers: IssueParticipant[];
  comments: IssueComment[];
  relations: IssueRelation[];
  subtasks: IssueListItem[];
  activity: IssueActivity[];
}

export interface IssuesSummary {
  total: number;
  backlog: number;
  inProgress: number;
  blocked: number;
  done: number;
  open: number;
}

export interface IssuesPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface IssuesListResponse {
  data: IssueListItem[];
  metadata: {
    pagination: IssuesPagination;
  };
}

export interface WorkspaceIssuesPageData {
  issues: IssuesListResponse;
  labels: IssueLabel[];
  projects: Project[];
  organizationMembers: ProjectMember[];
  privateProjectMembersByProjectId: Record<string, ProjectMember[]>;
}

export interface MyWorkPageData {
  assignedIssues: IssueListItem[];
  assignedIssueCount: number;
  watchingIssues: IssueListItem[];
  recentIssues: IssueListItem[];
  accessibleProjectCount: number;
  ownedProjectCount: number;
  collaborationProjectCount: number;
}

export interface IssuePageData {
  issue: IssueDetail;
  attachments: IssueAttachment[];
  labels: IssueLabel[];
  members: ProjectMember[];
  relationCandidates: IssueListItem[];
}

export interface CreateIssueInput {
  title: string;
  descriptionMarkdown?: string;
  status?: IssueListItem['status'];
  priority?: IssueListItem['priority'];
  projectId?: number;
  parentIssueId?: number;
  position?: number;
  estimate?: number;
  dueAt?: string;
}

export interface UpdateIssueInput {
  baseRevision?: string;
  title?: string;
  descriptionMarkdown?: string;
  status?: IssueListItem['status'];
  priority?: IssueListItem['priority'];
  parentIssueId?: number | null;
  position?: number;
  estimate?: number | null;
  dueAt?: string | null;
}

export interface CreateIssueCommentInput {
  bodyMarkdown: string;
  parentCommentId?: number;
}

export interface CreateIssueAttachmentInput {
  fileId: number;
}

export interface CreateIssueAttachmentUploadInput {
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  transport?: IssueAttachmentUploadTransportValue;
}

export interface MutateIssueParticipantInput {
  userId: number;
}

export interface CreateIssueLabelInput {
  name: string;
  color?: string;
  description?: string;
}

export interface UpdateIssueLabelInput {
  name?: string;
  color?: string;
  description?: string | null;
}

export interface MutateIssueLabelInput {
  labelId: number;
}

export interface CreateIssueRelationInput {
  targetIssueId: number;
  relationType: IssueRelation['relationType'];
}
import type { Project, ProjectMember } from './project.types';
