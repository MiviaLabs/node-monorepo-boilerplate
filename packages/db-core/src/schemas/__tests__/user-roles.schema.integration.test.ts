import { describe, beforeAll, afterAll, it, expect, jest } from '@jest/globals';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as pg from 'pg';

import { runMigrations } from '../../migrations/runner';
import { organizations, tenants, userRoles, users } from '../../schemas';

jest.setTimeout(60000);

const { Pool } = pg;
const TEST_ENCRYPTION_KEY_VERSION = 'primary-encryption-key';

describe('User Roles Schema Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: pg.Pool;
  let db: ReturnType<typeof drizzle>;
  let organizationId: number;
  let assigneeId: number;
  let assignerId: number;

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
        name: 'Roles Test Organization',
        slug: 'roles-test-organization',
        tenantId: tenant!.id
      })
      .returning();
    organizationId = organization!.id;

    const [assignee] = await db
      .insert(users)
      .values({
        organizationId,
        encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
        displayName: 'Assignee'
      })
      .returning();
    assigneeId = assignee!.id;

    const [assigner] = await db
      .insert(users)
      .values({
        organizationId,
        encryptionKeyVersion: TEST_ENCRYPTION_KEY_VERSION,
        displayName: 'Assigner'
      })
      .returning();
    assignerId = assigner!.id;
  });

  afterAll(async () => {
    if (db) {
      await db.delete(userRoles);
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

  it('should apply SET NULL delete behavior for assigned_by', async () => {
    await db.insert(userRoles).values({
      userId: assigneeId,
      role: 'system_admin',
      assignedBy: assignerId
    });

    await db.delete(users).where(eq(users.id, assignerId));

    const result = await pool.query(
      `
      SELECT assigned_by
      FROM user_roles
      WHERE user_id = $1
    `,
      [assigneeId]
    );

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.assigned_by).toBeNull();
  });

  it('should expose assigned_by foreign key as SET NULL in postgres metadata', async () => {
    const result = await pool.query(`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      WHERE rc.constraint_name = 'user_roles_assigned_by_users_id_fk'
    `);

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.delete_rule).toBe('SET NULL');
  });
});
