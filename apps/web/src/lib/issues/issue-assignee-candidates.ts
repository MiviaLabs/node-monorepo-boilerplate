import { getMembers } from '~/lib/members/get-members';
import {
  PROJECT_VISIBILITY,
  type ProjectMember,
  type ProjectVisibility
} from '~/types/project.types';
import { MemberStatus, type TenantMember } from '~/types/tenant.types';

const ASSIGNEE_MEMBER_PAGE_SIZE = 100;

export function mapTenantMemberToProjectMember(member: TenantMember): ProjectMember {
  return {
    userId: member.userId,
    displayName: member.displayName?.trim() || member.email || null,
    photoUrl: member.photoUrl ?? null,
    isCreator: false,
    assignedAt: member.joinedAt
  };
}

export function resolveIssueAssigneeCandidates(
  projectVisibility: ProjectVisibility | null | undefined,
  organizationMembers: ProjectMember[],
  projectMembers: ProjectMember[]
): ProjectMember[] {
  return projectVisibility === PROJECT_VISIBILITY.PRIVATE ? projectMembers : organizationMembers;
}

export async function loadActiveOrganizationAssigneeMembers(): Promise<ProjectMember[]> {
  const members: ProjectMember[] = [];
  let page = 1;

  while (true) {
    const response = await getMembers(page, ASSIGNEE_MEMBER_PAGE_SIZE, {
      status: MemberStatus.ACTIVE
    });

    members.push(...response.data.map(mapTenantMemberToProjectMember));

    if (!response.meta.hasNext) {
      return members;
    }

    page += 1;
  }
}
