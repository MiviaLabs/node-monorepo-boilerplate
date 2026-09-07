import { JwtService } from '@nestjs/jwt';
import { files, issueAttachments } from '@package/db-core';
import { StorageRegistryService } from '@package/storage';
import { and, eq, isNull } from 'drizzle-orm';
import request from 'supertest';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { createUserFixture } from '../../fixtures/user.fixture';
import { startTestServer, waitForServiceInitialization } from '../../helpers/bootstrap';
import {
  cleanupTenant,
  createTestOrganization,
  createTestUserTenant,
  setupE2ETestDatabaseJest
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Response } from 'superagent';

type UploadReservation = {
  file: { id: number; objectKey: string; status: string };
  upload: { transport: string; url: string };
};

function unwrapResponseData<T>(body: { data?: T } & Record<string, unknown>): T {
  return (body.data ?? body) as T;
}

function binaryParser(res: Response, callback: (err: Error | null, data: Buffer) => void): void {
  const chunks: Buffer[] = [];

  res.on('data', (chunk: Buffer | string) => {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  });

  res.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
}

function createToken(
  jwtService: JwtService,
  userId: number,
  tenantId: number,
  permissions: string[]
): string {
  return jwtService.sign(
    {
      sub: userId.toString(),
      db_user_id: userId.toString(),
      tenant_id: tenantId.toString(),
      actor_id: userId.toString(),
      email: `issue-attachments-${userId}@example.com`,
      name: 'Issue Attachments User',
      roles: ['tenant_admin'],
      permissions
    },
    { expiresIn: '24h' }
  );
}

describe('Issue Attachments E2E', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let db: NodePgDatabase<Record<string, never>>;
  let storageRegistry: StorageRegistryService;

  let tenantId: number;
  let organizationId: number;
  let writerUserId: number;
  let writerToken: string;
  let issueId: number;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    jwtService = server.app.get(JwtService);
    db = server.app.get(MAIN_DB);
    storageRegistry = server.app.get(StorageRegistryService);

    const organization = await createTestOrganization(server.app, 'Issue Attachments Org');
    tenantId = organization.tenantId;
    organizationId = organization.organizationId;

    const writer = await createUserFixture(server.app, { organizationId });
    writerUserId = writer.id;

    await createTestUserTenant(server.app, writerUserId, tenantId, 'tenant_admin', true);

    writerToken = createToken(jwtService, writerUserId, tenantId, [
      'tenant:issues:create',
      'tenant:issues:read',
      'tenant:issues:update',
      'tenant:issues:delete'
    ]);

    await waitForServiceInitialization(server, { maxWait: 30000 });

    const createIssueResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Issue with attachments',
        descriptionMarkdown: 'Testing issue attachment uploads.',
        priority: 'medium'
      }
    });

    expect(createIssueResponse.status).toBe(201);
    issueId = (createIssueResponse.body as { data?: { id?: number } }).data?.id ?? 0;
    expect(issueId).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await cleanupTenant(server.app, tenantId);
    await server.close();
  });

  it('reserves, uploads, attaches, lists, and soft deletes an issue attachment through the issue-scoped flow', async () => {
    const reserveResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/attachments/uploads`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        originalFilename: 'design-spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 7,
        transport: 'api_proxy'
      }
    });

    expect(reserveResponse.status).toBe(201);
    const reservation = unwrapResponseData<UploadReservation>(reserveResponse.body);
    expect(reservation.file.status).toBe('pending_upload');
    expect(reservation.upload.transport).toBe('api_proxy');
    expect(reservation.file.objectKey).toContain(`org/${organizationId}/issue/${issueId}/`);

    const uploadResponse = await request(server.app.getHttpServer())
      .put(`/v1/objects/uploads/${reservation.file.id}/content`)
      .set('authorization', `Bearer ${writerToken}`)
      .set('x-tenant-id', String(organizationId))
      .set('content-type', 'application/pdf')
      .set('content-length', '7')
      .send(Buffer.from('payload'));

    expect(uploadResponse.status).toBe(200);

    const attachResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/attachments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        fileId: reservation.file.id
      }
    });

    expect(attachResponse.status).toBe(201);
    const attachment = unwrapResponseData<{ id: number; fileId: number; objectKey: string }>(
      attachResponse.body
    );
    expect(attachment.fileId).toBe(reservation.file.id);
    expect(attachment.objectKey).toContain(`/issue/${issueId}/`);

    const listResponse = await server.request({
      method: 'GET',
      url: `/v1/tickets/${issueId}/attachments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(listResponse.status).toBe(200);
    const attachments = unwrapResponseData<Array<{ id: number; fileId: number }>>(
      listResponse.body
    );
    expect(
      attachments.some((row) => row.id === attachment.id && row.fileId === reservation.file.id)
    ).toBe(true);

    const [persistedFile] = await db
      .select()
      .from(files)
      .where(eq(files.id, reservation.file.id))
      .limit(1);

    expect(persistedFile?.objectKey).toContain(`/issue/${issueId}/`);
    expect(persistedFile?.status).toBe('ready');
    expect((persistedFile?.metadata as { issueId?: number } | null)?.issueId).toBe(issueId);

    const provider = storageRegistry.get(persistedFile?.storageInstance ?? 'uploads');
    const objectHead = await provider.headObject({
      bucket: persistedFile?.bucket,
      key: persistedFile?.objectKey ?? ''
    });
    expect(objectHead.contentLength).toBe(7);

    const downloadResponse = await request(server.app.getHttpServer())
      .get(`/v1/tickets/${issueId}/attachments/${attachment.id}/content`)
      .set('authorization', `Bearer ${writerToken}`)
      .set('x-tenant-id', String(organizationId))
      .buffer(true)
      .parse(binaryParser);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers['content-type']).toContain('application/pdf');
    expect(downloadResponse.headers['content-disposition']).toContain('design-spec.pdf');
    expect(Buffer.isBuffer(downloadResponse.body)).toBe(true);
    expect(downloadResponse.body.toString()).toBe('payload');

    const deleteResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${issueId}/attachments/${attachment.id}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(deleteResponse.status).toBe(204);

    const downloadAfterDeleteResponse = await request(server.app.getHttpServer())
      .get(`/v1/tickets/${issueId}/attachments/${attachment.id}/content`)
      .set('authorization', `Bearer ${writerToken}`)
      .set('x-tenant-id', String(organizationId));

    expect(downloadAfterDeleteResponse.status).toBe(404);

    const [deletedAttachmentRow] = await db
      .select({ deletedAt: issueAttachments.deletedAt })
      .from(issueAttachments)
      .where(eq(issueAttachments.id, attachment.id))
      .limit(1);
    expect(deletedAttachmentRow?.deletedAt).not.toBeNull();

    const [deletedFile] = await db
      .select({ status: files.status, deletedAt: files.deletedAt, purgedAt: files.purgedAt })
      .from(files)
      .where(eq(files.id, reservation.file.id))
      .limit(1);
    expect(deletedFile?.status).toBe('pending_delete');
    expect(deletedFile?.deletedAt).not.toBeNull();
    expect(deletedFile?.purgedAt).toBeNull();

    const deleteAgainResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${issueId}/attachments/${attachment.id}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(deleteAgainResponse.status).toBe(204);

    const [activeAttachment] = await db
      .select({ id: issueAttachments.id })
      .from(issueAttachments)
      .where(and(eq(issueAttachments.id, attachment.id), isNull(issueAttachments.deletedAt)))
      .limit(1);
    expect(activeAttachment).toBeUndefined();
  });

  it('rejects generic storage reservations for issue attachments without issue context', async () => {
    const response = await server.request({
      method: 'POST',
      url: '/v1/objects/uploads',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        purpose: 'issue_attachment',
        originalFilename: 'blocked.pdf',
        mimeType: 'application/pdf',
        byteSize: 7
      }
    });

    expect(response.status).toBe(400);
  });
});
