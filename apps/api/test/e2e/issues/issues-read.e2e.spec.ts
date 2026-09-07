import { JwtService } from '@nestjs/jwt';
import {
  issueActivity,
  issueAssignees,
  issueComments,
  issueWatchers,
  issues,
  projectMembers,
  projects
} from '@package/db-core';
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

type UploadReservation = {
  file: { id: number };
  upload: { url: string };
};

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
  return (reserveResponse.body.data ?? reserveResponse.body) as UploadReservation;
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

async function reserveAndAttachAvatar(
  server: TestServer,
  token: string,
  organizationId: number
): Promise<void> {
  const reservation = await reserveAvatarUpload(server, token, organizationId);
  await uploadAvatarBytes(server, token, organizationId, reservation.file.id);

  const attachResponse = await server.request({
    method: 'PATCH',
    url: '/v1/iam/identity/avatar',
    headers: {
      'x-tenant-id': organizationId.toString(),
      Authorization: `Bearer ${token}`
    },
    body: {
      fileId: reservation.file.id
    }
  });

  expect(attachResponse.status).toBe(200);
}

describe('Issues Read E2E', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let db: NodePgDatabase<Record<string, never>>;

  let tenantId: number;
  let organizationId: number;
  let creatorUserId: number;
  let memberUserId: number;
  let outsiderUserId: number;
  let privateProjectIssueId: number;
  let orgIssueId: number;

  let creatorToken: string;
  let memberToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    jwtService = server.app.get(JwtService);
    db = server.app.get(MAIN_DB);

    const organization = await createTestOrganization(server.app, 'Issues Read Org');
    tenantId = organization.tenantId;
    organizationId = organization.organizationId;

    const creator = await createUserFixture(server.app, { organizationId });
    const member = await createUserFixture(server.app, { organizationId });
    const outsider = await createUserFixture(server.app, { organizationId });

    creatorUserId = creator.id;
    memberUserId = member.id;
    outsiderUserId = outsider.id;

    await createTestUserTenant(server.app, creatorUserId, tenantId, 'tenant_user', true);
    await createTestUserTenant(server.app, memberUserId, tenantId, 'tenant_user', false);
    await createTestUserTenant(server.app, outsiderUserId, tenantId, 'tenant_user', false);

    creatorToken = createToken(jwtService, creatorUserId, tenantId, ['*']);
    memberToken = createToken(jwtService, memberUserId, tenantId, ['*']);
    outsiderToken = createToken(jwtService, outsiderUserId, tenantId, ['*']);

    const [privateProject] = await db
      .insert(projects)
      .values({
        organizationId,
        key: 'PREAD',
        name: 'Private Atlas',
        visibility: 'private',
        createdBy: creatorUserId
      })
      .returning();

    if (!privateProject) {
      throw new Error('Failed to create private project fixture');
    }

    await db.insert(projectMembers).values({
      projectId: privateProject.id,
      userId: memberUserId,
      assignedByUserId: creatorUserId
    });

    const createdIssues = await db
      .insert(issues)
      .values([
        {
          organizationId,
          projectId: null,
          issueNumber: 101,
          title: 'Org issue',
          descriptionMarkdown: 'Visible to all tenant readers.',
          status: 'backlog',
          priority: 'medium',
          position: 0,
          createdBy: creatorUserId,
          updatedBy: creatorUserId
        },
        {
          organizationId,
          projectId: privateProject.id,
          issueNumber: 102,
          title: 'Private project issue',
          descriptionMarkdown: 'Visible only to creator and project members.',
          status: 'in_progress',
          priority: 'high',
          position: 0,
          createdBy: creatorUserId,
          updatedBy: creatorUserId
        }
      ])
      .returning();

    const [createdOrgIssue, createdPrivateIssue] = createdIssues;
    if (!createdOrgIssue || !createdPrivateIssue) {
      throw new Error('Failed to create issue fixtures');
    }

    orgIssueId = createdOrgIssue.id;
    privateProjectIssueId = createdPrivateIssue.id;

    await db.insert(issueAssignees).values({
      issueId: privateProjectIssueId,
      userId: memberUserId,
      assignedByUserId: creatorUserId
    });

    await db.insert(issueWatchers).values({
      issueId: privateProjectIssueId,
      userId: creatorUserId,
      addedByUserId: creatorUserId
    });

    await db.insert(issueComments).values({
      organizationId,
      issueId: privateProjectIssueId,
      authorUserId: creatorUserId,
      parentCommentId: null,
      bodyMarkdown: 'Avatar-rich issue comment.',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
      deletedAt: null
    });

    await db.insert(issueActivity).values({
      organizationId,
      issueId: privateProjectIssueId,
      actorUserId: creatorUserId,
      activityType: 'issue.created',
      metadataJson: { seeded: true },
      createdAt: new Date('2026-03-28T10:05:00.000Z')
    });

    await waitForServiceInitialization(server, { maxWait: 30000 });
    await reserveAndAttachAvatar(server, creatorToken, organizationId);
    await reserveAndAttachAvatar(server, memberToken, organizationId);
  });

  afterAll(async () => {
    await cleanupTenant(server.app, tenantId);
    await server.close();
  });

  it('lists org-wide and private project issues for the creator', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${creatorToken}`
      }
    });

    expect(response.status).toBe(200);
    const data =
      (
        response.body as {
          data?: Array<{ id: number; assignees?: Array<{ photoUrl: string | null }> }>;
        }
      ).data ?? [];
    expect(data.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([orgIssueId, privateProjectIssueId])
    );
    expect(
      data.find((issue) => issue.id === privateProjectIssueId)?.assignees?.[0]?.photoUrl
    ).toContain('mock://storage/download/');
  });

  it('hides private project issues from non-members in the aggregated list', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${outsiderToken}`
      }
    });

    expect(response.status).toBe(200);
    const data = (response.body as { data?: Array<{ id: number }> }).data ?? [];
    expect(data.map((issue) => issue.id)).toContain(orgIssueId);
    expect(data.map((issue) => issue.id)).not.toContain(privateProjectIssueId);
  });

  it('allows a project member to read the private project issue detail', async () => {
    const response = await server.request({
      method: 'GET',
      url: `/v1/tickets/${privateProjectIssueId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${memberToken}`
      }
    });

    expect(response.status).toBe(200);
    const issue = (response.body as { data?: Record<string, unknown> }).data as
      | {
          id?: number;
          assignees?: Array<{ photoUrl: string | null }>;
          watchers?: Array<{ userId: number; photoUrl: string | null }>;
          comments?: Array<{ authorPhotoUrl: string | null }>;
          activity?: Array<{ actorPhotoUrl: string | null }>;
        }
      | undefined;
    expect(issue?.id).toBe(privateProjectIssueId);
    expect(issue?.assignees?.[0]?.photoUrl).toContain('mock://storage/download/');
    expect(
      issue?.watchers?.find((watcher) => watcher.userId === creatorUserId)?.photoUrl
    ).toContain('mock://storage/download/');
    expect(issue?.comments?.[0]?.authorPhotoUrl).toContain('mock://storage/download/');
    expect(issue?.activity?.[0]?.actorPhotoUrl).toContain('mock://storage/download/');
  });

  it('filters visible issues by assignee and watcher user ids', async () => {
    const assignedResponse = await server.request({
      method: 'GET',
      url: `/v1/issues?assigneeUserId=${memberUserId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${memberToken}`
      }
    });

    expect(assignedResponse.status).toBe(200);
    expect(
      (assignedResponse.body as { data?: Array<{ id: number }> }).data?.map((issue) => issue.id)
    ).toEqual([privateProjectIssueId]);

    const watchingResponse = await server.request({
      method: 'GET',
      url: `/v1/issues?watcherUserId=${creatorUserId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${creatorToken}`
      }
    });

    expect(watchingResponse.status).toBe(200);
    expect(
      (watchingResponse.body as { data?: Array<{ id: number }> }).data?.map((issue) => issue.id)
    ).toContain(privateProjectIssueId);
  });

  it('returns 404 for a non-member reading the private project issue detail', async () => {
    const response = await server.request({
      method: 'GET',
      url: `/v1/tickets/${privateProjectIssueId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${outsiderToken}`
      }
    });

    expect(response.status).toBe(404);
  });
});

function createToken(
  jwtService: JwtService,
  userId: number,
  tenantId: number,
  permissions: string[]
): string {
  return jwtService.sign({
    sub: String(userId),
    userId: String(userId),
    db_user_id: String(userId),
    tenant_id: String(tenantId),
    actor_id: String(userId),
    email: `user-${userId}@example.com`,
    permissions
  });
}
