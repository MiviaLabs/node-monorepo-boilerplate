export interface ContentEntry {
  id: number;
  organizationId: number;
  projectId: number | null;
  parentId: number | null;
  title: string;
  slug: string;
  revision: string;
  contentMarkdown: string;
  position: number;
  createdBy: number;
  updatedBy: number;
  updatedByDisplayName: string | null;
  updatedByPhotoUrl: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ContentCommentDtoShape {
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

export interface ContentAttachmentDtoShape {
  id: number;
  contentEntryId: number;
  fileId: number;
  attachedByUserId: number;
  attachedByDisplayName: string | null;
  uploadedByUserId: number | null;
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

export interface ContentScope {
  projectId: number | null;
}

export interface ContentListFilters extends ContentScope {
  parentId: number | null;
}

export interface ContentSidebarEntryDtoShape {
  id: number;
  organizationId: number;
  projectId: number | null;
  parentId: number | null;
  title: string;
  slug: string;
  position: number;
  updatedBy: number;
  updatedByDisplayName: string | null;
  updatedByPhotoUrl: string | null;
  updatedAt: string | Date;
}

export type ContentEntryDtoShape = ContentEntry;
