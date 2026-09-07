import { JwtService } from '@nestjs/jwt';
import { files, users } from '@package/db-core';
import { eq } from 'drizzle-orm';
import request from 'supertest';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { createUserFixture } from '../../fixtures/user.fixture';
import { startTestServer } from '../../helpers/bootstrap';
import {
  cleanupOrganization,
  cleanupTenant,
  createTestOrganization,
  createTestUserTenant,
  setupE2ETestDatabaseJest
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

type TestRequestResponse = Awaited<ReturnType<TestServer['request']>>;

type UploadReservation = {
  file: { id: number };
  upload: { url: string };
};

type UserProfileResponse = {
  userId: string;
  photoUrl?: string;
  avatarFileId?: number;
};

function unwrapResponseData<T>(body: { data?: T } & Record<string, unknown>): T {
  return (body.data ?? body) as T;
}

async function reserveAvatarUpload(
  server: TestServer,
  token: string,
  organizationId: number
): Promise<UploadReservation> {
  const reserveResponse = await server.request({
    method: 'POST',
    url: '/v1/objects/uploads',
    headers: {
      'x-tenant-id': organizationId.toString(),
      Authorization: `Bearer ${token}`
    },
    body: {
      purpose: 'user_avatar',
      originalFilename: 'avatar.png',
      mimeType: 'image/png',
      byteSize: 7
    }
  });

  expect(reserveResponse.status).toBe(201);

  return unwrapResponseData<UploadReservation>(reserveResponse.body);
}

async function uploadAvatarBytes(
  server: TestServer,
  token: string,
  organizationId: number,
  fileId: number,
  payload = Buffer.from('payload')
): Promise<void> {
  const uploadResponse = await request(server.app.getHttpServer())
    .put(`/v1/objects/uploads/${fileId}/content`)
    .set('authorization', `Bearer ${token}`)
    .set('x-tenant-id', organizationId.toString())
    .set('content-type', 'image/png')
    .set('content-length', String(payload.length))
    .send(payload);

  expect(uploadResponse.status).toBe(200);
}

async function reserveAndUploadAvatar(
  server: TestServer,
  token: string,
  organizationId: number
): Promise<number> {
  const reservation = await reserveAvatarUpload(server, token, organizationId);
  await uploadAvatarBytes(server, token, organizationId, reservation.file.id);
  return reservation.file.id;
}

async function attachAvatar(
  server: TestServer,
  token: string,
  organizationId: number,
  fileId: number
): Promise<TestRequestResponse> {
  return server.request({
    method: 'PATCH',
    url: '/v1/iam/identity/avatar',
    headers: {
      'x-tenant-id': organizationId.toString(),
      Authorization: `Bearer ${token}`
    },
    body: {
      fileId
    }
  });
}

async function removeAvatar(
  server: TestServer,
  token: string,
  organizationId: number
): Promise<TestRequestResponse> {
  return server.request({
    method: 'DELETE',
    url: '/v1/iam/identity/avatar',
    headers: {
      'x-tenant-id': organizationId.toString(),
      Authorization: `Bearer ${token}`
    }
  });
}

describe('Avatar Upload E2E', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let jwtService: JwtService;
  let tenantId: number;
  let organizationId: number;
  let userId: number;
  let userToken: string;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();

    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    jwtService = server.app.get<JwtService>(JwtService);

    const organization = await createTestOrganization(server.app, 'Avatar Upload Org');
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
        email: `avatar-upload-${userId}@example.com`,
        name: 'Avatar Upload User',
        roles: ['tenant_owner'],
        permissions: ['*']
      },
      { expiresIn: '24h' }
    );
  });

  afterEach(async () => {
    if (db && userId) {
      await db.update(users).set({ avatarFileId: null }).where(eq(users.id, userId));
    }

    if (db && organizationId) {
      await db.delete(files).where(eq(files.organizationId, organizationId));
    }
  });

  afterAll(async () => {
    if (db && userId) {
      await db.update(users).set({ avatarFileId: null }).where(eq(users.id, userId));
    }

    if (db && organizationId) {
      await db.delete(files).where(eq(files.organizationId, organizationId));
    }

    if (server?.app && organizationId) {
      await cleanupOrganization(server.app, { tenantId, organizationId });
    }

    if (server?.app && tenantId) {
      await cleanupTenant(server.app, tenantId);
    }

    await server?.close();
  });

  it('uploads an avatar, attaches it, and returns resolved photoUrl in profile and members', async () => {
    const fileId = await reserveAndUploadAvatar(server, userToken, organizationId);
    const attachResponse = await attachAvatar(server, userToken, organizationId, fileId);

    expect(attachResponse.status).toBe(200);
    const attachedProfile = unwrapResponseData<UserProfileResponse>(attachResponse.body);
    expect(attachedProfile.avatarFileId).toBe(fileId);
    expect(attachedProfile.photoUrl).toBeTruthy();

    const profileResponse = await server.request({
      method: 'GET',
      url: '/v1/iam/identity',
      headers: {
        'x-tenant-id': organizationId.toString(),
        Authorization: `Bearer ${userToken}`
      }
    });

    expect(profileResponse.status).toBe(200);
    const profile = unwrapResponseData<UserProfileResponse>(profileResponse.body);
    expect(profile.avatarFileId).toBe(fileId);
    expect(profile.photoUrl).toContain('mock://storage/download/');

    const membersResponse = await server.request({
      method: 'GET',
      url: '/v1/workspaces/members?page=1&pageSize=20',
      headers: {
        'x-tenant-id': organizationId.toString(),
        Authorization: `Bearer ${userToken}`
      }
    });

    expect(membersResponse.status).toBe(200);
    const members = unwrapResponseData<Array<{ userId: string; photoUrl?: string }>>(
      membersResponse.body
    );
    const currentMember = members.find((member) => member.userId === userId.toString());

    expect(currentMember?.photoUrl).toContain('mock://storage/download/');
  });

  it('marks the previous avatar pending_delete when a new avatar replaces it', async () => {
    const firstFileId = await reserveAndUploadAvatar(server, userToken, organizationId);
    const secondFileId = await reserveAndUploadAvatar(server, userToken, organizationId);

    const firstAttachResponse = await attachAvatar(server, userToken, organizationId, firstFileId);
    expect(firstAttachResponse.status).toBe(200);

    const secondAttachResponse = await attachAvatar(
      server,
      userToken,
      organizationId,
      secondFileId
    );
    expect(secondAttachResponse.status).toBe(200);

    const updatedProfile = unwrapResponseData<UserProfileResponse>(secondAttachResponse.body);
    expect(updatedProfile.avatarFileId).toBe(secondFileId);

    const [currentUser] = await db
      .select({ avatarFileId: users.avatarFileId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    expect(currentUser?.avatarFileId).toBe(secondFileId);

    const [firstFile, secondFile] = await Promise.all([
      db.select().from(files).where(eq(files.id, firstFileId)).limit(1),
      db.select().from(files).where(eq(files.id, secondFileId)).limit(1)
    ]);

    expect(firstFile[0]?.deletedAt).toBeInstanceOf(Date);
    expect(secondFile[0]?.deletedAt).toBeNull();
  });

  it('removes the current avatar and marks its file pending_delete', async () => {
    const fileId = await reserveAndUploadAvatar(server, userToken, organizationId);
    await db
      .update(users)
      .set({ photoUrl: 'https://legacy.example.test/avatar.png' })
      .where(eq(users.id, userId));
    const attachResponse = await attachAvatar(server, userToken, organizationId, fileId);
    expect(attachResponse.status).toBe(200);

    const removeResponse = await removeAvatar(server, userToken, organizationId);
    expect(removeResponse.status).toBe(200);

    const removedProfile = unwrapResponseData<UserProfileResponse>(removeResponse.body);
    expect(Object.prototype.hasOwnProperty.call(removedProfile, 'photoUrl')).toBe(true);
    expect(removedProfile.avatarFileId).toBeNull();
    expect(removedProfile.photoUrl).toBeNull();

    const [currentUser] = await db
      .select({ avatarFileId: users.avatarFileId, photoUrl: users.photoUrl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    expect(currentUser?.avatarFileId).toBeNull();
    expect(currentUser?.photoUrl).toBeNull();

    const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
    expect(file?.deletedAt).toBeInstanceOf(Date);
  });

  it('does not delete the active avatar file when the same file is reattached', async () => {
    const fileId = await reserveAndUploadAvatar(server, userToken, organizationId);

    const firstAttachResponse = await attachAvatar(server, userToken, organizationId, fileId);
    expect(firstAttachResponse.status).toBe(200);

    const secondAttachResponse = await attachAvatar(server, userToken, organizationId, fileId);
    expect(secondAttachResponse.status).toBe(200);

    const profile = unwrapResponseData<UserProfileResponse>(secondAttachResponse.body);
    expect(profile.avatarFileId).toBe(fileId);

    const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
    expect(file?.deletedAt).toBeNull();
  });
});
