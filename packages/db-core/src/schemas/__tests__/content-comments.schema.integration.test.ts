import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { runMigrations } from '../../migrations/runner';
import { contentComments, contentEntries, organizations, tenants, users } from '../../schemas';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

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

describe('Content Comments Schema Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let organizationId: number;
  let foreignOrganizationId: number;
  let userId: number;
  let foreignUserId: number;
  let contentEntryId: number;
  let foreignContentEntryId: number;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    await runMigrations(container.getConnectionUri());

    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool);

    const [tenantOne, tenantTwo] = await db
      .insert(tenants)
      .values([
        { type: 'organization', status: 'active' },
        { type: 'organization', status: 'active' }
      ])
      .returning();

    const [organizationOne, organizationTwo] = await db
      .insert(organizations)
      .values([
        {
          name: 'Content Comments Org One',
          slug: `content-comments-org-one-${testSuffix()}`,
          tenantId: tenantOne!.id
        },
        {
          name: 'Content Comments Org Two',
          slug: `content-comments-org-two-${testSuffix()}`,
          tenantId: tenantTwo!.id
        }
      ])
      .returning();

    organizationId = organizationOne!.id;
    foreignOrganizationId = organizationTwo!.id;

    const [userOne, userTwo] = await db
      .insert(users)
      .values([
        {
          organizationId,
          encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
          displayName: 'Content Comments User One'
        },
        {
          organizationId: foreignOrganizationId,
          encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
          displayName: 'Content Comments User Two'
        }
      ])
      .returning();

    userId = userOne!.id;
    foreignUserId = userTwo!.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(contentComments);
      await db.delete(contentEntries);
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
    await db.delete(contentComments);
    await db.delete(contentEntries);

    const [entryOne, entryTwo] = await db
      .insert(contentEntries)
      .values([
        {
          organizationId,
          title: 'Content Home',
          slug: `content-home-${testSuffix()}`,
          contentMarkdown: '# Content Home',
          position: 0,
          createdBy: userId,
          updatedBy: userId
        },
        {
          organizationId: foreignOrganizationId,
          title: 'Foreign Content Home',
          slug: `foreign-content-home-${testSuffix()}`,
          contentMarkdown: '# Foreign Content Home',
          position: 0,
          createdBy: foreignUserId,
          updatedBy: foreignUserId
        }
      ])
      .returning();

    contentEntryId = entryOne!.id;
    foreignContentEntryId = entryTwo!.id;
  });

  it('should create the content_comments table with the expected columns', async () => {
    const result = await pool.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'content_comments'
      ORDER BY ordinal_position
    `);

    expect(result.rows.map((row) => row.column_name)).toEqual([
      'id',
      'organization_id',
      'content_entry_id',
      'author_user_id',
      'body_markdown',
      'created_at',
      'updated_at',
      'deleted_at'
    ]);
    expect(result.rows.find((row) => row.column_name === 'body_markdown')?.is_nullable).toBe('NO');
    expect(result.rows.find((row) => row.column_name === 'deleted_at')?.is_nullable).toBe('YES');
  });

  it('should persist active content comments with soft delete support', async () => {
    const [comment] = await db
      .insert(contentComments)
      .values({
        organizationId,
        contentEntryId,
        authorUserId: userId,
        bodyMarkdown: 'First content comment'
      })
      .returning();

    expect(comment?.id).toBeDefined();
    expect(comment?.deletedAt).toBeNull();
  });

  it('should reject content comments that cross tenant boundaries', async () => {
    await expectDatabaseConstraint(
      db.insert(contentComments).values({
        organizationId,
        contentEntryId: foreignContentEntryId,
        authorUserId: userId,
        bodyMarkdown: 'Should fail'
      }),
      /same organization/i
    );
  });

  it('should reject content comments whose author belongs to a different organization', async () => {
    await expectDatabaseConstraint(
      db.insert(contentComments).values({
        organizationId,
        contentEntryId,
        authorUserId: foreignUserId,
        bodyMarkdown: 'Wrong author org'
      }),
      /author must belong to the same organization/i
    );
  });

  it('should reject blank markdown bodies', async () => {
    await expectDatabaseConstraint(
      db.insert(contentComments).values({
        organizationId,
        contentEntryId,
        authorUserId: userId,
        bodyMarkdown: '   '
      }),
      /content_comments_body_not_blank_chk/i
    );
  });
});
