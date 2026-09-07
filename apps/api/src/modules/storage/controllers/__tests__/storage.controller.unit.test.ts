import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import {
  CompleteFileUploadCommand,
  CreateFileUploadCommand,
  DeleteFileCommand,
  UploadFileContentCommand
} from '../../commands';
import { CreateFileUploadDto } from '../../dto';
import { GetFileDownloadUrlQuery, GetFileQuery } from '../../queries';
import { ObjectsController } from '../storage.controller';

import type { TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { JwtAuthGuard } from '@/modules/auth/guards';

describe('ObjectsController', () => {
  let controller: ObjectsController;
  let commandBus: jest.Mocked<CommandBus>;
  let queryBus: jest.Mocked<QueryBus>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ObjectsController],
      providers: [
        {
          provide: CommandBus,
          useValue: { execute: jest.fn() }
        },
        {
          provide: QueryBus,
          useValue: { execute: jest.fn() }
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ObjectsController);
    commandBus = module.get(CommandBus) as jest.Mocked<CommandBus>;
    queryBus = module.get(QueryBus) as jest.Mocked<QueryBus>;
  });

  it('creates an upload reservation through the command bus', async () => {
    const dto = new CreateFileUploadDto();
    dto.purpose = 'issue_attachment';
    dto.originalFilename = 'design-spec.pdf';
    dto.mimeType = 'application/pdf';
    dto.byteSize = 512;

    commandBus.execute.mockResolvedValue({ file: { id: 1 }, upload: { url: 'x' } });

    await controller.createUpload(
      '12',
      '34',
      '34',
      ['tenant_user'],
      { requestId: 'req-1', correlationId: 'corr-1', causationId: 'cause-1' },
      dto
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CreateFileUploadCommand;
    expect(command).toBeInstanceOf(CreateFileUploadCommand);
    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.dto).toBe(dto);
    expect(command.requestId).toBe('req-1');
  });

  it('completes an upload through the command bus', async () => {
    commandBus.execute.mockResolvedValue({ id: 1 });

    await controller.completeUpload(
      '12',
      '34',
      '34',
      ['tenant_user'],
      { requestId: 'req-2', correlationId: 'corr-2', causationId: 'cause-2' },
      '88'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as CompleteFileUploadCommand;
    expect(command).toBeInstanceOf(CompleteFileUploadCommand);
    expect(command.fileId).toBe('88');
    expect(command.userId).toBe('34');
  });

  it('loads a file through the query bus', async () => {
    queryBus.execute.mockResolvedValue({ id: 91 });

    await controller.getFile('12', '34', '91');

    const query = queryBus.execute.mock.calls[0]?.[0] as GetFileQuery;
    expect(query).toBeInstanceOf(GetFileQuery);
    expect(query.tenantId).toBe('12');
    expect(query.userId).toBe('34');
    expect(query.fileId).toBe('91');
  });

  it('generates a download url through the query bus', async () => {
    queryBus.execute.mockResolvedValue({ url: 'https://example.test' });

    await controller.getDownloadUrl(
      '12',
      '34',
      '34',
      { requestId: 'req-3', correlationId: 'corr-3', causationId: 'cause-3' },
      '91'
    );

    const query = queryBus.execute.mock.calls[0]?.[0] as GetFileDownloadUrlQuery;
    expect(query).toBeInstanceOf(GetFileDownloadUrlQuery);
    expect(query.tenantId).toBe('12');
    expect(query.userId).toBe('34');
    expect(query.actorId).toBe('34');
    expect(query.fileId).toBe('91');
    expect(query.requestId).toBe('req-3');
  });

  it('deletes a file through the command bus', async () => {
    commandBus.execute.mockResolvedValue({ id: 91, status: 'pending_delete' });

    await controller.deleteFile(
      '12',
      '34',
      '34',
      ['tenant_user'],
      { requestId: 'req-4', correlationId: 'corr-4', causationId: 'cause-4' },
      '91'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as DeleteFileCommand;
    expect(command).toBeInstanceOf(DeleteFileCommand);
    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.fileId).toBe('91');
    expect(command.requestId).toBe('req-4');
  });

  it('uploads file content through the command bus', async () => {
    const request = { pipe: jest.fn() } as unknown as Request;
    commandBus.execute.mockResolvedValue({ id: 91, status: 'ready' });

    await controller.uploadFileContent(
      '12',
      '34',
      '34',
      ['tenant_user'],
      { requestId: 'req-5', correlationId: 'corr-5', causationId: 'cause-5' },
      '91',
      request,
      'application/pdf',
      '512'
    );

    const command = commandBus.execute.mock.calls[0]?.[0] as UploadFileContentCommand;
    expect(command).toBeInstanceOf(UploadFileContentCommand);
    expect(command.tenantId).toBe('12');
    expect(command.userId).toBe('34');
    expect(command.fileId).toBe('91');
    expect(command.body).toBe(request);
    expect(command.contentType).toBe('application/pdf');
    expect(command.contentLength).toBe('512');
    expect(command.readonly).toBe(true);
    expect(command.requestId).toBe('req-5');
  });
});
