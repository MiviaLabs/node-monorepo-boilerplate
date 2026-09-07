import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { runMigrations } from '../../migrations/runner';
import { contentEntries, organizations, projects, tenants, users } from '../../schemas';

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

describe('Content Entries Schema Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let organizationId: number;
  let authorId: number;
  let projectOneId: number;
  let projectTwoId: number;

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

    const [organization] = await db
      .insert(organizations)
      .values({
        name: 'Content Org',
        slug: `content-org-${testSuffix()}`,
        tenantId: tenantOne!.id
      })
      .returning();
    organizationId = organization!.id;

    await db.insert(organizations).values({
      name: 'Content Org Two',
      slug: `content-org-two-${testSuffix()}`,
      tenantId: tenantTwo!.id
    });

    const [author] = await db
      .insert(users)
      .values({
        organizationId,
        encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
        displayName: 'Content Author'
      })
      .returning();
    authorId = author!.id;

    const [projectOne] = await db
      .insert(projects)
      .values({
        organizationId,
        createdBy: authorId,
        key: 'PROJONE',
        name: 'Project One'
      })
      .returning();
    projectOneId = projectOne!.id;

    const [projectTwo] = await db
      .insert(projects)
      .values({
        organizationId,
        createdBy: authorId,
        key: 'PROJTWO',
        name: 'Project Two'
      })
      .returning();
    projectTwoId = projectTwo!.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(contentEntries);
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
    await db.delete(contentEntries);
  });

  it('should create the content_entries table with the expected columns', async () => {
    const result = await pool.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'content_entries'
      ORDER BY ordinal_position
    `);

    expect(result.rows.map((row) => row.column_name)).toEqual([
      'id',
      'organization_id',
      'project_id',
      'parent_id',
      'title',
      'slug',
      'content_markdown',
      'created_by',
      'updated_by',
      'created_at',
      'updated_at',
      'deleted_at',
      'position'
    ]);
    expect(result.rows.find((row) => row.column_name === 'project_id')?.is_nullable).toBe('YES');
    expect(result.rows.find((row) => row.column_name === 'organization_id')?.is_nullable).toBe(
      'NO'
    );
    expect(result.rows.find((row) => row.column_name === 'position')?.is_nullable).toBe('NO');
  });

  it('should enforce scoped uniqueness for active org-only entries', async () => {
    const slug = `org-home-${testSuffix()}`;

    await db.insert(contentEntries).values({
      organizationId,
      title: 'Org Home',
      slug,
      contentMarkdown: '# Org Home',
      position: 0,
      createdBy: authorId,
      updatedBy: authorId
    });

    await expect(
      db.insert(contentEntries).values({
        organizationId,
        title: 'Org Home Duplicate',
        slug,
        contentMarkdown: '# Duplicate',
        position: 1,
        createdBy: authorId,
        updatedBy: authorId
      })
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('should allow reusing an org-only slug after soft delete', async () => {
    const slug = `org-archive-${testSuffix()}`;

    const [entry] = await db
      .insert(contentEntries)
      .values({
        organizationId,
        title: 'Archive Me',
        slug,
        contentMarkdown: '# Archive',
        position: 0,
        createdBy: authorId,
        updatedBy: authorId
      })
      .returning();

    await db
      .update(contentEntries)
      .set({ deletedAt: new Date() })
      .where(eq(contentEntries.id, entry!.id));

    const [replacement] = await db
      .insert(contentEntries)
      .values({
        organizationId,
        title: 'Replacement',
        slug,
        contentMarkdown: '# Replacement',
        position: 0,
        createdBy: authorId,
        updatedBy: authorId
      })
      .returning();

    expect(replacement?.id).toBeDefined();
    expect(replacement?.id).not.toBe(entry?.id);
  });

  it('should scope project slugs by organization and project', async () => {
    const slug = `project-docs-${testSuffix()}`;

    await db.insert(contentEntries).values({
      organizationId,
      projectId: projectOneId,
      title: 'Project One Docs',
      slug,
      contentMarkdown: '# Project One',
      position: 0,
      createdBy: authorId,
      updatedBy: authorId
    });

    await expect(
      db.insert(contentEntries).values({
        organizationId,
        projectId: projectOneId,
        title: 'Project One Docs Duplicate',
        slug,
        contentMarkdown: '# Duplicate',
        position: 1,
        createdBy: authorId,
        updatedBy: authorId
      })
    ).rejects.toThrow(/unique|duplicate/i);

    const [otherProjectEntry] = await db
      .insert(contentEntries)
      .values({
        organizationId,
        projectId: projectTwoId,
        title: 'Project Two Docs',
        slug,
        contentMarkdown: '# Project Two',
        position: 0,
        createdBy: authorId,
        updatedBy: authorId
      })
      .returning();

    const [orgScopedEntry] = await db
      .insert(contentEntries)
      .values({
        organizationId,
        title: 'Org Docs',
        slug,
        contentMarkdown: '# Org Docs',
        position: 0,
        createdBy: authorId,
        updatedBy: authorId
      })
      .returning();

    expect(otherProjectEntry?.projectId).toBe(projectTwoId);
    expect(orgScopedEntry?.projectId).toBeNull();
  });

  it('should reject self-parent relationships', async () => {
    const [entry] = await db
      .insert(contentEntries)
      .values({
        organizationId,
        title: 'Parent Check',
        slug: `self-parent-${testSuffix()}`,
        contentMarkdown: '# Self Parent',
        position: 0,
        createdBy: authorId,
        updatedBy: authorId
      })
      .returning();

    await expectDatabaseConstraint(
      db
        .update(contentEntries)
        .set({ parentId: entry!.id })
        .where(eq(contentEntries.id, entry!.id)),
      /content_entries_parent_not_self_chk/i
    );
  });

  it('should reject blank titles after trim', async () => {
    await expectDatabaseConstraint(
      db.insert(contentEntries).values({
        organizationId,
        title: '   ',
        slug: `blank-title-${testSuffix()}`,
        contentMarkdown: '# Invalid',
        position: 0,
        createdBy: authorId,
        updatedBy: authorId
      }),
      /content_entries_title_not_blank_chk/i
    );
  });
});
