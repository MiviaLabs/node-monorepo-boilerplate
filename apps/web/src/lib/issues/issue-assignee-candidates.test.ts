import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadActiveOrganizationAssigneeMembers,
  mapTenantMemberToProjectMember,
  resolveIssueAssigneeCandidates
} from './issue-assignee-candidates';

import { getMembers } from '~/lib/members/get-members';
import { PROJECT_VISIBILITY, type ProjectMember } from '~/types/project.types';
import { MemberStatus } from '~/types/tenant.types';

vi.mock('~/lib/members/get-members', () => ({
  getMembers: vi.fn()
}));

describe('issue assignee candidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps tenant members into project member candidates', () => {
    expect(
      mapTenantMemberToProjectMember({
        id: '1',
        userId: '7',
        tenantId: '9',
        email: 'jordan@example.com',
        displayName: '',
        photoUrl: 'https://cdn.example.test/jordan.png',
        role: 'tenant_user',
        status: MemberStatus.ACTIVE,
        isActive: true,
        isDefault: false,
        joinedAt: '2026-03-23T00:00:00.000Z'
      })
    ).toEqual({
      userId: '7',
      displayName: 'jordan@example.com',
      photoUrl: 'https://cdn.example.test/jordan.png',
      isCreator: false,
      assignedAt: '2026-03-23T00:00:00.000Z'
    });
  });

  it('uses organization members for org-wide and public issues, and project members for private issues', () => {
    const organizationMembers: ProjectMember[] = [
      {
        userId: '1',
        displayName: 'Jordan Lee',
        photoUrl: null,
        isCreator: false,
        assignedAt: '2026-03-23T00:00:00.000Z'
      }
    ];
    const projectMembers: ProjectMember[] = [
      {
        userId: '2',
        displayName: 'Taylor Kim',
        photoUrl: null,
        isCreator: false,
        assignedAt: '2026-03-23T00:00:00.000Z'
      }
    ];

    expect(resolveIssueAssigneeCandidates(null, organizationMembers, projectMembers)).toBe(
      organizationMembers
    );
    expect(
      resolveIssueAssigneeCandidates(PROJECT_VISIBILITY.PUBLIC, organizationMembers, projectMembers)
    ).toBe(organizationMembers);
    expect(
      resolveIssueAssigneeCandidates(
        PROJECT_VISIBILITY.PRIVATE,
        organizationMembers,
        projectMembers
      )
    ).toBe(projectMembers);
  });

  it('loads active organization members in pages and normalizes them for assignee use', async () => {
    vi.mocked(getMembers).mockResolvedValueOnce({
      data: [
        {
          id: '1',
          userId: '7',
          tenantId: '9',
          email: 'jordan@example.com',
          displayName: 'Jordan Lee',
          photoUrl: 'https://cdn.example.test/jordan.png',
          role: 'tenant_user',
          status: MemberStatus.ACTIVE,
          isActive: true,
          isDefault: false,
          joinedAt: '2026-03-23T00:00:00.000Z'
        }
      ],
      meta: {
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }
    });

    await expect(loadActiveOrganizationAssigneeMembers()).resolves.toEqual([
      {
        userId: '7',
        displayName: 'Jordan Lee',
        photoUrl: 'https://cdn.example.test/jordan.png',
        isCreator: false,
        assignedAt: '2026-03-23T00:00:00.000Z'
      }
    ]);

    expect(getMembers).toHaveBeenCalledWith(1, 100, { status: MemberStatus.ACTIVE });
  });
});
