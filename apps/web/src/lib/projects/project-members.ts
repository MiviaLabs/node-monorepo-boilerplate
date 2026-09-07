import type { ProjectMember } from '~/types/project.types';
import type { TenantMember } from '~/types/tenant.types';

import { MemberStatus } from '~/types/tenant.types';

function getSortableName(value: string | undefined | null, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized.toLowerCase() : fallback.toLowerCase();
}

export function getProjectMemberDisplayName(member: ProjectMember): string {
  const normalized = member.displayName?.trim();
  return normalized && normalized.length > 0 ? normalized : `User ${member.userId}`;
}

export function getAssignableTenantMembers(
  tenantMembers: TenantMember[],
  projectMembers: ProjectMember[]
): TenantMember[] {
  const assignedUserIds = new Set(projectMembers.map((member) => member.userId));

  return tenantMembers
    .filter(
      (member) => member.status === MemberStatus.ACTIVE && !assignedUserIds.has(member.userId)
    )
    .sort((left, right) => {
      const leftName = getSortableName(left.displayName, left.email);
      const rightName = getSortableName(right.displayName, right.email);

      return leftName.localeCompare(rightName);
    });
}

export function getProjectMembersSummary(projectMembers: ProjectMember[]) {
  return {
    total: projectMembers.length,
    creators: projectMembers.filter((member) => member.isCreator).length,
    collaborators: projectMembers.filter((member) => !member.isCreator).length
  };
}

export function filterProjectMembers(
  projectMembers: ProjectMember[],
  searchTerm: string
): ProjectMember[] {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  return projectMembers
    .filter((member) => {
      if (normalizedSearchTerm.length === 0) {
        return true;
      }

      const displayName = getProjectMemberDisplayName(member).toLowerCase();
      const userId = member.userId.toLowerCase();

      return displayName.includes(normalizedSearchTerm) || userId.includes(normalizedSearchTerm);
    })
    .sort((left, right) => {
      if (left.isCreator !== right.isCreator) {
        return left.isCreator ? -1 : 1;
      }

      return getProjectMemberDisplayName(left).localeCompare(getProjectMemberDisplayName(right));
    });
}
