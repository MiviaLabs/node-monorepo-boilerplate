import type { Project, ProjectMember } from '~/types/project.types';

export function formatProjectDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

export function getProjectCreatorLabel(project: Project, members: ProjectMember[]): string {
  const creator = members.find((member) => member.isCreator && member.userId === project.createdBy);
  const normalizedName = creator?.displayName?.trim();

  return normalizedName && normalizedName.length > 0 ? normalizedName : project.createdBy;
}
