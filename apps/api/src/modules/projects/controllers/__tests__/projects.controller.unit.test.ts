import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import {
  AddProjectMemberCommand,
  CreateProjectCommand,
  DeleteProjectCommand,
  RemoveProjectMemberCommand,
  UpdateProjectCommand
} from '../../commands';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  ProjectSortBy,
  ProjectSortOrder,
  UpdateProjectDto
} from '../../dto';
import { ProjectsService } from '../../services/projects.service';
import { PROJECT_VISIBILITY } from '../../types/project.types';
import { SpacesController } from '../projects.controller';

import type { TestingModule } from '@nestjs/testing';

import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

const OPA_ACTION_METADATA_KEY = 'opa_action';

describe('SpacesController', () => {
  let controller: SpacesController;
  let commandBus: jest.Mocked<CommandBus>;
  let projectsService: jest.Mocked<ProjectsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpacesController],
      providers: [
        {
          provide: CommandBus,
          useValue: { execute: jest.fn() }
        },
        {
          provide: ProjectsService,
          useValue: {
            listProjects: jest.fn(),
            findById: jest.fn(),
            listProjectMembers: jest.fn(),
            listProjectMembersBulk: jest.fn()
          }
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HybridPolicyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SpacesController);
    commandBus = module.get(CommandBus) as jest.Mocked<CommandBus>;
    projectsService = module.get(ProjectsService) as jest.Mocked<ProjectsService>;
  });

  it('lists projects with tenant context and query filters', async () => {
    projectsService.listProjects.mockResolvedValue({
      data: [],
      metadata: {
        pagination: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false
        }
      }
    });

    await controller.listProjects('12', '34', ['tenant_user'], {
      page: 1,
      pageSize: 20,
      search: 'atlas',
      visibility: PROJECT_VISIBILITY.PUBLIC,
      sortBy: ProjectSortBy.Name,
      sortOrder: ProjectSortOrder.Asc
    });

    expect(projectsService.listProjects).toHaveBeenCalledWith({
      tenantId: '12',
      userId: '34',
      roles: ['tenant_user'],
      page: 1,
      pageSize: 20,
      search: 'atlas',
      visibility: PROJECT_VISIBILITY.PUBLIC,
      sortBy: ProjectSortBy.Name,
      sortOrder: ProjectSortOrder.Asc
    });
  });

  it('creates a project through the command bus', async () => {
    const dto = new CreateProjectDto();
    dto.name = 'Roadmap';
    dto.visibility = PROJECT_VISIBILITY.PUBLIC;

    commandBus.execute.mockResolvedValue({ id: 1, name: 'Roadmap' });

    await controller.createProject(
      '12',
      '34',
      'actor-34',
      { requestId: 'req-1', correlationId: 'corr-1', causationId: 'cause-1' },
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateProjectCommand;
    expect(command).toBeInstanceOf(CreateProjectCommand);
    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.requestId).toBe('req-1');
    expect(command.correlationId).toBe('corr-1');
    expect(command.causationId).toBe('cause-1');
  });

  it('reads a project through the service with actor context', async () => {
    projectsService.findById.mockResolvedValue({
      id: 56,
      organizationId: 12,
      createdBy: 34,
      key: 'ROADMAP',
      name: 'Roadmap',
      visibility: PROJECT_VISIBILITY.PRIVATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await controller.getProject('12', '34', ['tenant_user'], '56');

    expect(projectsService.findById).toHaveBeenCalledWith('12', '34', ['tenant_user'], '56');
  });

  it('updates a project through the command bus', async () => {
    const dto = new UpdateProjectDto();
    dto.visibility = PROJECT_VISIBILITY.PRIVATE;

    commandBus.execute.mockResolvedValue({ id: 56 });

    await controller.updateProject(
      '12',
      '34',
      'actor-34',
      ['tenant_user'],
      { requestId: 'req-2', correlationId: 'corr-2', causationId: 'cause-2' },
      '56',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as UpdateProjectCommand;
    expect(command).toBeInstanceOf(UpdateProjectCommand);
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.requestId).toBe('req-2');
    expect(command.correlationId).toBe('corr-2');
    expect(command.causationId).toBe('cause-2');
  });

  it('lists project members through the service', async () => {
    projectsService.listProjectMembers.mockResolvedValue([
      {
        userId: 34,
        displayName: 'Jane Doe',
        photoUrl: null,
        isCreator: true,
        assignedAt: new Date().toISOString()
      }
    ]);

    await controller.listProjectMembers('12', '34', ['tenant_user'], '56');

    expect(projectsService.listProjectMembers).toHaveBeenCalledWith(
      '12',
      '34',
      ['tenant_user'],
      '56'
    );
  });

  it('lists project members in bulk through the service', async () => {
    projectsService.listProjectMembersBulk.mockResolvedValue({
      '56': []
    });

    await controller.listProjectMembersBulk('12', '34', ['tenant_user'], '56,57,56');

    expect(projectsService.listProjectMembersBulk).toHaveBeenCalledWith(
      '12',
      '34',
      ['tenant_user'],
      ['56', '57', '56']
    );
  });

  it('rejects bulk member listing when projectIds is missing', async () => {
    await expect(
      controller.listProjectMembersBulk('12', '34', ['tenant_user'], undefined)
    ).rejects.toMatchObject({
      message: 'projectIds query parameter is required'
    });
  });

  it('adds a project member through the command bus', async () => {
    const dto = new AddProjectMemberDto();
    dto.userId = 78;

    commandBus.execute.mockResolvedValue({ userId: 78 });

    await controller.addProjectMember(
      '12',
      '34',
      'actor-34',
      ['tenant_user'],
      { requestId: 'req-4', correlationId: 'corr-4', causationId: 'cause-4' },
      '56',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as AddProjectMemberCommand;
    expect(command).toBeInstanceOf(AddProjectMemberCommand);
    expect(command.actorId).toBe('actor-34');
    expect(command.memberId).toBe('78');
    expect(command.requestId).toBe('req-4');
  });

  it('deletes a project through the command bus', async () => {
    commandBus.execute.mockResolvedValue(undefined);

    await controller.deleteProject(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      { requestId: 'req-3', correlationId: 'corr-3', causationId: 'cause-3' },
      '56'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as DeleteProjectCommand;
    expect(command).toBeInstanceOf(DeleteProjectCommand);
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.requestId).toBe('req-3');
    expect(command.correlationId).toBe('corr-3');
    expect(command.causationId).toBe('cause-3');
  });

  it('removes a project member through the command bus', async () => {
    commandBus.execute.mockResolvedValue(undefined);

    await controller.removeProjectMember(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      { requestId: 'req-5', correlationId: 'corr-5', causationId: 'cause-5' },
      '56',
      '78'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as RemoveProjectMemberCommand;
    expect(command).toBeInstanceOf(RemoveProjectMemberCommand);
    expect(command.actorId).toBe('actor-34');
    expect(command.projectId).toBe('56');
    expect(command.memberId).toBe('78');
    expect(command.requestId).toBe('req-5');
  });
  it('uses write policy action for project member management routes', () => {
    const controllerPrototype = SpacesController.prototype;

    expect(
      Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.listProjectMembers)
    ).toBe('write');
    expect(
      Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.removeProjectMember)
    ).toBe('write');
  });
});
