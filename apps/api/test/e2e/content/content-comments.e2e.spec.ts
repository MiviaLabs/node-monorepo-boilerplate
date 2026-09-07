import { JwtService } from '@nestjs/jwt';
import { contentComments, eq } from '@package/db-core';

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

describe('Content Comments E2E', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let db: NodePgDatabase<Record<string, never>>;

  let tenantId: number;
  let organizationId: number;
  let authorUserId: number;
  let otherUserId: number;
  let adminUserId: number;

  let authorToken: string;
  let otherToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    jwtService = server.app.get(JwtService);
    db = server.app.get(MAIN_DB);

    const organization = await createTestOrganization(server.app, 'Content Comments Org');
    tenantId = organization.tenantId;
    organizationId = organization.organizationId;

    const author = await createUserFixture(server.app, { organizationId });
    const other = await createUserFixture(server.app, { organizationId });
    const admin = await createUserFixture(server.app, { organizationId });

    authorUserId = author.id;
    otherUserId = other.id;
    adminUserId = admin.id;

    await createTestUserTenant(server.app, authorUserId, tenantId, 'tenant_user', true);
    await createTestUserTenant(server.app, otherUserId, tenantId, 'tenant_user', false);
    await createTestUserTenant(server.app, adminUserId, tenantId, 'tenant_admin', false);

    authorToken = createToken(jwtService, authorUserId, tenantId, [
      'tenant:content:create',
      'tenant:content:read',
      'tenant:content:update'
    ]);
    otherToken = createToken(jwtService, otherUserId, tenantId, [
      'tenant:content:read',
      'tenant:content:update'
    ]);
    adminToken = createToken(jwtService, adminUserId, tenantId, [
      'tenant:content:create',
      'tenant:content:read',
      'tenant:content:update',
      'tenant:content:delete'
    ]);

    await waitForServiceInitialization(server, { maxWait: 30000 });
  });

  afterAll(async () => {
    await cleanupTenant(server.app, tenantId);
    await server.close();
  });

  it('creates, lists, and deletes content comments with own-comment and admin delete rules', async () => {
    const createEntryResponse = await server.request({
      method: 'POST',
      url: '/v1/pages',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${authorToken}`
      },
      body: {
        title: 'Commented page',
        contentMarkdown: '# Commented page'
      }
    });

    expect(createEntryResponse.status).toBe(201);
    const entryId = (createEntryResponse.body as { data?: { id?: number } }).data?.id;
    expect(entryId).toBeDefined();

    const createOwnCommentResponse = await server.request({
      method: 'POST',
      url: `/v1/pages/${entryId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${authorToken}`
      },
      body: {
        bodyMarkdown: 'First content comment'
      }
    });

    expect(createOwnCommentResponse.status).toBe(201);
    const ownComment =
      (createOwnCommentResponse.body as { data?: { id?: number; canDelete?: boolean } }).data ?? {};
    expect(ownComment.id).toBeDefined();
    expect(ownComment.canDelete).toBe(true);

    const createOtherCommentResponse = await server.request({
      method: 'POST',
      url: `/v1/pages/${entryId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${otherToken}`
      },
      body: {
        bodyMarkdown: 'Second content comment'
      }
    });

    expect(createOtherCommentResponse.status).toBe(201);
    const otherCommentId = (createOtherCommentResponse.body as { data?: { id?: number } }).data?.id;
    expect(otherCommentId).toBeDefined();

    const listAsAuthorResponse = await server.request({
      method: 'GET',
      url: `/v1/pages/${entryId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${authorToken}`
      }
    });

    expect(listAsAuthorResponse.status).toBe(200);
    const authorComments =
      (
        listAsAuthorResponse.body as {
          data?: Array<{ id: number; bodyMarkdown: string; canDelete: boolean }>;
        }
      ).data ?? [];
    expect(authorComments.map((comment) => comment.bodyMarkdown)).toEqual([
      'Second content comment',
      'First content comment'
    ]);
    expect(
      authorComments.find((comment) => comment.bodyMarkdown === 'First content comment')?.canDelete
    ).toBe(true);
    expect(
      authorComments.find((comment) => comment.bodyMarkdown === 'Second content comment')?.canDelete
    ).toBe(false);

    const deleteOtherUsersCommentResponse = await server.request({
      method: 'DELETE',
      url: `/v1/pages/${entryId}/comments/${otherCommentId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${authorToken}`
      }
    });

    expect(deleteOtherUsersCommentResponse.status).toBe(403);

    const deleteOwnCommentResponse = await server.request({
      method: 'DELETE',
      url: `/v1/pages/${entryId}/comments/${ownComment.id}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${authorToken}`
      }
    });

    expect(deleteOwnCommentResponse.status).toBe(204);

    const deleteAsAdminResponse = await server.request({
      method: 'DELETE',
      url: `/v1/pages/${entryId}/comments/${otherCommentId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${adminToken}`
      }
    });

    expect(deleteAsAdminResponse.status).toBe(204);

    const listAfterDeleteResponse = await server.request({
      method: 'GET',
      url: `/v1/pages/${entryId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${adminToken}`
      }
    });

    expect(listAfterDeleteResponse.status).toBe(200);
    expect((listAfterDeleteResponse.body as { data?: unknown[] }).data ?? []).toEqual([]);

    const deletedRows = await db
      .select({
        id: contentComments.id,
        deletedAt: contentComments.deletedAt
      })
      .from(contentComments)
      .where(eq(contentComments.contentEntryId, entryId!));

    expect(deletedRows).toHaveLength(2);
    expect(deletedRows.every((row) => row.deletedAt !== null)).toBe(true);
  });

  it('rejects whitespace-only comment bodies with a request validation error', async () => {
    const createEntryResponse = await server.request({
      method: 'POST',
      url: '/v1/pages',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${authorToken}`
      },
      body: {
        title: 'Validation page',
        contentMarkdown: '# Validation page'
      }
    });

    expect(createEntryResponse.status).toBe(201);
    const entryId = (createEntryResponse.body as { data?: { id?: number } }).data?.id;
    expect(entryId).toBeDefined();

    const createCommentResponse = await server.request({
      method: 'POST',
      url: `/v1/pages/${entryId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${authorToken}`
      },
      body: {
        bodyMarkdown: '   '
      }
    });

    expect(createCommentResponse.status).toBe(400);
  });
});

function createToken(
  jwtService: JwtService,
  userId: number,
  tenantId: number,
  permissions: string[],
  systemRoles?: string[]
): string {
  return jwtService.sign({
    sub: String(userId),
    userId: String(userId),
    db_user_id: String(userId),
    tenant_id: String(tenantId),
    actor_id: String(userId),
    email: `user-${userId}@example.com`,
    permissions,
    ...(systemRoles ? { system_roles: systemRoles, roles: [...systemRoles] } : {})
  });
}
