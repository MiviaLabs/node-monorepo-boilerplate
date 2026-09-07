import { describe, expect, it } from 'vitest';

import {
  filterProjectMembers,
  getAssignableTenantMembers,
  getProjectMemberDisplayName,
  getProjectMembersSummary
} from './project-members';

import type { ProjectMember } from '~/types/project.types';

import { MemberStatus, TENANT_ROLES, type TenantMember } from '~/types/tenant.types';

const baseTenantMember: TenantMember = {
  id: '1',
  userId: '1',
  tenantId: '10',
  email: 'atlas@example.com',
  role: TENANT_ROLES.USER,
  status: MemberStatus.ACTIVE,
  isActive: true,
  isDefault: false,
  joinedAt: '2026-03-18T00:00:00.000Z'
};

const baseProjectMember: ProjectMember = {
  userId: '1',
  displayName: 'Atlas',
  photoUrl: null,
  isCreator: false,
  assignedAt: '2026-03-18T00:00:00.000Z'
};

describe('project-members helpers', () => {
  it('filters out assigned and inactive tenant members', () => {
    const tenantMembers: TenantMember[] = [
      baseTenantMember,
      {
        ...baseTenantMember,
        id: '2',
        userId: '2',
        email: 'bravo@example.com',
        displayName: 'Bravo'
      },
      {
        ...baseTenantMember,
        id: '3',
        userId: '3',
        email: 'charlie@example.com',
        displayName: 'Charlie',
        status: MemberStatus.SUSPENDED,
        isActive: false
      }
    ];
    const projectMembers: ProjectMember[] = [baseProjectMember];

    expect(getAssignableTenantMembers(tenantMembers, projectMembers)).toEqual([
      {
        ...baseTenantMember,
        id: '2',
        userId: '2',
        email: 'bravo@example.com',
        displayName: 'Bravo'
      }
    ]);
  });

  it('falls back to the user id when a project member has no display name', () => {
    expect(
      getProjectMemberDisplayName({
        ...baseProjectMember,
        userId: '42',
        displayName: null
      })
    ).toBe('User 42');
  });

  it('summarizes creator and collaborator counts', () => {
    expect(
      getProjectMembersSummary([
        {
          ...baseProjectMember,
          isCreator: true
        },
        {
          ...baseProjectMember,
          userId: '2',
          displayName: 'Bravo'
        }
      ])
    ).toEqual({
      total: 2,
      creators: 1,
      collaborators: 1
    });
  });

  it('filters project members by search term and keeps creators first', () => {
    expect(
      filterProjectMembers(
        [
          {
            ...baseProjectMember,
            userId: '7',
            displayName: 'Zulu'
          },
          {
            ...baseProjectMember,
            userId: '1',
            displayName: 'Atlas',
            isCreator: true
          },
          {
            ...baseProjectMember,
            userId: '12',
            displayName: 'Bravo'
          }
        ],
        'a'
      )
    ).toEqual([
      {
        ...baseProjectMember,
        userId: '1',
        displayName: 'Atlas',
        isCreator: true
      },
      {
        ...baseProjectMember,
        userId: '12',
        displayName: 'Bravo'
      }
    ]);
  });

  it('matches project members by user id when no display name search matches', () => {
    expect(
      filterProjectMembers(
        [
          {
            ...baseProjectMember,
            userId: '42',
            displayName: null
          }
        ],
        '42'
      )
    ).toEqual([
      {
        ...baseProjectMember,
        userId: '42',
        displayName: null
      }
    ]);
  });
});
