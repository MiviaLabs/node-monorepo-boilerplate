import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { REQUIRED_PERMISSIONS_KEY } from '@package/auth';
import { TENANT_PERMISSIONS } from '@package/constants';

import {
  CreateContentAttachmentCommand,
  CreateContentCommentCommand,
  CreateContentEntryCommand,
  DeleteContentCommentCommand,
  DeleteContentEntryCommand,
  UpdateContentEntryCommand
} from '../../commands';
import {
  ContentQueryScope,
  CreateContentAttachmentDto,
  CreateContentCommentDto,
  CreateContentEntryDto,
  QueryContentEntriesDto,
  UpdateContentEntryDto
} from '../../dto';
import { ContentService } from '../../services';
import { PagesController } from '../content.controller';

import type { TestingModule } from '@nestjs/testing';

import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';

const OPA_ACTION_METADATA_KEY = 'opa_action';
const OPA_RESOURCE_METADATA_KEY = 'opa_resource';

describe('PagesController', () => {
  let controller: PagesController;
  let commandBus: jest.Mocked<CommandBus>;
  let contentService: jest.Mocked<ContentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PagesController],
      providers: [
        {
          provide: CommandBus,
          useValue: { execute: jest.fn() }
        },
        {
          provide: ContentService,
          useValue: {
            listAttachments: jest.fn(),
            listComments: jest.fn(),
            listEntries: jest.fn(),
            listSidebarEntries: jest.fn(),
            getEntryById: jest.fn(),
            getEntryBySlug: jest.fn()
          }
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(HybridPolicyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PagesController);
    commandBus = module.get(CommandBus) as jest.Mocked<CommandBus>;
    contentService = module.get(ContentService) as jest.Mocked<ContentService>;
  });

  it('lists entries through the content service with tenant and actor context', async () => {
    contentService.listEntries.mockResolvedValue([]);

    const queryDto = new QueryContentEntriesDto();
    queryDto.scope = ContentQueryScope.PROJECT;
    queryDto.projectId = 12;
    queryDto.parentId = 34;

    await controller.listEntries('12', '34', ['tenant_user'], queryDto);

    expect(contentService.listEntries).toHaveBeenCalledWith({
      tenantId: '12',
      userId: '34',
      roles: ['tenant_user'],
      scope: ContentQueryScope.PROJECT,
      projectId: 12,
      parentId: 34
    });
  });

  it('loads an entry by id through the service', async () => {
    contentService.getEntryById.mockResolvedValue({ id: 56 } as never);

    await controller.getEntryById('12', '34', ['tenant_user'], '56');

    expect(contentService.getEntryById).toHaveBeenCalledWith('12', '34', ['tenant_user'], '56');
  });

  it('lists sidebar entries through the content service with tenant and actor context', async () => {
    contentService.listSidebarEntries.mockResolvedValue([]);

    const queryDto = new QueryContentEntriesDto();
    queryDto.scope = ContentQueryScope.PROJECT;
    queryDto.projectId = 12;
    queryDto.parentId = 34;

    await controller.listSidebarEntries('12', '34', ['tenant_user'], queryDto);

    expect(contentService.listSidebarEntries).toHaveBeenCalledWith({
      tenantId: '12',
      userId: '34',
      roles: ['tenant_user'],
      scope: ContentQueryScope.PROJECT,
      projectId: 12,
      parentId: 34
    });
  });

  it('lists content attachments through the service', async () => {
    contentService.listAttachments.mockResolvedValue([{ id: 91 }] as never);

    await controller.listAttachments('12', '34', ['tenant_user'], '56');

    expect(contentService.listAttachments).toHaveBeenCalledWith('12', '34', ['tenant_user'], '56');
  });

  it('lists content comments through the service', async () => {
    contentService.listComments.mockResolvedValue([{ id: 91 }] as never);

    await controller.listComments('12', '34', ['tenant_user'], '56');

    expect(contentService.listComments).toHaveBeenCalledWith('12', '34', ['tenant_user'], '56');
  });

  it('loads an entry by slug through the service', async () => {
    contentService.getEntryBySlug.mockResolvedValue({ id: 56 } as never);

    const queryDto = new QueryContentEntriesDto();
    queryDto.scope = ContentQueryScope.PROJECT;
    queryDto.projectId = 12;

    await controller.getEntryBySlug('12', '34', ['tenant_user'], 'setup', queryDto);

    expect(contentService.getEntryBySlug).toHaveBeenCalledWith({
      tenantId: '12',
      userId: '34',
      roles: ['tenant_user'],
      slug: 'setup',
      scope: ContentQueryScope.PROJECT,
      projectId: 12
    });
  });

  it('creates an entry through the command bus', async () => {
    const dto = new CreateContentEntryDto();
    dto.title = 'Getting Started';
    dto.contentMarkdown = '# Getting Started';

    commandBus.execute.mockResolvedValue({ id: 1 });

    await controller.createEntry(
      '12',
      '34',
      'actor-34',
      ['tenant_user'],
      { requestId: 'req-1', correlationId: 'corr-1', causationId: 'cause-1' },
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateContentEntryCommand;
    expect(command).toBeInstanceOf(CreateContentEntryCommand);
    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_user']);
    expect(command.requestId).toBe('req-1');
  });

  it('creates an attachment through the command bus', async () => {
    const dto = new CreateContentAttachmentDto();
    dto.fileId = 101;

    commandBus.execute.mockResolvedValue({ id: 91 });

    await controller.createAttachment(
      '12',
      '34',
      'actor-34',
      ['tenant_user'],
      { requestId: 'req-attach', correlationId: 'corr-attach', causationId: 'cause-attach' },
      '56',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateContentAttachmentCommand;
    expect(command).toBeInstanceOf(CreateContentAttachmentCommand);
    expect(command.entryId).toBe('56');
    expect(command.dto.fileId).toBe(101);
  });

  it('creates a comment through the command bus', async () => {
    const dto = new CreateContentCommentDto();
    dto.bodyMarkdown = 'Looks good';

    commandBus.execute.mockResolvedValue({ id: 91 });

    await controller.createComment(
      '12',
      '34',
      'actor-34',
      ['tenant_user'],
      { requestId: 'req-comment', correlationId: 'corr-comment', causationId: 'cause-comment' },
      '56',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateContentCommentCommand;
    expect(command).toBeInstanceOf(CreateContentCommentCommand);
    expect(command.entryId).toBe('56');
    expect(command.dto.bodyMarkdown).toBe('Looks good');
  });

  it('updates an entry through the command bus', async () => {
    const dto = new UpdateContentEntryDto();
    dto.title = 'Updated';

    commandBus.execute.mockResolvedValue({ id: 56 });

    await controller.updateEntry(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      { requestId: 'req-2', correlationId: 'corr-2', causationId: 'cause-2' },
      '56',
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as UpdateContentEntryCommand;
    expect(command).toBeInstanceOf(UpdateContentEntryCommand);
    expect(command.entryId).toBe('56');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_admin']);
  });

  it('deletes an entry through the command bus', async () => {
    commandBus.execute.mockResolvedValue(undefined);

    await controller.deleteEntry(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      { requestId: 'req-3', correlationId: 'corr-3', causationId: 'cause-3' },
      '56'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as DeleteContentEntryCommand;
    expect(command).toBeInstanceOf(DeleteContentEntryCommand);
    expect(command.entryId).toBe('56');
    expect(command.userId).toBe('34');
    expect(command.actorId).toBe('actor-34');
    expect(command.roles).toEqual(['tenant_admin']);
  });

  it('deletes a comment through the command bus', async () => {
    commandBus.execute.mockResolvedValue(undefined);

    await controller.deleteComment(
      '12',
      '34',
      'actor-34',
      ['tenant_admin'],
      { requestId: 'req-4', correlationId: 'corr-4', causationId: 'cause-4' },
      '56',
      '91'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as DeleteContentCommentCommand;
    expect(command).toBeInstanceOf(DeleteContentCommentCommand);
    expect(command.entryId).toBe('56');
    expect(command.commentId).toBe('91');
    expect(command.userId).toBe('34');
  });

  it('uses dedicated content policy metadata and permissions on every route', () => {
    const controllerPrototype = PagesController.prototype;

    expect(Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.listEntries)).toEqual(
      { type: 'content', scope: 'tenant' }
    );
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.listEntries)).toBe(
      'list'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.listEntries)).toEqual([
      TENANT_PERMISSIONS.CONTENT_READ
    ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.getEntryBySlug)
    ).toEqual({ type: 'content', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.getEntryBySlug)).toBe(
      'read'
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.getEntryBySlug)
    ).toEqual([TENANT_PERMISSIONS.CONTENT_READ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.getEntryById)
    ).toEqual({ type: 'content', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.getEntryById)).toBe(
      'read'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.getEntryById)).toEqual(
      [TENANT_PERMISSIONS.CONTENT_READ]
    );

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.listAttachments)
    ).toEqual({ type: 'content', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.listAttachments)).toBe(
      'read'
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.listAttachments)
    ).toEqual([TENANT_PERMISSIONS.CONTENT_READ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.listComments)
    ).toEqual({ type: 'content_comments', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.listComments)).toBe(
      'read'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.listComments)).toEqual(
      [TENANT_PERMISSIONS.CONTENT_READ]
    );

    expect(Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.createEntry)).toEqual(
      { type: 'content', scope: 'tenant' }
    );
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.createEntry)).toBe(
      'create'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.createEntry)).toEqual([
      TENANT_PERMISSIONS.CONTENT_CREATE
    ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.createAttachment)
    ).toEqual({ type: 'content', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.createAttachment)).toBe(
      'write'
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.createAttachment)
    ).toEqual([TENANT_PERMISSIONS.CONTENT_UPDATE]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.createComment)
    ).toEqual({ type: 'content_comments', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.createComment)).toBe(
      'create'
    );
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.createComment)
    ).toEqual([TENANT_PERMISSIONS.CONTENT_UPDATE]);

    expect(Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.updateEntry)).toEqual(
      { type: 'content', scope: 'tenant' }
    );
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.updateEntry)).toBe(
      'write'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.updateEntry)).toEqual([
      TENANT_PERMISSIONS.CONTENT_UPDATE
    ]);

    expect(Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.deleteEntry)).toEqual(
      { type: 'content', scope: 'tenant' }
    );
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.deleteEntry)).toBe(
      'delete'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.deleteEntry)).toEqual([
      TENANT_PERMISSIONS.CONTENT_DELETE
    ]);

    expect(
      Reflect.getMetadata(OPA_RESOURCE_METADATA_KEY, controllerPrototype.deleteComment)
    ).toEqual({ type: 'content_comments', scope: 'tenant' });
    expect(Reflect.getMetadata(OPA_ACTION_METADATA_KEY, controllerPrototype.deleteComment)).toBe(
      'delete'
    );
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, controllerPrototype.deleteComment)).toBe(
      undefined
    );
  });
});
