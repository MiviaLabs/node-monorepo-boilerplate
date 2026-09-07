import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { runMigrations } from '../../migrations/runner';
import {
  contentAttachments,
  contentEntries,
  files,
  organizations,
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

describe('Content Attachments Schema Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let organizationId: number;
  let userId: number;
  let contentEntryId: number;
  let fileId: number;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

    await runMigrations(container.getConnectionUri());

    pool = new Pool({ connectionString: container.getConnectionUri() });
    db = drizzle(pool);

    const [tenant] = await db
      .insert(tenants)
      .values({ type: 'organization', status: 'active' })
      .returning();

    const [organization] = await db
      .insert(organizations)
      .values({
        name: 'Content Attachments Org',
        slug: `content-attachments-org-${testSuffix()}`,
        tenantId: tenant!.id
      })
      .returning();
    organizationId = organization!.id;

    const [user] = await db
      .insert(users)
      .values({
        organizationId,
        encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
        displayName: 'Content Attachments User'
      })
      .returning();
    userId = user!.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(contentAttachments);
      await db.delete(contentEntries);
      await db.delete(files);
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
    await db.delete(contentAttachments);
    await db.delete(contentEntries);
    await db.delete(files);

    const [entry] = await db
      .insert(contentEntries)
      .values({
        organizationId,
        title: 'Content Home',
        slug: `content-home-${testSuffix()}`,
        contentMarkdown: '# Content Home',
        position: 0,
        createdBy: userId,
        updatedBy: userId
      })
      .returning();
    contentEntryId = entry!.id;

    const [file] = await db
      .insert(files)
      .values({
        organizationId,
        uploadedByUserId: userId,
        storageInstance: 'uploads',
        bucket: 'app-uploads',
        objectKey: `org/${organizationId}/uploads/content_upload/${testSuffix()}/content-home.pdf`,
        originalFilename: 'content-home.pdf',
        mimeType: 'application/pdf',
        byteSize: 2048,
        checksumSha256: null,
        etag: null,
        status: 'ready',
        visibility: 'private',
        purpose: 'content_upload',
        metadata: {},
        uploadedAt: new Date(),
        lastAccessedAt: null,
        deletedAt: null,
        purgedAt: null
      })
      .returning();
    fileId = file!.id;
  });

  it('should create the content_attachments table with the expected columns', async () => {
    const result = await pool.query(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'content_attachments'
      ORDER BY ordinal_position
    `);

    expect(result.rows.map((row) => row.column_name)).toEqual([
      'id',
      'organization_id',
      'content_entry_id',
      'file_id',
      'attached_by_user_id',
      'created_at',
      'deleted_at'
    ]);
    expect(result.rows.find((row) => row.column_name === 'file_id')?.is_nullable).toBe('NO');
    expect(result.rows.find((row) => row.column_name === 'deleted_at')?.is_nullable).toBe('YES');
  });

  it('should persist one active attachment per content entry and file pair', async () => {
    const [attachment] = await db
      .insert(contentAttachments)
      .values({
        organizationId,
        contentEntryId,
        fileId,
        attachedByUserId: userId
      })
      .returning();

    expect(attachment?.id).toBeDefined();

    await expectDatabaseConstraint(
      db.insert(contentAttachments).values({
        organizationId,
        contentEntryId,
        fileId,
        attachedByUserId: userId
      }),
      /content_attachments_entry_file_active_uidx|unique|duplicate/i
    );
  });

  it('should allow reattaching the same file after soft delete', async () => {
    const [attachment] = await db
      .insert(contentAttachments)
      .values({
        organizationId,
        contentEntryId,
        fileId,
        attachedByUserId: userId
      })
      .returning();

    await db
      .update(contentAttachments)
      .set({ deletedAt: new Date() })
      .where(eq(contentAttachments.id, attachment!.id));

    const [replacement] = await db
      .insert(contentAttachments)
      .values({
        organizationId,
        contentEntryId,
        fileId,
        attachedByUserId: userId
      })
      .returning();

    expect(replacement?.id).toBeDefined();
    expect(replacement?.id).not.toBe(attachment?.id);
  });
});
