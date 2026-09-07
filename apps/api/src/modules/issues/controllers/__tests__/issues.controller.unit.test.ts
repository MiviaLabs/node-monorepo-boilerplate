import { PassThrough } from 'node:stream';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { REQUIRED_PERMISSIONS_KEY } from '@package/auth';
import { TENANT_PERMISSIONS } from '@package/constants';

import {
  AddIssueAssigneeCommand,
  AddIssueLabelCommand,
  AddIssueWatcherCommand,
  CreateIssueAttachmentCommand,
  CreateIssueAttachmentUploadCommand,
  CreateIssueLabelCommand,
  CreateIssueCommentCommand,
  CreateIssueCommand,
  DeleteIssueAttachmentCommand,
  DeleteIssueLabelCommand,
  DeleteIssueCommand,
  RemoveIssueAssigneeCommand,
  RemoveIssueLabelCommand,
  RemoveIssueWatcherCommand,
  UpdateIssueLabelCommand,
  UpdateIssueCommand
} from '../../commands';
import {
  CreateIssueAttachmentDto,
  CreateIssueAttachmentUploadDto,
  CreateIssueLabelDto,
  CreateIssueCommentDto,
  CreateIssueDto,
  MutateIssueLabelDto,
  MutateIssueParticipantDto,
  QueryIssuesDto,
  UpdateIssueLabelDto,
  UpdateIssueDto
} from '../../dto';
import { IssuesService } from '../../services';
import { TicketsController } from '../issues.controller';

import type { TestingModule } from '@nestjs/testing';

import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

const OPA_ACTION_METADATA_KEY = 'opa_action';
const OPA_RESOURCE_METADATA_KEY = 'opa_resource';

describe('TicketsController', () => {
  let controller: TicketsController;
  let commandBus: jest.Mocked<CommandBus>;
  let issuesService: jest.Mocked<IssuesService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        {
          provide: CommandBus,
          useValue: { execute: jest.fn() }
        },
        {
          provide: IssuesService,
          useValue: {
            listIssues: jest.fn(),
            getWorkspaceIssuesPage: jest.fn(),
            getMyWorkPage: jest.fn(),
            getIssueById: jest.fn(),
            getIssuePage: jest.fn(),
            getIssuesSummary: jest.fn(),
            listRelationCandidateIssues: jest.fn(),
            listIssueActivity: jest.fn(),
            listIssueAttachments: jest.fn(),
            getIssueAttachmentContent: jest.fn(),
            listIssueComments: jest.fn(),
            listIssueAssignees: jest.fn(),
            listIssueWatchers: jest.fn(),
            listIssueLabels: jest.fn()
          }
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HybridPolicyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TicketsController);
    commandBus = module.get(CommandBus) as jest.Mocked<CommandBus>;
    issuesService = module.get(IssuesService) as jest.Mocked<IssuesService>;
  });

  it('lists issues through the service with actor and filter context', async () => {
    issuesService.listIssues.mockResolvedValue({ data: [], metadata: { pagination: {} } } as never);

    const queryDto = new QueryIssuesDto();
    queryDto.page = 2;
    queryDto.pageSize = 25;
    queryDto.projectId = 12;
    queryDto.labelId = 3;
    queryDto.assigneeUserId = 9;
    queryDto.watcherUserId = 10;
    queryDto.search = 'restore';
    queryDto.status = 'in_progress';
    queryDto.priority = 'high';
    queryDto.sortBy = 'updatedAt';
    queryDto.sortOrder = 'desc';

    await controller.listIssues('5', '9', ['tenant_user'], queryDto);

    expect(issuesService.listIssues).toHaveBeenCalledWith({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user'],
      page: 2,
      pageSize: 25,
      projectId: 12,
      labelId: 3,
      assigneeUserId: 9,
      watcherUserId: 10,
      search: 'restore',
      status: 'in_progress',
      priority: 'high',
      sortBy: 'updatedAt',
      sortOrder: 'desc'
    });
  });

  it('loads one issue by id through the service', async () => {
    issuesService.getIssueById.mockResolvedValue({ id: 77 } as never);

    await controller.getIssueById('5', '9', ['tenant_user'], '77');

    expect(issuesService.getIssueById).toHaveBeenCalledWith('5', '9', ['tenant_user'], '77');
  });

  it('loads the workspace issues page through the service', async () => {
    issuesService.getWorkspaceIssuesPage.mockResolvedValue({
      issues: { data: [], metadata: { pagination: {} } },
      labels: [],
      projects: [],
      privateProjectMembersByProjectId: {}
    } as never);

    await controller.getWorkspaceIssuesPage('5', '9', ['tenant_user']);

    expect(issuesService.getWorkspaceIssuesPage).toHaveBeenCalledWith({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user']
    });
  });

  it('loads the my-work page through the service', async () => {
    issuesService.getMyWorkPage.mockResolvedValue({
      assignedIssues: [],
      assignedIssueCount: 0,
      watchingIssues: [],
      recentIssues: [],
      accessibleProjectCount: 0,
      ownedProjectCount: 0,
      collaborationProjectCount: 0
    } as never);

    await controller.getMyWorkPage('5', '9', ['tenant_user']);

    expect(issuesService.getMyWorkPage).toHaveBeenCalledWith({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user']
    });
  });

  it('loads the issue page payload through the service', async () => {
    issuesService.getIssuePage.mockResolvedValue({
      issue: { id: 77 },
      attachments: [],
      labels: [],
      members: [],
      relationCandidates: []
    } as never);

    await controller.getIssuePage('5', '9', ['tenant_user'], '77');

    expect(issuesService.getIssuePage).toHaveBeenCalledWith('5', '9', ['tenant_user'], '77');
  });

  it('loads issue comments through the service', async () => {
    issuesService.listIssueComments.mockResolvedValue([{ id: 11 }] as never);

    await controller.listIssueComments('5', '9', ['tenant_user'], '77');

    expect(issuesService.listIssueComments).toHaveBeenCalledWith('5', '9', ['tenant_user'], '77');
  });

  it('loads issue attachments through the service', async () => {
    issuesService.listIssueAttachments.mockResolvedValue([{ id: 14 }] as never);

    await controller.listIssueAttachments('5', '9', ['tenant_user'], '77');

    expect(issuesService.listIssueAttachments).toHaveBeenCalledWith(
      '5',
      '9',
      ['tenant_user'],
      '77'
    );
  });

  it('streams issue attachment content through the service', async () => {
    const body = new PassThrough();
    const pipeSpy = jest.spyOn(body, 'pipe');
    const response = new PassThrough() as PassThrough & {
      setHeader: jest.Mock;
      headersSent?: boolean;
    };
    response.setHeader = jest.fn();
    response.headersSent = false;
    body.end(Buffer.from('payload'));
    issuesService.getIssueAttachmentContent.mockResolvedValue({
      body,
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="design-spec.pdf"',
      contentLength: 1024,
      etag: '"etag-1"',
      lastModified: new Date('2026-03-22T04:45:00.000Z')
    } as never);

    await controller.getIssueAttachmentContent(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-download', correlationId: 'corr-download', causationId: 'cause-download' },
      '77',
      '51',
      response as never
    );

    expect(issuesService.getIssueAttachmentContent).toHaveBeenCalledWith(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      '77',
      '51',
      expect.objectContaining({
        requestId: 'req-download',
        correlationId: 'corr-download',
        causationId: 'cause-download'
      })
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="design-spec.pdf"'
    );
    expect(pipeSpy).toHaveBeenCalledWith(response);
  });

  it('loads issue activity through the service', async () => {
    issuesService.listIssueActivity.mockResolvedValue([{ id: 61 }] as never);

    await controller.listIssueActivity('5', '9', ['tenant_user'], '77');

    expect(issuesService.listIssueActivity).toHaveBeenCalledWith('5', '9', ['tenant_user'], '77');
  });

  it('loads issue assignees through the service', async () => {
    issuesService.listIssueAssignees.mockResolvedValue([{ userId: 9 }] as never);

    await controller.listIssueAssignees('5', '9', ['tenant_user'], '77');

    expect(issuesService.listIssueAssignees).toHaveBeenCalledWith('5', '9', ['tenant_user'], '77');
  });

  it('loads issue watchers through the service', async () => {
    issuesService.listIssueWatchers.mockResolvedValue([{ userId: 9 }] as never);

    await controller.listIssueWatchers('5', '9', ['tenant_user'], '77');

    expect(issuesService.listIssueWatchers).toHaveBeenCalledWith('5', '9', ['tenant_user'], '77');
  });

  it('loads issue labels through the service', async () => {
    issuesService.listIssueLabels.mockResolvedValue([{ id: 3 }] as never);

    await controller.listIssueLabels('5', '9', ['tenant_user']);

    expect(issuesService.listIssueLabels).toHaveBeenCalledWith('5', '9', ['tenant_user']);
  });

  it('loads relation candidates through the service', async () => {
    issuesService.listRelationCandidateIssues.mockResolvedValue([{ id: 91 }] as never);

    await controller.listRelationCandidateIssues('5', '9', ['tenant_user'], '77');

    expect(issuesService.listRelationCandidateIssues).toHaveBeenCalledWith(
      '5',
      '9',
      ['tenant_user'],
      '77'
    );
  });

  it('loads the summary through the service', async () => {
    issuesService.getIssuesSummary.mockResolvedValue({
      total: 0,
      backlog: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      open: 0
    });

    const queryDto = new QueryIssuesDto();
    queryDto.projectId = 12;
    queryDto.labelId = 3;
    queryDto.assigneeUserId = 9;
    queryDto.watcherUserId = 10;

    await controller.getIssuesSummary('5', '9', ['tenant_user'], queryDto);

    expect(issuesService.getIssuesSummary).toHaveBeenCalledWith({
      tenantId: '5',
      userId: '9',
      roles: ['tenant_user'],
      projectId: 12,
      labelId: 3,
      assigneeUserId: 9,
      watcherUserId: 10,
      search: undefined,
      status: undefined,
      priority: undefined
    });
  });

  it('creates one issue through the command bus', async () => {
    const dto = new CreateIssueDto();
    dto.title = 'Untitled issue';
    dto.projectId = 12;

    commandBus.execute.mockResolvedValue({ id: 77 } as never);

    await controller.createIssue(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-1', correlationId: 'corr-1', causationId: 'cause-1' },
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateIssueCommand;
    expect(command).toBeInstanceOf(CreateIssueCommand);
    expect(command.tenantId).toBe('5');
    expect(command.userId).toBe('9');
    expect(command.actorId).toBe('actor-9');
    expect(command.dto.projectId).toBe(12);
  });

  it('creates one issue attachment through the command bus', async () => {
    const dto = new CreateIssueAttachmentDto();
    dto.fileId = 101;

    commandBus.execute.mockResolvedValue({ id: 55 } as never);

    await controller.createIssueAttachment(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-attach', correlationId: 'corr-attach', causationId: 'cause-attach' },
      '77',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateIssueAttachmentCommand;
    expect(command).toBeInstanceOf(CreateIssueAttachmentCommand);
    expect(command.issueId).toBe('77');
    expect(command.dto.fileId).toBe(101);
  });

  it('creates one issue attachment upload reservation through the command bus', async () => {
    const dto = new CreateIssueAttachmentUploadDto();
    dto.originalFilename = 'design-spec.pdf';
    dto.mimeType = 'application/pdf';
    dto.byteSize = 1024;
    dto.transport = 'api_proxy';

    commandBus.execute.mockResolvedValue({ file: { id: 101 } } as never);

    await controller.createIssueAttachmentUpload(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-upload', correlationId: 'corr-upload', causationId: 'cause-upload' },
      '77',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateIssueAttachmentUploadCommand;
    expect(command).toBeInstanceOf(CreateIssueAttachmentUploadCommand);
    expect(command.issueId).toBe('77');
    expect(command.dto.originalFilename).toBe('design-spec.pdf');
  });

  it('deletes one issue attachment through the command bus', async () => {
    commandBus.execute.mockResolvedValue(undefined as never);

    await controller.deleteIssueAttachment(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-delete', correlationId: 'corr-delete', causationId: 'cause-delete' },
      '77',
      '51'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as DeleteIssueAttachmentCommand;
    expect(command).toBeInstanceOf(DeleteIssueAttachmentCommand);
    expect(command.issueId).toBe('77');
    expect(command.attachmentId).toBe('51');
  });

  it('updates one issue through the command bus', async () => {
    const dto = new UpdateIssueDto();
    dto.status = 'done';

    commandBus.execute.mockResolvedValue({ id: 77 } as never);

    await controller.updateIssue(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-2', correlationId: 'corr-2', causationId: 'cause-2' },
      '77',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as UpdateIssueCommand;
    expect(command).toBeInstanceOf(UpdateIssueCommand);
    expect(command.issueId).toBe('77');
    expect(command.dto.status).toBe('done');
  });

  it('deletes one issue through the command bus', async () => {
    commandBus.execute.mockResolvedValue(undefined as never);

    await controller.deleteIssue(
      '5',
      '9',
      'actor-9',
      ['tenant_admin'],
      { requestId: 'req-3', correlationId: 'corr-3', causationId: 'cause-3' },
      '77'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as DeleteIssueCommand;
    expect(command).toBeInstanceOf(DeleteIssueCommand);
    expect(command.issueId).toBe('77');
    expect(command.roles).toEqual(['tenant_admin']);
  });

  it('creates one issue comment through the command bus', async () => {
    const dto = new CreateIssueCommentDto();
    dto.bodyMarkdown = 'Looks good.';

    commandBus.execute.mockResolvedValue({ id: 77 } as never);

    await controller.createIssueComment(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-4', correlationId: 'corr-4', causationId: 'cause-4' },
      '77',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateIssueCommentCommand;
    expect(command).toBeInstanceOf(CreateIssueCommentCommand);
    expect(command.issueId).toBe('77');
    expect(command.dto.bodyMarkdown).toBe('Looks good.');
  });

  it('adds and removes assignees through the command bus', async () => {
    const dto = new MutateIssueParticipantDto();
    dto.userId = 12;
    commandBus.execute.mockResolvedValue({ id: 77 } as never);

    await controller.addIssueAssignee(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-5', correlationId: 'corr-5', causationId: 'cause-5' },
      '77',
      dto
    );
    const addCommand = commandBus.execute.mock.calls.at(-1)?.[0] as AddIssueAssigneeCommand;
    expect(addCommand).toBeInstanceOf(AddIssueAssigneeCommand);
    expect(addCommand.dto.userId).toBe(12);

    await controller.removeIssueAssignee(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      ['tenant:issues:read'],
      { requestId: 'req-6', correlationId: 'corr-6', causationId: 'cause-6' },
      '77',
      '12'
    );
    const removeCommand = commandBus.execute.mock.calls.at(-1)?.[0] as RemoveIssueAssigneeCommand;
    expect(removeCommand).toBeInstanceOf(RemoveIssueAssigneeCommand);
    expect(removeCommand.permissions).toEqual(['tenant:issues:read']);
    expect(removeCommand.assigneeUserId).toBe('12');
  });

  it('creates, updates, and deletes labels through the command bus', async () => {
    const createDto = new CreateIssueLabelDto();
    createDto.name = 'Frontend';
    const updateDto = new UpdateIssueLabelDto();
    updateDto.name = 'Platform';
    commandBus.execute.mockResolvedValue({ id: 3 } as never);

    await controller.createIssueLabel(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-7', correlationId: 'corr-7', causationId: 'cause-7' },
      createDto
    );
    const createCommand = commandBus.execute.mock.calls.at(-1)?.[0] as CreateIssueLabelCommand;
    expect(createCommand).toBeInstanceOf(CreateIssueLabelCommand);

    await controller.updateIssueLabel(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-8', correlationId: 'corr-8', causationId: 'cause-8' },
      '3',
      updateDto
    );
    const updateCommand = commandBus.execute.mock.calls.at(-1)?.[0] as UpdateIssueLabelCommand;
    expect(updateCommand).toBeInstanceOf(UpdateIssueLabelCommand);
    expect(updateCommand.labelId).toBe('3');

    await controller.deleteIssueLabel(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-9', correlationId: 'corr-9', causationId: 'cause-9' },
      '3'
    );
    const deleteCommand = commandBus.execute.mock.calls.at(-1)?.[0] as DeleteIssueLabelCommand;
    expect(deleteCommand).toBeInstanceOf(DeleteIssueLabelCommand);
  });

  it('adds and removes issue labels through the command bus', async () => {
    const dto = new MutateIssueLabelDto();
    dto.labelId = 3;
    commandBus.execute.mockResolvedValue({ id: 77 } as never);

    await controller.addIssueLabel(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-10', correlationId: 'corr-10', causationId: 'cause-10' },
      '77',
      dto
    );
    const addCommand = commandBus.execute.mock.calls.at(-1)?.[0] as AddIssueLabelCommand;
    expect(addCommand).toBeInstanceOf(AddIssueLabelCommand);
    expect(addCommand.dto.labelId).toBe(3);

    await controller.removeIssueLabel(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-11', correlationId: 'corr-11', causationId: 'cause-11' },
      '77',
      '3'
    );
    const removeCommand = commandBus.execute.mock.calls.at(-1)?.[0] as RemoveIssueLabelCommand;
    expect(removeCommand).toBeInstanceOf(RemoveIssueLabelCommand);
    expect(removeCommand.labelId).toBe('3');
  });

  it('adds and removes watchers through the command bus', async () => {
    const dto = new MutateIssueParticipantDto();
    dto.userId = 12;
    commandBus.execute.mockResolvedValue({ id: 77 } as never);

    await controller.addIssueWatcher(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-7', correlationId: 'corr-7', causationId: 'cause-7' },
      '77',
      dto
    );
    const addCommand = commandBus.execute.mock.calls.at(-1)?.[0] as AddIssueWatcherCommand;
    expect(addCommand).toBeInstanceOf(AddIssueWatcherCommand);
    expect(addCommand.dto.userId).toBe(12);

    await controller.removeIssueWatcher(
      '5',
      '9',
      'actor-9',
      ['tenant_user'],
      { requestId: 'req-8', correlationId: 'corr-8', causationId: 'cause-8' },
      '77',
      '12'
    );
    const removeCommand = commandBus.execute.mock.calls.at(-1)?.[0] as RemoveIssueWatcherCommand;
    expect(removeCommand).toBeInstanceOf(RemoveIssueWatcherCommand);
    expect(removeCommand.watcherUserId).toBe('12');
  });

  it('uses dedicated issues policy metadata and permissions on every current route', () => {
    const controllerPrototype = TicketsController.prototype;

    expect(Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.listIssues)).toEqual({
      type: 'issues',
      scope: 'tenant'
    });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.listIssues)).toBe(
      'list'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.listIssues)).toEqual([
      TENANT_PERMISSIONS.ISSUES_READ
    ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.getIssuesSummary)
    ).toEqual({ type: 'issues', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.getIssuesSummary)).toBe(
      'read'
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.getIssuesSummary)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_READ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.getIssueById)
    ).toEqual({ type: 'issues', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.getIssueById)).toBe(
      'read'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.getIssueById)).toEqual(
      [TENANT_PERMISSIONS.ISSUES_READ]
    );

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.listIssueComments)
    ).toEqual({ type: 'issues', scope: 'tenant' });
    expect(
      Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.listIssueComments)
    ).toBe('read');
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.listIssueComments)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_READ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.listIssueAssignees)
    ).toEqual({ type: 'issues', scope: 'tenant' });
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.listIssueAssignees)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_READ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.listIssueWatchers)
    ).toEqual({ type: 'issues', scope: 'tenant' });
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.listIssueWatchers)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_READ]);

    expect(Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.createIssue)).toEqual(
      {
        type: 'issues',
        scope: 'tenant'
      }
    );
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.createIssue)).toBe(
      'create'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.createIssue)).toEqual([
      TENANT_PERMISSIONS.ISSUES_CREATE
    ]);

    expect(Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.updateIssue)).toEqual(
      {
        type: 'issues',
        scope: 'tenant'
      }
    );
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.updateIssue)).toBe(
      'write'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.updateIssue)).toEqual([
      TENANT_PERMISSIONS.ISSUES_UPDATE
    ]);

    expect(Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.deleteIssue)).toEqual(
      {
        type: 'issues',
        scope: 'tenant'
      }
    );
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.deleteIssue)).toBe(
      'delete'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.deleteIssue)).toEqual([
      TENANT_PERMISSIONS.ISSUES_DELETE
    ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.createIssueComment)
    ).toEqual({ type: 'issues', scope: 'tenant' });
    expect(
      Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.createIssueComment)
    ).toBe('write');
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.createIssueComment)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_UPDATE]);

    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.deleteIssueLabel)).toBe(
      'write'
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.deleteIssueLabel)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_UPDATE]);

    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.addIssueAssignee)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_UPDATE]);
    expect(
      Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.removeIssueAssignee)
    ).toBe('update_self');
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.removeIssueAssignee)
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.addIssueWatcher)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_UPDATE]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.removeIssueWatcher)
    ).toEqual([TENANT_PERMISSIONS.ISSUES_UPDATE]);
  });
});
