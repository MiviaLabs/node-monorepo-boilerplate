import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { Errors } from '@package/errors';

import { CreateProjectDto, ProjectSortBy, ProjectSortOrder, UpdateProjectDto } from '../../dto';
import { PROJECT_VISIBILITY } from '../../types/project.types';
import { ProjectsService } from '../projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepository: {
    listVisibleProjects: jest.Mock;
    findByIdOrThrow: jest.Mock;
    findVisibleByIdOrThrow: jest.Mock;
    findVisibleByIdOrThrowWithDatabase: jest.Mock;
    canManageProject: jest.Mock;
    countActiveByOrganizationWithDatabase: jest.Mock;
    findActiveByKeyWithDatabase: jest.Mock;
    createWithDatabase: jest.Mock;
    findByIdOrThrowWithDatabase: jest.Mock;
    updateWithDatabase: jest.Mock;
    softDeleteProjectWithDatabase: jest.Mock;
  };
  let projectMemberRepository: {
    addMemberWithDatabase: jest.Mock;
    listMembers: jest.Mock;
    listMembersByProjectIds: jest.Mock;
    listMembershipProjectIds: jest.Mock;
    assertAssignableOrganizationMember: jest.Mock;
    removeMemberWithDatabase: jest.Mock;
  };
  let auditOutbox: { insert: jest.Mock };
  let db: {
    transaction: jest.Mock;
  };
  let tx: {
    execute: jest.Mock;
    select: jest.Mock;
  };

  beforeEach(() => {
    projectRepository = {
      listVisibleProjects: jest.fn(),
      findByIdOrThrow: jest.fn(),
      findVisibleByIdOrThrow: jest.fn(),
      findVisibleByIdOrThrowWithDatabase: jest.fn(),
      canManageProject: jest.fn(),
      countActiveByOrganizationWithDatabase: jest.fn(),
      findActiveByKeyWithDatabase: jest.fn(),
      createWithDatabase: jest.fn(),
      findByIdOrThrowWithDatabase: jest.fn(),
      updateWithDatabase: jest.fn(),
      softDeleteProjectWithDatabase: jest.fn()
    };
    projectMemberRepository = {
      addMemberWithDatabase: jest.fn(),
      listMembers: jest.fn(),
      listMembersByProjectIds: jest.fn(),
      listMembershipProjectIds: jest.fn(),
      assertAssignableOrganizationMember: jest.fn(),
      removeMemberWithDatabase: jest.fn()
    };
    auditOutbox = { insert: jest.fn(async () => undefined) };
    tx = { execute: jest.fn(), select: jest.fn() };
    db = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback: unknown) =>
          (callback as (database: typeof tx) => Promise<unknown>)(tx)
        )
    };

    service = new ProjectsService(
      projectRepository as never,
      projectMemberRepository as never,
      auditOutbox as never,
      db as never
    );
  });

  it('lists visible projects with pagination metadata', async () => {
    projectRepository.listVisibleProjects.mockImplementation(async () => ({
      data: [
        {
          id: 22,
          organizationId: 12,
          createdBy: 77,
          key: 'ATLAS',
          name: 'Atlas',
          visibility: PROJECT_VISIBILITY.PUBLIC,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      total: 3
    }));
    projectMemberRepository.listMembershipProjectIds.mockResolvedValue([22] as never);

    const result = await service.listProjects({
      tenantId: '12',
      userId: '34',
      roles: ['tenant_user'],
      page: 1,
      pageSize: 2,
      search: 'atlas',
      visibility: PROJECT_VISIBILITY.PUBLIC,
      sortBy: ProjectSortBy.Name,
      sortOrder: ProjectSortOrder.Asc
    });

    expect(projectRepository.listVisibleProjects).toHaveBeenCalledWith(
      12,
      { userId: 34, roles: ['tenant_user'] },
      {
        page: 1,
        pageSize: 2,
        search: 'atlas',
        visibility: PROJECT_VISIBILITY.PUBLIC,
        sortBy: ProjectSortBy.Name,
        sortOrder: ProjectSortOrder.Asc
      }
    );
    expect(projectMemberRepository.listMembershipProjectIds).toHaveBeenCalledWith(12, 34, [22]);
    expect(result.data[0]).toMatchObject({
      id: 22,
      isMember: true
    });
    expect(result.metadata.pagination.totalPages).toBe(2);
  });

  it('creates a project when the tenant quota allows it', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Roadmap';
    dto.visibility = PROJECT_VISIBILITY.PUBLIC;

    tx.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            for: jest.fn(async () => [{ tenantId: 99 }])
          })
        })
      })
    });
    tx.execute.mockResolvedValueOnce({
      rows: [{ settings: { features: { maxProjects: 5 } } }]
    } as never);
    projectRepository.countActiveByOrganizationWithDatabase.mockImplementation(async () => 1);
    projectRepository.findActiveByKeyWithDatabase.mockResolvedValue(null as never);
    projectRepository.createWithDatabase.mockImplementation(async () => ({
      id: 56,
      organizationId: 12,
      createdBy: 34,
      key: 'ROADMAP',
      name: 'Roadmap',
      visibility: PROJECT_VISIBILITY.PUBLIC,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    projectMemberRepository.addMemberWithDatabase.mockResolvedValue({
      userId: 34,
      displayName: 'Creator',
      photoUrl: null,
      isCreator: true,
      assignedAt: new Date()
    } as never);

    const result = await service.createProject('12', '34', 'actor-34', dto, {
      requestId: 'req-create',
      correlationId: 'corr-create',
      causationId: 'cause-create'
    });

    expect(projectRepository.createWithDatabase).toHaveBeenCalledWith(tx, 12, {
      createdBy: 34,
      key: 'ROADMAP',
      name: 'Roadmap',
      visibility: PROJECT_VISIBILITY.PUBLIC
    });
    expect(projectMemberRepository.addMemberWithDatabase).toHaveBeenCalledWith(tx, 12, 56, 34, 34);
    expect(projectRepository.countActiveByOrganizationWithDatabase).toHaveBeenCalledWith(tx, 12);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'tenant.project.created.audit',
        correlationId: 'corr-create',
        causationId: 'cause-create',
        payload: expect.objectContaining({
          action: 'CREATE_PROJECT',
          actorId: 'actor-34',
          requestId: 'req-create',
          details: {
            projectId: '56',
            visibility: PROJECT_VISIBILITY.PUBLIC
          }
        })
      })
    );
    const createAuditMessage = auditOutbox.insert.mock.calls[0]?.[1] as {
      payload: { details?: Record<string, unknown> };
    };
    expect(createAuditMessage.payload.details).not.toHaveProperty('name');
    expect(result.id).toBe(56);
  });

  it('appends a numeric suffix when the derived project key already exists', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Roadmap';
    dto.visibility = PROJECT_VISIBILITY.PUBLIC;

    tx.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            for: jest.fn(async () => [{ tenantId: 99 }])
          })
        })
      })
    });
    tx.execute.mockResolvedValueOnce({
      rows: [{ settings: { features: { maxProjects: 5 } } }]
    } as never);
    projectRepository.countActiveByOrganizationWithDatabase.mockImplementation(async () => 1);
    projectRepository.findActiveByKeyWithDatabase
      .mockResolvedValueOnce({ id: 1 } as never)
      .mockResolvedValueOnce(null as never);
    projectRepository.createWithDatabase.mockImplementation(async () => ({
      id: 57,
      organizationId: 12,
      createdBy: 34,
      key: 'ROADMAP2',
      name: 'Roadmap',
      visibility: PROJECT_VISIBILITY.PUBLIC,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    projectMemberRepository.addMemberWithDatabase.mockResolvedValue({
      userId: 34,
      displayName: 'Creator',
      photoUrl: null,
      isCreator: true,
      assignedAt: new Date()
    } as never);

    await service.createProject('12', '34', 'actor-34', dto);

    expect(projectRepository.createWithDatabase).toHaveBeenCalledWith(
      tx,
      12,
      expect.objectContaining({ key: 'ROADMAP2' })
    );
  });

  it('rejects creation when the tenant project limit is reached', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Roadmap';
    dto.visibility = PROJECT_VISIBILITY.PUBLIC;

    tx.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            for: jest.fn(async () => [{ tenantId: 99 }])
          })
        })
      })
    });
    tx.execute.mockResolvedValueOnce({
      rows: [{ settings: { features: { maxProjects: 1 } } }]
    } as never);
    projectRepository.countActiveByOrganizationWithDatabase.mockImplementation(async () => 1);

    await expect(service.createProject('12', '34', 'actor-34', dto)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('reads a project through repository visibility checks', async () => {
    projectRepository.findVisibleByIdOrThrow.mockImplementation(async () => ({ id: 56 }));

    await service.findById('12', '34', ['tenant_user'], '56');

    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(12, 56, {
      userId: 34,
      roles: ['tenant_user']
    });
  });

  it('lists project members for a manageable project', async () => {
    projectRepository.findVisibleByIdOrThrow.mockResolvedValue({
      id: 56,
      createdBy: 34
    } as never);
    projectRepository.canManageProject.mockReturnValue(true);
    projectMemberRepository.listMembers.mockResolvedValue([
      {
        userId: 34,
        displayName: 'Creator',
        photoUrl: null,
        isCreator: true,
        assignedAt: new Date('2026-03-18T00:00:00.000Z')
      }
    ] as never);

    const result = await service.listProjectMembers('12', '34', ['tenant_user'], '56');

    expect(projectMemberRepository.listMembers).toHaveBeenCalledWith(12, 56);
    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenCalledWith(12, 56, {
      userId: 34,
      roles: ['tenant_user']
    });
    expect(result[0]).toEqual({
      userId: 34,
      displayName: 'Creator',
      photoUrl: null,
      isCreator: true,
      assignedAt: '2026-03-18T00:00:00.000Z'
    });
  });

  it('lists project members in bulk for manageable projects', async () => {
    projectRepository.canManageProject.mockReturnValue(true);
    projectRepository.findVisibleByIdOrThrow
      .mockResolvedValueOnce({
        id: 56,
        createdBy: 34
      } as never)
      .mockResolvedValueOnce({
        id: 57,
        createdBy: 34
      } as never);
    projectRepository.canManageProject.mockReturnValue(true);
    projectMemberRepository.listMembersByProjectIds.mockResolvedValue(
      new Map([
        [
          56,
          [
            {
              userId: 34,
              displayName: 'Creator',
              photoUrl: null,
              isCreator: true,
              assignedAt: new Date('2026-03-18T00:00:00.000Z')
            }
          ]
        ],
        [57, []]
      ]) as never
    );

    const result = await service.listProjectMembersBulk(
      '12',
      '34',
      ['tenant_user'],
      ['56', '57', '56']
    );

    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenNthCalledWith(1, 12, 56, {
      userId: 34,
      roles: ['tenant_user']
    });
    expect(projectRepository.findVisibleByIdOrThrow).toHaveBeenNthCalledWith(2, 12, 57, {
      userId: 34,
      roles: ['tenant_user']
    });
    expect(result).toEqual({
      '56': [
        {
          userId: 34,
          displayName: 'Creator',
          photoUrl: null,
          isCreator: true,
          assignedAt: '2026-03-18T00:00:00.000Z'
        }
      ],
      '57': []
    });
  });

  it('skips unauthorized projects when listing project members in bulk', async () => {
    projectRepository.canManageProject.mockReturnValue(true);
    projectRepository.findVisibleByIdOrThrow
      .mockResolvedValueOnce({
        id: 56,
        createdBy: 34
      } as never)
      .mockRejectedValueOnce(new ForbiddenException('forbidden') as never);
    projectRepository.canManageProject.mockReturnValue(true);
    projectMemberRepository.listMembersByProjectIds.mockResolvedValue(
      new Map([
        [
          56,
          [
            {
              userId: 34,
              displayName: 'Creator',
              photoUrl: null,
              isCreator: true,
              assignedAt: new Date('2026-03-18T00:00:00.000Z')
            }
          ]
        ]
      ]) as never
    );

    const result = await service.listProjectMembersBulk('12', '34', ['tenant_user'], ['56', '57']);

    expect(result).toEqual({
      '56': [
        {
          userId: 34,
          displayName: 'Creator',
          photoUrl: null,
          isCreator: true,
          assignedAt: '2026-03-18T00:00:00.000Z'
        }
      ]
    });
  });

  it('updates a manageable project', async () => {
    const dto = new UpdateProjectDto();
    dto.name = 'Secret roadmap';
    dto.visibility = PROJECT_VISIBILITY.PRIVATE;

    projectRepository.findVisibleByIdOrThrowWithDatabase.mockImplementation(async () => ({
      id: 56,
      createdBy: 34
    }));
    projectRepository.canManageProject.mockReturnValue(true);
    projectRepository.updateWithDatabase.mockImplementation(async () => ({
      id: 56,
      visibility: PROJECT_VISIBILITY.PRIVATE
    }));

    await service.updateProject('12', '34', 'actor-99', ['tenant_user'], '56', dto, {
      requestId: 'req-update',
      correlationId: 'corr-update',
      causationId: 'cause-update'
    });

    expect(projectRepository.updateWithDatabase).toHaveBeenCalledWith(
      tx,
      12,
      56,
      expect.objectContaining({
        name: 'Secret roadmap',
        visibility: PROJECT_VISIBILITY.PRIVATE,
        updatedAt: expect.any(Date)
      })
    );
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'tenant.project.updated.audit',
        correlationId: 'corr-update',
        causationId: 'cause-update',
        payload: expect.objectContaining({
          actorId: 'actor-99',
          requestId: 'req-update',
          details: {
            projectId: '56',
            visibility: PROJECT_VISIBILITY.PRIVATE
          }
        })
      })
    );
    const updateAuditMessage = auditOutbox.insert.mock.calls[0]?.[1] as {
      payload: { details?: Record<string, unknown> };
    };
    expect(updateAuditMessage.payload.details).not.toHaveProperty('name');
  });

  it('rejects updates when the actor cannot manage the project', async () => {
    const dto = new UpdateProjectDto();
    dto.name = 'Blocked';

    projectRepository.findVisibleByIdOrThrowWithDatabase.mockImplementation(async () => ({
      id: 56,
      createdBy: 77
    }));
    projectRepository.canManageProject.mockReturnValue(false);

    await expect(
      service.updateProject('12', '34', 'actor-34', ['tenant_user'], '56', dto)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('conceals unauthorized private projects on update with not found', async () => {
    projectRepository.findVisibleByIdOrThrowWithDatabase.mockRejectedValueOnce(
      Errors.databaserecordNotFound004({ entity: 'Project' }) as never
    );

    await expect(
      service.updateProject('12', '34', 'actor-34', ['tenant_user'], '56', new UpdateProjectDto())
    ).rejects.toThrow(Errors.databaserecordNotFound004({ entity: 'Project' }));
  });

  it('soft deletes a manageable project', async () => {
    projectRepository.findVisibleByIdOrThrowWithDatabase.mockImplementation(async () => ({
      id: 56,
      createdBy: 34
    }));
    projectRepository.canManageProject.mockReturnValue(true);
    projectRepository.softDeleteProjectWithDatabase.mockImplementation(async () => ({ id: 56 }));

    await service.deleteProject('12', '34', 'actor-55', ['tenant_admin'], '56', {
      requestId: 'req-delete',
      correlationId: 'corr-delete',
      causationId: 'cause-delete'
    });

    expect(projectRepository.softDeleteProjectWithDatabase).toHaveBeenCalledWith(tx, 12, 56);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'tenant.project.deleted.audit',
        correlationId: 'corr-delete',
        causationId: 'cause-delete',
        payload: expect.objectContaining({
          actorId: 'actor-55',
          requestId: 'req-delete',
          details: {
            projectId: '56'
          }
        })
      })
    );
  });

  it('adds a project member when actor can manage the project and target is eligible', async () => {
    projectRepository.findVisibleByIdOrThrowWithDatabase.mockResolvedValue({
      id: 56,
      createdBy: 34
    } as never);
    projectRepository.canManageProject.mockReturnValue(true);
    projectMemberRepository.addMemberWithDatabase.mockResolvedValue({
      userId: 78,
      displayName: 'Assigned User',
      photoUrl: null,
      isCreator: false,
      assignedAt: new Date('2026-03-18T00:00:00.000Z')
    } as never);

    const result = await service.addProjectMember(
      '12',
      '34',
      'actor-77',
      ['tenant_user'],
      '56',
      '78',
      {
        requestId: 'req-member-add',
        correlationId: 'corr-member-add',
        causationId: 'cause-member-add'
      }
    );

    expect(projectMemberRepository.assertAssignableOrganizationMember).toHaveBeenCalledWith(
      12,
      78,
      tx
    );
    expect(projectMemberRepository.addMemberWithDatabase).toHaveBeenCalledWith(tx, 12, 56, 78, 34);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'tenant.project.member.added.audit',
        payload: expect.objectContaining({
          actorId: 'actor-77',
          details: {
            projectId: '56',
            userId: '78'
          }
        })
      })
    );
    expect(result.assignedAt).toBe('2026-03-18T00:00:00.000Z');
  });

  it('removes a project member when actor can manage the project', async () => {
    projectRepository.findVisibleByIdOrThrowWithDatabase.mockResolvedValue({
      id: 56,
      createdBy: 34
    } as never);
    projectRepository.canManageProject.mockReturnValue(true);

    await service.removeProjectMember('12', '34', 'actor-88', ['tenant_admin'], '56', '78', {
      requestId: 'req-member-remove',
      correlationId: 'corr-member-remove',
      causationId: 'cause-member-remove'
    });

    expect(projectMemberRepository.removeMemberWithDatabase).toHaveBeenCalledWith(tx, 12, 56, 78);
    expect(auditOutbox.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'tenant.project.member.removed.audit',
        payload: expect.objectContaining({
          actorId: 'actor-88',
          details: {
            projectId: '56',
            userId: '78'
          }
        })
      })
    );
  });

  it('rejects removing the project creator from project members', async () => {
    projectRepository.findVisibleByIdOrThrowWithDatabase.mockResolvedValue({
      id: 56,
      createdBy: 34
    } as never);
    projectRepository.canManageProject.mockReturnValue(true);

    await expect(
      service.removeProjectMember('12', '34', 'actor-34', ['tenant_admin'], '56', '34')
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
