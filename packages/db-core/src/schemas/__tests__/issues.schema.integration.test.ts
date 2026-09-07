import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { runMigrations } from '../../migrations/runner';
import {
  issueComments,
  issueLabelAssignments,
  issueLabels,
  issueRelations,
  issues,
  organizations,
  projects,
  tenants,
  users
} from '../../schemas';

jest.setTimeout(60000);

const { Pool } = pg;
const TEST_ENCRYPTION_KEY_VERSION = 'primary-encryption-key';

function testSuffix(): string {
  return randomBytes(8).toString('hex');
}

async function expectDatabaseConstraint(
  operation: Promise<unknown>,
  constraintPattern: RegExp
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected database constraint ${constraintPattern.source} to be enforced.`);
  } catch (error) {
    const message =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : String(error);

    expect(message).toMatch(constraintPattern);
  }
}

describe('Issues Schema Integrity Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let organizationOneId: number;
  let organizationTwoId: number;
  let projectOneId: number;
  let projectTwoId: number;
  let userOneId: number;
  let userTwoId: number;
  let issueOneId: number;
  let issueTwoId: number;
  let foreignIssueId: number;
  let globalLabelId: number;
  let projectLabelId: number;
  let foreignLabelId: number;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    await runMigrations(container.getConnectionUri());

    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool);

    const [tenantOne] = await db
      .insert(tenants)
      .values({ type: 'organization', status: 'active' })
      .returning();
    const [tenantTwo] = await db
      .insert(tenants)
      .values({ type: 'organization', status: 'active' })
      .returning();

    const [organizationOne] = await db
      .insert(organizations)
      .values({
        name: `Issues Org 1 ${testSuffix()}`,
        slug: `issues-org-1-${testSuffix()}`,
        tenantId: tenantOne!.id
      })
      .returning();
    organizationOneId = organizationOne!.id;

    const [organizationTwo] = await db
      .insert(organizations)
      .values({
        name: `Issues Org 2 ${testSuffix()}`,
        slug: `issues-org-2-${testSuffix()}`,
        tenantId: tenantTwo!.id
      })
      .returning();
    organizationTwoId = organizationTwo!.id;

    const [userOne] = await db
      .insert(users)
      .values({
        organizationId: organizationOneId,
        encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
        displayName: 'Issues User One'
      })
      .returning();
    userOneId = userOne!.id;

    const [userTwo] = await db
      .insert(users)
      .values({
        organizationId: organizationTwoId,
        encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
        displayName: 'Issues User Two'
      })
      .returning();
    userTwoId = userTwo!.id;

    const [projectOne] = await db
      .insert(projects)
      .values({
        organizationId: organizationOneId,
        createdBy: userOneId,
        key: 'ISSUEONE',
        name: 'Issues Project One'
      })
      .returning();
    projectOneId = projectOne!.id;

    const [projectTwo] = await db
      .insert(projects)
      .values({
        organizationId: organizationOneId,
        createdBy: userOneId,
        key: 'ISSUETWO',
        name: 'Issues Project Two'
      })
      .returning();
    projectTwoId = projectTwo!.id;

    const [issueOne] = await db
      .insert(issues)
      .values({
        organizationId: organizationOneId,
        projectId: projectOneId,
        issueNumber: 101,
        title: 'Issue One',
        createdBy: userOneId,
        updatedBy: userOneId
      })
      .returning();
    issueOneId = issueOne!.id;

    const [issueTwo] = await db
      .insert(issues)
      .values({
        organizationId: organizationOneId,
        projectId: projectTwoId,
        issueNumber: 102,
        title: 'Issue Two',
        createdBy: userOneId,
        updatedBy: userOneId
      })
      .returning();
    issueTwoId = issueTwo!.id;

    const [foreignIssue] = await db
      .insert(issues)
      .values({
        organizationId: organizationTwoId,
        issueNumber: 201,
        title: 'Foreign Issue',
        createdBy: userTwoId,
        updatedBy: userTwoId
      })
      .returning();
    foreignIssueId = foreignIssue!.id;

    const [globalLabel] = await db
      .insert(issueLabels)
      .values({
        organizationId: organizationOneId,
        projectId: null,
        name: 'Global Label',
        createdBy: userOneId,
        updatedBy: userOneId
      })
      .returning();
    globalLabelId = globalLabel!.id;

    const [projectLabel] = await db
      .insert(issueLabels)
      .values({
        organizationId: organizationOneId,
        projectId: projectOneId,
        name: 'Project Label',
        createdBy: userOneId,
        updatedBy: userOneId
      })
      .returning();
    projectLabelId = projectLabel!.id;

    const [foreignLabel] = await db
      .insert(issueLabels)
      .values({
        organizationId: organizationTwoId,
        projectId: null,
        name: 'Foreign Label',
        createdBy: userTwoId,
        updatedBy: userTwoId
      })
      .returning();
    foreignLabelId = foreignLabel!.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(issueRelations);
      await db.delete(issueLabelAssignments);
      await db.delete(issueComments);
      await db.delete(issues);
      await db.delete(issueLabels);
      await db.delete(projects);
      await db.delete(users);
      await db.delete(organizations);
      await db.delete(tenants);
    }

    if (pool) {
      await pool.end();
    }

    if (container) {
      await container.stop();
    }
  });

  beforeEach(async () => {
    await db.delete(issueRelations);
    await db.delete(issueLabelAssignments);
    await db.delete(issueComments);
  });

  it('should reject issue relations that cross tenant boundaries', async () => {
    await expectDatabaseConstraint(
      db.insert(issueRelations).values({
        organizationId: organizationOneId,
        sourceIssueId: issueOneId,
        targetIssueId: foreignIssueId,
        relationType: 'blocks',
        createdBy: userOneId
      }),
      /issue_relations_(source|target)_issue_org_fk/i
    );
  });

  it('should reject parent comments that point to another issue', async () => {
    const [parentComment] = await db
      .insert(issueComments)
      .values({
        organizationId: organizationOneId,
        issueId: issueOneId,
        authorUserId: userOneId,
        bodyMarkdown: 'Parent comment'
      })
      .returning();

    await expectDatabaseConstraint(
      db.insert(issueComments).values({
        organizationId: organizationOneId,
        issueId: issueTwoId,
        authorUserId: userOneId,
        parentCommentId: parentComment!.id,
        bodyMarkdown: 'Child comment'
      }),
      /same issue/i
    );
  });

  it('should reject issue label assignments outside the issue project scope', async () => {
    await expectDatabaseConstraint(
      db.insert(issueLabelAssignments).values({
        issueId: issueOneId,
        labelId: projectLabelId,
        createdBy: userOneId
      }),
      /same project scope/i
    );
  });

  it('should reject issue label assignments across tenant boundaries', async () => {
    await expectDatabaseConstraint(
      db.insert(issueLabelAssignments).values({
        issueId: issueOneId,
        labelId: foreignLabelId,
        createdBy: userOneId
      }),
      /same organization/i
    );
  });

  it('should populate the assignment organization automatically for valid labels', async () => {
    const [assignment] = await db
      .insert(issueLabelAssignments)
      .values({
        issueId: issueOneId,
        labelId: globalLabelId,
        createdBy: userOneId
      })
      .returning();

    expect(assignment?.organizationId).toBe(organizationOneId);
  });
});
