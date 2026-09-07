import { JwtService } from '@nestjs/jwt';
import { files } from '@package/db-core';
import { StorageRegistryService } from '@package/storage';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { createUserFixture, deleteUserFixture } from '../../fixtures/user.fixture';
import { startTestServer } from '../../helpers/bootstrap';
import {
  cleanupOrganization,
  cleanupTenant,
  createTestOrganization,
  createTestUserTenant,
  setupE2ETestDatabaseJest
} from '../../helpers/database';

import type { FileUploadTransport } from '../../../src/modules/storage/dto/create-file-upload.dto';
import type { TestServer } from '../../helpers/bootstrap';
import type { SignedUrlMethod } from '@package/storage';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type ReservedUpload = {
  file: {
    id: number;
    status: string;
  };
  upload: {
    transport: FileUploadTransport;
    url: string;
    method: SignedUrlMethod;
    headers?: Record<string, string>;
  };
};

type FileResponse = {
  id: number;
  status: string;
  etag: string | null;
  bucket: string;
  objectKey: string;
  mimeType: string | null;
  byteSize: number;
  uploadedAt: string | Date | null;
};

function unwrapResponseData<T>(body: { data?: T } & Record<string, unknown>): T {
  return (body.data ?? body) as T;
}

async function readStreamBody(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }

  return Buffer.concat(chunks);
}

describe('Storage Upload E2E', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let jwtService: JwtService;
  let storageRegistry: StorageRegistryService;
  let tenantId: number;
  let organizationId: number;
  let userId: number;
  let userToken: string;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();

    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    jwtService = server.app.get<JwtService>(JwtService);
    storageRegistry = server.app.get<StorageRegistryService>(StorageRegistryService);

    const organization = await createTestOrganization(server.app, 'Storage Upload Org');
    tenantId = organization.tenantId;
    organizationId = organization.organizationId;

    const user = await createUserFixture(server.app, { organizationId });
    userId = user.id;

    await createTestUserTenant(server.app, userId, tenantId, 'tenant_owner', true);

    userToken = jwtService.sign(
      {
        sub: userId.toString(),
        db_user_id: userId.toString(),
        tenant_id: tenantId.toString(),
        actor_id: userId.toString(),
        email: `storage-upload-${userId}@example.com`,
        name: 'Storage Upload User',
        roles: ['tenant_owner'],
        permissions: ['*']
      },
      { expiresIn: '24h' }
    );
  });

  afterAll(async () => {
    if (db && organizationId) {
      await db.delete(files).where(eq(files.organizationId, organizationId));
    }

    if (server?.app && userId && organizationId) {
      await deleteUserFixture(server.app, organizationId, userId);
    }

    if (server?.app && organizationId) {
      await cleanupOrganization(server.app, { tenantId, organizationId });
    }

    if (server?.app && tenantId) {
      await cleanupTenant(server.app, tenantId);
    }

    await server?.close();
  });

  it('streams uploaded bytes through the API and persists a ready file', async () => {
    const reserveResponse = await server.request({
      method: 'POST',
      url: '/v1/objects/uploads',
      headers: {
        'x-tenant-id': organizationId.toString(),
        Authorization: `Bearer ${userToken}`
      },
      body: {
        purpose: 'content_upload',
        originalFilename: 'spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 7
      }
    });

    expect(reserveResponse.status).toBe(201);

    const reservation = unwrapResponseData<ReservedUpload>(reserveResponse.body);
    expect(reservation.upload.transport).toBe('api_proxy');
    expect(reservation.upload.method).toBe('PUT');
    expect(reservation.upload.url).toBe(`/v1/objects/uploads/${reservation.file.id}/content`);
    expect(reservation.file.status).toBe('pending_upload');

    const uploadResponse = await request(server.app.getHttpServer())
      .put(`/v1/objects/uploads/${reservation.file.id}/content`)
      .set('authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', organizationId.toString())
      .set('content-type', 'application/pdf')
      .set('content-length', '7')
      .send(Buffer.from('payload'));

    expect(uploadResponse.status).toBe(200);

    const uploadedFile = unwrapResponseData<FileResponse>(uploadResponse.body);
    expect(uploadedFile.id).toBe(reservation.file.id);
    expect(uploadedFile.status).toBe('ready');
    expect(uploadedFile.mimeType).toBe('application/pdf');
    expect(uploadedFile.byteSize).toBe(7);
    expect(uploadedFile.uploadedAt).toBeTruthy();
    expect(uploadedFile.etag).toBeTruthy();

    const [persistedFile] = await db
      .select()
      .from(files)
      .where(eq(files.id, reservation.file.id))
      .limit(1);

    expect(persistedFile).toBeDefined();
    expect(persistedFile?.organizationId).toBe(organizationId);
    expect(persistedFile?.uploadedByUserId).toBe(userId);
    expect(persistedFile?.status).toBe('ready');
    expect(persistedFile?.purpose).toBe('content_upload');
    expect(persistedFile?.mimeType).toBe('application/pdf');
    expect(persistedFile?.byteSize).toBe(7);
    expect(persistedFile?.uploadedAt).toBeTruthy();
    expect(persistedFile?.etag).toBeTruthy();

    const provider = storageRegistry.get(persistedFile?.storageInstance ?? 'default');
    const objectHead = await provider.headObject({
      bucket: persistedFile?.bucket,
      key: persistedFile?.objectKey ?? ''
    });
    const objectRead = await provider.getObject({
      bucket: persistedFile?.bucket,
      key: persistedFile?.objectKey ?? ''
    });

    expect(objectHead.contentType).toBe('application/pdf');
    expect(objectHead.contentLength).toBe(7);

    const objectBody = await readStreamBody(objectRead.body);
    expect(objectBody.equals(Buffer.from('payload'))).toBe(true);
  });
});
