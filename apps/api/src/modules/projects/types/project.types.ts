export const PROJECT_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private'
} as const;

export type ProjectVisibility = (typeof PROJECT_VISIBILITY)[keyof typeof PROJECT_VISIBILITY];

export interface Project {
  id: number;
  organizationId: number;
  createdBy: number;
  key: string;
  name: string;
  visibility: ProjectVisibility;
  isMember?: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ProjectMemberSummary {
  userId: number;
  displayName: string | null;
  photoUrl: string | null;
  isCreator: boolean;
  assignedAt: string | Date;
}
