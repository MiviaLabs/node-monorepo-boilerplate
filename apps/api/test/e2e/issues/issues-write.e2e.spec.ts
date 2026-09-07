import { JwtService } from '@nestjs/jwt';
import {
  files,
  eq,
  inArray,
  issueActivity,
  issueAssignees,
  issueAttachments,
  issueComments,
  issueLabelAssignments,
  issueLabels,
  issueWatchers,
  issues,
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

describe('Issues Write E2E', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let db: NodePgDatabase<Record<string, never>>;

  let tenantId: number;
  let organizationId: number;
  let writerUserId: number;
  let readerUserId: number;

  let writerToken: string;
  let readerToken: string;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();
    jwtService = server.app.get(JwtService);
    db = server.app.get(MAIN_DB);

    const organization = await createTestOrganization(server.app, 'Issues Write Org');
    tenantId = organization.tenantId;
    organizationId = organization.organizationId;

    const writer = await createUserFixture(server.app, { organizationId });
    const reader = await createUserFixture(server.app, { organizationId });

    writerUserId = writer.id;
    readerUserId = reader.id;

    await createTestUserTenant(server.app, writerUserId, tenantId, 'tenant_admin', true);
    await createTestUserTenant(server.app, readerUserId, tenantId, 'tenant_viewer', false);

    writerToken = createToken(jwtService, writerUserId, tenantId, [
      'tenant:issues:create',
      'tenant:issues:read',
      'tenant:issues:update',
      'tenant:issues:delete'
    ]);
    readerToken = createToken(jwtService, readerUserId, tenantId, ['tenant:issues:read']);

    await waitForServiceInitialization(server, { maxWait: 30000 });
  });

  afterAll(async () => {
    await cleanupTenant(server.app, tenantId);
    await server.close();
  });

  it('creates, updates, and deletes an org-scoped issue with write permissions', async () => {
    const createResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Untitled issue',
        descriptionMarkdown: 'Seeded from E2E.',
        priority: 'medium'
      }
    });

    expect(createResponse.status).toBe(201);
    const createdIssueId = (createResponse.body as { data?: { id?: number } }).data?.id;
    expect(createdIssueId).toBeDefined();

    const updateResponse = await server.request({
      method: 'PATCH',
      url: `/v1/tickets/${createdIssueId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        baseRevision: (createResponse.body as { data?: { updatedAt?: string } }).data?.updatedAt,
        status: 'done',
        priority: 'high'
      }
    });

    expect(updateResponse.status).toBe(200);
    expect((updateResponse.body as { data?: { status?: string } }).data?.status).toBe('done');

    const activityResponse = await server.request({
      method: 'GET',
      url: `/v1/tickets/${createdIssueId}/activity`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(activityResponse.status).toBe(200);
    expect(
      (activityResponse.body as { data?: Array<{ activityType?: string }> }).data?.map(
        (entry) => entry.activityType
      )
    ).toEqual(
      expect.arrayContaining([
        'issue.created',
        'issue.updated',
        'issue.status_changed',
        'issue.priority_changed'
      ])
    );

    const deleteResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${createdIssueId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(deleteResponse.status).toBe(204);

    const [deletedRow] = await db
      .select({ deletedAt: issues.deletedAt })
      .from(issues)
      .where(eq(issues.id, createdIssueId!));

    expect(deletedRow?.deletedAt).not.toBeNull();
  });

  it('rejects issue creation for read-only users', async () => {
    const response = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${readerToken}`
      },
      body: {
        title: 'Should fail'
      }
    });

    expect(response.status).toBe(403);
  });

  it('creates and reads issue comments with write permissions while blocking read-only comment writes', async () => {
    const createIssueResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Issue with comments',
        descriptionMarkdown: 'Testing comments.',
        priority: 'medium'
      }
    });

    expect(createIssueResponse.status).toBe(201);
    const issueId = (createIssueResponse.body as { data?: { id?: number } }).data?.id;
    expect(issueId).toBeDefined();

    const createCommentResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        bodyMarkdown: 'First real comment'
      }
    });

    expect(createCommentResponse.status).toBe(201);
    expect(
      (createCommentResponse.body as { data?: { comments?: Array<{ bodyMarkdown?: string }> } })
        .data?.comments?.[0]?.bodyMarkdown
    ).toBe('First real comment');

    const listCommentsResponse = await server.request({
      method: 'GET',
      url: `/v1/tickets/${issueId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${readerToken}`
      }
    });

    expect(listCommentsResponse.status).toBe(200);
    expect(
      (listCommentsResponse.body as { data?: Array<{ bodyMarkdown?: string }> }).data?.[0]
        ?.bodyMarkdown
    ).toBe('First real comment');

    const readOnlyCommentResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${readerToken}`
      },
      body: {
        bodyMarkdown: 'Should fail'
      }
    });

    expect(readOnlyCommentResponse.status).toBe(403);

    const [commentRow] = await db
      .select({ bodyMarkdown: issueComments.bodyMarkdown })
      .from(issueComments)
      .where(eq(issueComments.issueId, issueId!));

    expect(commentRow?.bodyMarkdown).toBe('First real comment');
  });

  it('adds and removes assignees and watchers with write permissions while blocking read-only writes', async () => {
    const createIssueResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Issue with collaborators'
      }
    });

    expect(createIssueResponse.status).toBe(201);
    const issueId = (createIssueResponse.body as { data?: { id?: number } }).data?.id;
    expect(issueId).toBeDefined();

    const addAssigneeResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/assignees`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        userId: readerUserId
      }
    });

    expect(addAssigneeResponse.status).toBe(201);
    expect(
      (
        addAssigneeResponse.body as { data?: { assignees?: Array<{ userId?: number }> } }
      ).data?.assignees?.some((assignee) => assignee.userId === readerUserId)
    ).toBe(true);

    const addWatcherResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/watchers`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        userId: writerUserId
      }
    });

    expect(addWatcherResponse.status).toBe(201);
    expect(
      (
        addWatcherResponse.body as { data?: { watchers?: Array<{ userId?: number }> } }
      ).data?.watchers?.some((watcher) => watcher.userId === writerUserId)
    ).toBe(true);

    const readOnlyAssigneeResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/assignees`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${readerToken}`
      },
      body: {
        userId: writerUserId
      }
    });

    expect(readOnlyAssigneeResponse.status).toBe(403);

    const selfRemoveAssigneeResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${issueId}/assignees/${readerUserId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${readerToken}`
      }
    });

    expect(selfRemoveAssigneeResponse.status).toBe(200);

    const readOnlyRemoveOtherAssigneeResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${issueId}/assignees/${writerUserId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${readerToken}`
      }
    });

    expect(readOnlyRemoveOtherAssigneeResponse.status).toBe(403);

    const restoreAssigneeResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/assignees`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        userId: readerUserId
      }
    });

    expect(restoreAssigneeResponse.status).toBe(201);

    const removeAssigneeResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${issueId}/assignees/${readerUserId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(removeAssigneeResponse.status).toBe(200);

    const removeWatcherResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${issueId}/watchers/${writerUserId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(removeWatcherResponse.status).toBe(200);

    const listIssuesResponse = await server.request({
      method: 'GET',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(listIssuesResponse.status).toBe(200);
    expect(
      (
        listIssuesResponse.body as {
          data?: Array<{ id?: number; activity?: Array<{ activityType?: string }> }>;
        }
      ).data
        ?.find((issue) => issue.id === issueId)
        ?.activity?.map((entry) => entry.activityType)
    ).toEqual(expect.arrayContaining(['issue.watcher_removed', 'issue.unassigned']));

    const [watcherRow] = await db
      .select({ userId: issueWatchers.userId })
      .from(issueWatchers)
      .where(eq(issueWatchers.issueId, issueId!));

    expect(watcherRow).toBeUndefined();
  });

  it('creates labels and attaches and removes them from issues with write permissions', async () => {
    const createIssueResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Issue with labels'
      }
    });

    expect(createIssueResponse.status).toBe(201);
    const issueId = (createIssueResponse.body as { data?: { id?: number } }).data?.id;
    expect(issueId).toBeDefined();

    const createLabelResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets/labels',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        name: 'Frontend',
        color: '#38bdf8'
      }
    });

    expect(createLabelResponse.status).toBe(201);
    const labelId = (createLabelResponse.body as { data?: { id?: number } }).data?.id;
    expect(labelId).toBeDefined();

    const attachResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/labels`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        labelId
      }
    });

    expect(attachResponse.status).toBe(201);
    expect(
      (attachResponse.body as { data?: { labels?: Array<{ id?: number }> } }).data?.labels?.some(
        (label) => label.id === labelId
      )
    ).toBe(true);

    const listLabelsResponse = await server.request({
      method: 'GET',
      url: '/v1/tickets/labels',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${readerToken}`
      }
    });

    expect(listLabelsResponse.status).toBe(200);

    const detachResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${issueId}/labels/${labelId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(detachResponse.status).toBe(200);

    const [labelRow] = await db
      .select({ name: issueLabels.name })
      .from(issueLabels)
      .where(eq(issueLabels.id, labelId!));

    expect(labelRow?.name).toBe('Frontend');

    const assignmentRows = await db
      .select({ labelId: issueLabelAssignments.labelId })
      .from(issueLabelAssignments)
      .where(eq(issueLabelAssignments.issueId, issueId!));

    expect(assignmentRows).toHaveLength(0);
  });

  it('cascades issue deletion across subtasks, comments, attachments, and dependent records', async () => {
    const parentResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Parent issue'
      }
    });

    expect(parentResponse.status).toBe(201);
    const parentIssueId = (parentResponse.body as { data?: { id?: number } }).data?.id;
    expect(parentIssueId).toBeDefined();

    const childResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Child issue',
        parentIssueId
      }
    });

    expect(childResponse.status).toBe(201);
    const childIssueId = (childResponse.body as { data?: { id?: number } }).data?.id;
    expect(childIssueId).toBeDefined();

    const createCommentResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${childIssueId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        bodyMarkdown: 'Child issue comment'
      }
    });

    expect(createCommentResponse.status).toBe(201);

    const createLabelResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets/labels',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        name: 'Delete cascade',
        color: '#ef4444'
      }
    });

    expect(createLabelResponse.status).toBe(201);
    const labelId = (createLabelResponse.body as { data?: { id?: number } }).data?.id;
    expect(labelId).toBeDefined();

    const attachLabelResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${childIssueId}/labels`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        labelId
      }
    });

    expect(attachLabelResponse.status).toBe(201);

    const addAssigneeResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${parentIssueId}/assignees`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        userId: readerUserId
      }
    });

    expect(addAssigneeResponse.status).toBe(201);

    const addWatcherResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${childIssueId}/watchers`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        userId: writerUserId
      }
    });

    expect(addWatcherResponse.status).toBe(201);

    const reserveAttachmentResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${parentIssueId}/attachments/uploads`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        originalFilename: 'cascade-proof.txt',
        mimeType: 'text/plain',
        byteSize: 7,
        transport: 'api_proxy'
      }
    });

    expect(reserveAttachmentResponse.status).toBe(201);
    const reservedFileId = (reserveAttachmentResponse.body as { data?: { file?: { id?: number } } })
      .data?.file?.id;
    expect(reservedFileId).toBeDefined();

    const uploadResponse = await request(server.app.getHttpServer())
      .put(`/v1/objects/uploads/${reservedFileId}/content`)
      .set('authorization', `Bearer ${writerToken}`)
      .set('x-tenant-id', String(organizationId))
      .set('content-type', 'text/plain')
      .set('content-length', '7')
      .send(Buffer.from('payload'));

    expect(uploadResponse.status).toBe(200);

    const attachResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${parentIssueId}/attachments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        fileId: reservedFileId
      }
    });

    expect(attachResponse.status).toBe(201);

    const deleteResponse = await server.request({
      method: 'DELETE',
      url: `/v1/tickets/${parentIssueId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(deleteResponse.status).toBe(204);

    const getDeletedParentResponse = await server.request({
      method: 'GET',
      url: `/v1/tickets/${parentIssueId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(getDeletedParentResponse.status).toBe(404);

    const getDeletedChildResponse = await server.request({
      method: 'GET',
      url: `/v1/tickets/${childIssueId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(getDeletedChildResponse.status).toBe(404);

    const deletedIssueRows = await db
      .select({ id: issues.id, deletedAt: issues.deletedAt })
      .from(issues)
      .where(inArray(issues.id, [parentIssueId!, childIssueId!]));

    expect(deletedIssueRows).toHaveLength(2);
    expect(deletedIssueRows.every((row) => row.deletedAt !== null)).toBe(true);

    const commentRows = await db
      .select({ deletedAt: issueComments.deletedAt })
      .from(issueComments)
      .where(inArray(issueComments.issueId, [parentIssueId!, childIssueId!]));

    expect(commentRows.length).toBeGreaterThan(0);
    expect(commentRows.every((row) => row.deletedAt !== null)).toBe(true);

    const attachmentRows = await db
      .select({ deletedAt: issueAttachments.deletedAt, fileId: issueAttachments.fileId })
      .from(issueAttachments)
      .where(eq(issueAttachments.issueId, parentIssueId!));

    expect(attachmentRows).toHaveLength(1);
    expect(attachmentRows[0]?.deletedAt).not.toBeNull();
    expect(attachmentRows[0]?.fileId).toBe(reservedFileId);

    const [deletedFileRow] = await db
      .select({ status: files.status, deletedAt: files.deletedAt, purgedAt: files.purgedAt })
      .from(files)
      .where(eq(files.id, reservedFileId!));

    expect(deletedFileRow?.status).toBe('pending_delete');
    expect(deletedFileRow?.deletedAt).not.toBeNull();
    expect(deletedFileRow?.purgedAt).toBeNull();

    const assigneeRows = await db
      .select({ issueId: issueAssignees.issueId })
      .from(issueAssignees)
      .where(inArray(issueAssignees.issueId, [parentIssueId!, childIssueId!]));

    expect(assigneeRows).toHaveLength(0);

    const watcherRows = await db
      .select({ issueId: issueWatchers.issueId })
      .from(issueWatchers)
      .where(inArray(issueWatchers.issueId, [parentIssueId!, childIssueId!]));

    expect(watcherRows).toHaveLength(0);

    const labelAssignmentRows = await db
      .select({ issueId: issueLabelAssignments.issueId })
      .from(issueLabelAssignments)
      .where(inArray(issueLabelAssignments.issueId, [parentIssueId!, childIssueId!]));

    expect(labelAssignmentRows).toHaveLength(0);

    const activityRows = await db
      .select({ issueId: issueActivity.issueId })
      .from(issueActivity)
      .where(inArray(issueActivity.issueId, [parentIssueId!, childIssueId!]));

    expect(activityRows).toHaveLength(0);
  });

  it('rejects reparenting across different project scopes', async () => {
    const [privateProject] = await db
      .insert(projects)
      .values({
        organizationId,
        key: 'PSCOPE',
        name: 'Parent Scope Project',
        visibility: 'private',
        createdBy: writerUserId
      })
      .returning();

    expect(privateProject?.id).toBeDefined();

    const orgParentResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Org parent'
      }
    });

    expect(orgParentResponse.status).toBe(201);
    const orgParentIssueId = (orgParentResponse.body as { data?: { id?: number } }).data?.id;
    expect(orgParentIssueId).toBeDefined();

    const projectChildResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Project child',
        projectId: privateProject!.id
      }
    });

    expect(projectChildResponse.status).toBe(201);
    const projectChildIssueId = (projectChildResponse.body as { data?: { id?: number } }).data?.id;
    expect(projectChildIssueId).toBeDefined();

    const updateResponse = await server.request({
      method: 'PATCH',
      url: `/v1/tickets/${projectChildIssueId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        parentIssueId: orgParentIssueId
      }
    });

    expect(updateResponse.status).toBe(400);
  });

  it('rejects threaded comments whose parent belongs to a different issue', async () => {
    const sourceResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Comment source'
      }
    });

    expect(sourceResponse.status).toBe(201);
    const sourceIssueId = (sourceResponse.body as { data?: { id?: number } }).data?.id;
    expect(sourceIssueId).toBeDefined();

    const targetResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Comment target'
      }
    });

    expect(targetResponse.status).toBe(201);
    const targetIssueId = (targetResponse.body as { data?: { id?: number } }).data?.id;
    expect(targetIssueId).toBeDefined();

    const commentResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${sourceIssueId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        bodyMarkdown: 'Root comment'
      }
    });

    expect(commentResponse.status).toBe(201);
    const parentCommentId = (
      commentResponse.body as { data?: { comments?: Array<{ id?: number }> } }
    ).data?.comments?.[0]?.id;
    expect(parentCommentId).toBeDefined();

    const threadedResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${targetIssueId}/comments`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        bodyMarkdown: 'Reply on the wrong issue',
        parentCommentId
      }
    });

    expect(threadedResponse.status).toBe(404);
  });

  it('keeps watcher filtering consistent for implicitly watched assignees', async () => {
    const issueResponse = await server.request({
      method: 'POST',
      url: '/v1/tickets',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        title: 'Assignee-only watch filter'
      }
    });

    expect(issueResponse.status).toBe(201);
    const issueId = (issueResponse.body as { data?: { id?: number } }).data?.id;
    expect(issueId).toBeDefined();

    const assignResponse = await server.request({
      method: 'POST',
      url: `/v1/tickets/${issueId}/assignees`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      },
      body: {
        userId: readerUserId
      }
    });

    expect(assignResponse.status).toBe(201);

    const filteredResponse = await server.request({
      method: 'GET',
      url: `/v1/issues?watcherUserId=${readerUserId}`,
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${writerToken}`
      }
    });

    expect(filteredResponse.status).toBe(200);
    expect(
      ((filteredResponse.body as { data?: Array<{ id?: number }> }).data ?? []).some(
        (item) => item.id === issueId
      )
    ).toBe(true);
  });

  it('hides project-scoped labels from readers who cannot access the project', async () => {
    const [privateProject] = await db
      .insert(projects)
      .values({
        organizationId,
        key: 'PLABEL',
        name: 'Label Visibility Project',
        visibility: 'private',
        createdBy: writerUserId
      })
      .returning();

    expect(privateProject?.id).toBeDefined();

    const [privateLabel] = await db
      .insert(issueLabels)
      .values({
        organizationId,
        projectId: privateProject!.id,
        name: 'Hidden label',
        color: '#8b5cf6',
        description: 'Only project members should see this',
        createdBy: writerUserId,
        updatedBy: writerUserId
      })
      .returning();

    expect(privateLabel?.id).toBeDefined();

    const response = await server.request({
      method: 'GET',
      url: '/v1/tickets/labels',
      headers: {
        'x-tenant-id': String(organizationId),
        Authorization: `Bearer ${readerToken}`
      }
    });

    expect(response.status).toBe(200);
    expect(
      ((response.body as { data?: Array<{ id?: number }> }).data ?? []).some(
        (label) => label.id === privateLabel!.id
      )
    ).toBe(false);
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
