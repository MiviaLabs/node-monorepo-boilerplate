export const enum ContentScope {
  ORGANIZATION = 'organization',
  PROJECT = 'project'
}

export interface ContentEntry {
  id: number;
  organizationId: number;
  projectId: number | null;
  parentId: number | null;
  title: string;
  slug: string;
  revision?: string;
  contentMarkdown: string;
  position: number;
  createdBy: number;
  updatedBy: number;
  updatedByDisplayName: string | null;
  updatedByPhotoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentComment {
  id: number;
  contentEntryId: number;
  authorUserId: number;
  authorDisplayName: string | null;
  authorPhotoUrl: string | null;
  bodyMarkdown: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  canDelete: boolean;
}

export interface ListContentEntriesInput {
  projectId?: number;
  parentId?: number;
  scope?: ContentScope;
}

export interface GetContentEntryBySlugInput {
  slug: string;
  projectId?: number;
  scope?: ContentScope;
}

export interface CreateContentEntryInput {
  title: string;
  contentMarkdown: string;
  slug?: string;
  projectId?: number;
  parentId?: number;
  position?: number;
}

export interface UpdateContentEntryInput {
  baseRevision?: string;
  title?: string;
  contentMarkdown?: string;
  slug?: string;
  parentId?: number | null;
  position?: number;
}

export interface CreateContentCommentInput {
  bodyMarkdown: string;
  parentCommentId?: number;
}

export interface ContentSidebarEntry {
  id: number;
  organizationId: number;
  title: string;
  slug: string;
  projectId: number | null;
  parentId: number | null;
  position: number;
  updatedBy: number;
  updatedByDisplayName: string | null;
  updatedByPhotoUrl: string | null;
  updatedAt: string;
}
