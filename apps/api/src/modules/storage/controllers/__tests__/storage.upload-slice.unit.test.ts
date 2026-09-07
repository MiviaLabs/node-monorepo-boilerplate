import { beforeEach, afterEach, describe, expect, it } from '@jest/globals';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { SignedUrlMethod, StorageRegistryService } from '@package/storage';
import request from 'supertest';

import {
  CompleteFileUploadHandler,
  CreateFileUploadHandler,
  UploadFileContentHandler
} from '../../handlers';
import { FileRepository } from '../../repositories';
import { FileRoutingService, StorageFilesService } from '../../services';
import { ObjectsController } from '../storage.controller';

import type { ExecutionContext, INestApplication, CanActivate } from '@nestjs/common';
import type { File as DbFile } from '@package/db-core';
import type { IStorageProvider } from '@package/storage';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { JwtAuthGuard } from '@/modules/auth/guards';

class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Record<string, unknown> & {
        user?: Record<string, unknown>;
        tenantContext?: { tenantId: string };
      }
    >();

    req.user = {
      userId: '34',
      tenantId: '12',
      actorId: '34',
      roles: ['tenant_user']
    };
    req.tenantContext = { tenantId: '12' };
    return true;
  }
}

type InMemoryFileRepository = Pick<
  FileRepository,
  | 'allocateIdWithDatabase'
  | 'createWithDatabase'
  | 'findByIdOrThrow'
  | 'findByIdOrThrowWithDatabase'
  | 'markUploadReadyWithDatabase'
>;

describe('Storage upload API slice', () => {
  let app: INestApplication;
  let storedFile: DbFile | null;

  beforeEach(async () => {
    storedFile = null;

    const fileRepository: InMemoryFileRepository = {
      allocateIdWithDatabase: async () => 101,
      createWithDatabase: async (_database, tenantId, data) => {
        storedFile = {
          organizationId: tenantId,
          uploadedAt: null,
          lastAccessedAt: null,
          deletedAt: null,
          purgedAt: null,
          createdAt: new Date('2026-03-25T00:00:00.000Z'),
          updatedAt: new Date('2026-03-25T00:00:00.000Z'),
          ...data
        } as DbFile;

        return storedFile;
      },
      findByIdOrThrow: async (_tenantId, fileId) => {
        if (storedFile?.id !== fileId) {
          throw new Error('File not found');
        }

        return storedFile;
      },
      findByIdOrThrowWithDatabase: async (_database, _tenantId, fileId) => {
        if (storedFile?.id !== fileId) {
          throw new Error('File not found');
        }

        return storedFile;
      },
      markUploadReadyWithDatabase: async (_database, _tenantId, fileId, updates) => {
        if (storedFile?.id !== fileId) {
          throw new Error('File not found');
        }

        storedFile = {
          ...storedFile,
          status: 'ready',
          byteSize: updates.byteSize,
          etag: updates.etag ?? null,
          mimeType: updates.mimeType ?? null,
          uploadedAt: updates.uploadedAt ?? null,
          updatedAt: updates.updatedAt
        };

        return storedFile as DbFile;
      }
    };

    const routingService: Pick<FileRoutingService, 'resolve'> = {
      resolve: () => ({
        instanceName: 'uploads',
        objectKey: 'org/12/uploads/content_upload/101/spec.pdf'
      })
    };

    const provider: Pick<IStorageProvider, 'getSignedUploadUrl' | 'putObject'> = {
      getSignedUploadUrl: async () => ({
        url: 'https://upload.example.test',
        method: SignedUrlMethod.PUT,
        expiresAt: new Date('2026-03-26T00:00:00.000Z'),
        bucket: 'app-uploads',
        key: 'org/12/uploads/content_upload/101/spec.pdf'
      }),
      putObject: async (input) => {
        const chunks: Buffer[] = [];
        for await (const chunk of input.body) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
        }

        expect(Buffer.concat(chunks).toString('utf8')).toBe('payload');

        return {
          bucket: 'app-uploads',
          key: input.key,
          etag: 'etag-uploaded'
        };
      }
    };

    const storageRegistry: Pick<StorageRegistryService, 'get'> = {
      get: () => provider as IStorageProvider
    };

    const auditOutbox: Pick<AuditOutboxPublisher, 'insert'> = {
      insert: async () => undefined
    };

    const db = {
      transaction: async <T>(
        callback: (tx: { execute: (_query: unknown) => Promise<void> }) => Promise<T>
      ): Promise<T> =>
        callback({
          execute: async () => undefined
        })
    };

    const module = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [ObjectsController],
      providers: [
        StorageFilesService,
        CreateFileUploadHandler,
        CompleteFileUploadHandler,
        UploadFileContentHandler,
        { provide: FileRepository, useValue: fileRepository },
        { provide: FileRoutingService, useValue: routingService },
        { provide: StorageRegistryService, useValue: storageRegistry },
        { provide: AuditOutboxPublisher, useValue: auditOutbox },
        { provide: MAIN_DB, useValue: db }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AuthenticatedGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reserves and uploads a file through the real controller/cqrs/service path', async () => {
    const reserveResponse = await request(app.getHttpServer())
      .post('/v1/objects/uploads')
      .send({
        purpose: 'content_upload',
        originalFilename: 'spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 7
      })
      .expect(201);

    expect(reserveResponse.body.upload.transport).toBe('api_proxy');
    expect(reserveResponse.body.upload.url).toBe('/v1/objects/uploads/101/content');

    const uploadResponse = await request(app.getHttpServer())
      .put('/v1/objects/uploads/101/content')
      .set('content-type', 'application/pdf')
      .set('content-length', '7')
      .send(Buffer.from('payload'))
      .expect(200);

    expect(uploadResponse.body.status).toBe('ready');
    expect(uploadResponse.body.etag).toBe('etag-uploaded');
  });
});
