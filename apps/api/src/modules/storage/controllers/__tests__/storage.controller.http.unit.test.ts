import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { UploadFileContentCommand } from '../../commands';
import { ObjectsController } from '../storage.controller';

import type { ExecutionContext, INestApplication, CanActivate } from '@nestjs/common';

import { JwtAuthGuard } from '@/modules/auth/guards';

class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Record<string, unknown> & {
        user?: Record<string, unknown>;
        tenantContext?: { tenantId: string };
      }
    >();

    request.user = {
      userId: '34',
      tenantId: '12',
      actorId: '34',
      roles: ['tenant_user']
    };
    request.tenantContext = { tenantId: '12' };

    return true;
  }
}

describe('ObjectsController HTTP upload route', () => {
  let app: INestApplication;
  let commandBus: jest.Mocked<CommandBus>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
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
      .useClass(AuthenticatedGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();

    commandBus = module.get(CommandBus) as jest.Mocked<CommandBus>;
  });

  afterEach(async () => {
    await app.close();
  });

  it('passes octet-stream bytes through the upload command body stream', async () => {
    const payload = Buffer.from('payload');

    commandBus.execute.mockImplementation(async (command: unknown) => {
      expect(command).toBeInstanceOf(UploadFileContentCommand);

      const uploadCommand = command as UploadFileContentCommand;
      const chunks: Buffer[] = [];
      for await (const chunk of uploadCommand.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }

      expect(Buffer.concat(chunks)).toEqual(payload);
      expect(uploadCommand.contentType).toBe('application/octet-stream');
      expect(uploadCommand.contentLength).toBe(String(payload.byteLength));

      return { id: 91, status: 'ready' };
    });

    await request(app.getHttpServer())
      .put('/v1/objects/uploads/91/content')
      .set('content-type', 'application/octet-stream')
      .set('content-length', String(payload.byteLength))
      .send(payload)
      .expect(200);
  });
});
