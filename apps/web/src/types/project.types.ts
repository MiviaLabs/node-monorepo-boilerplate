/**
 * Project management types
 */

export const PROJECT_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private'
} as const;

export type ProjectVisibility = (typeof PROJECT_VISIBILITY)[keyof typeof PROJECT_VISIBILITY];

export const PROJECT_SORT_BY = {
  NAME: 'name',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  VISIBILITY: 'visibility'
} as const;

export type ProjectSortBy = (typeof PROJECT_SORT_BY)[keyof typeof PROJECT_SORT_BY];

export const PROJECT_SORT_ORDER = {
  ASC: 'asc',
  DESC: 'desc'
} as const;

export type ProjectSortOrder = (typeof PROJECT_SORT_ORDER)[keyof typeof PROJECT_SORT_ORDER];

export interface Project {
  id: string;
  organizationId: string;
  createdBy: string;
  key: string;
  name: string;
  visibility: ProjectVisibility;
  isMember?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  userId: string;
  displayName: string | null;
  photoUrl: string | null;
  isCreator: boolean;
  assignedAt: string;
}

export interface BulkProjectMembersInput {
  projectIds: string[];
}

export interface ProjectsResponse {
  data: Project[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface ProjectFilters {
  search?: string;
  visibility?: ProjectVisibility;
}

export interface ProjectsQueryInput extends ProjectFilters {
  page: number;
  pageSize: number;
  sortBy?: ProjectSortBy;
  sortOrder?: ProjectSortOrder;
}

export interface CreateProjectInput {
  name: string;
  visibility: ProjectVisibility;
}

export interface UpdateProjectInput extends CreateProjectInput {
  projectId: string;
}

export interface GetProjectInput {
  projectId: string;
}

export interface DeleteProjectInput {
  projectId: string;
}

export interface AddProjectMemberInput {
  projectId: string;
  userId: number;
}

export interface RemoveProjectMemberInput {
  projectId: string;
  memberId: string;
}

export const PROJECT_VISIBILITY_LABELS: Record<ProjectVisibility, string> = {
  [PROJECT_VISIBILITY.PUBLIC]: 'Public',
  [PROJECT_VISIBILITY.PRIVATE]: 'Private'
};
