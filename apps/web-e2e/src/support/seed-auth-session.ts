import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import jwt from 'jsonwebtoken';
import { Pool } from 'pg';

import type { BrowserContext } from '@playwright/test';

const workspaceRoot = resolve(__dirname, '../../../..');
const CONNECTION_FILE_CANDIDATES = [
  resolve(workspaceRoot, 'apps/web-e2e/.test-db-connection.json'),
  resolve(workspaceRoot, '.test-db-connection.json'),
  resolve(workspaceRoot, 'apps/api/.test-db-connection.json')
];

const TEST_JWT_SECRET =
  process.env['JWT_SECRET'] ?? 'test-jwt-secret-at-least-32-characters-long-for-e2e-flow';

const TEST_ENCRYPTION_KEY_VERSION = 'primary-encryption-key/cryptoKeyVersions/1';
const SESSION_BASE_URLS = Array.from(
  new Set([
    process.env['BASE_URL'] ?? 'http://localhost:3001',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
  ])
);

const OWNER_PERMISSIONS = [
  'tenant:projects:read',
  'tenant:projects:create',
  'tenant:projects:update',
  'tenant:projects:delete',
  'tenant:members:read',
  'tenant:settings:read'
] as const;

type SeededTenantRole = 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer';
type SeededPermission = (typeof OWNER_PERMISSIONS)[number] | 'tenant:members:update' | string;

interface SeedSessionInput {
  displayName: string;
  email: string;
  organizationName: string;
}

interface SeedOrganizationMemberSessionInput {
  organizationId: number;
  tenantRecordId: number;
  displayName: string;
  email: string;
  role?: SeededTenantRole;
  permissions: SeededPermission[];
}

interface SeedProjectInput {
  organizationId: number;
  createdByUserId: number;
  name: string;
  visibility?: 'public' | 'private';
  memberUserIds?: number[];
}

interface SeededSession {
  accessToken: string;
  tenantId: string;
  userId: number;
  organizationId: number;
  tenantRecordId: number;
}

let schemaReadyPromise: Promise<void> | null = null;

async function getConnectionUrl(): Promise<string> {
  const preferredConnectionFile = CONNECTION_FILE_CANDIDATES[0];
  const waitUntil = Date.now() + 30_000;

  while (
    preferredConnectionFile &&
    !existsSync(preferredConnectionFile) &&
    Date.now() < waitUntil
  ) {
    if (CONNECTION_FILE_CANDIDATES.slice(1).some((candidate) => existsSync(candidate))) {
      await new Promise((resolvePromise) => {
        setTimeout(resolvePromise, 250);
      });
      continue;
    }

    break;
  }

  const connectionFile = CONNECTION_FILE_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!connectionFile) {
    throw new Error(
      `Missing test DB connection file. Checked: ${CONNECTION_FILE_CANDIDATES.join(', ')}`
    );
  }

  const parsed = JSON.parse(readFileSync(connectionFile, 'utf-8')) as {
    connectionUrl?: string;
    databases?: {
      main?: {
        connectionUrl?: string;
      };
    };
  };

  const connectionUrl = parsed.databases?.main?.connectionUrl ?? parsed.connectionUrl;
  if (!connectionUrl) {
    throw new Error(`No main connection URL found in ${connectionFile}`);
  }

  return connectionUrl;
}

function buildSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

async function ensureMainSchemaReady(connectionUrl: string): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const timeoutAt = Date.now() + 60_000;

      while (Date.now() < timeoutAt) {
        const pool = new Pool({ connectionString: connectionUrl });

        try {
          const result = await pool.query<{ exists: string | null }>(
            `select to_regclass('public.tenants') as exists`
          );

          if (result.rows[0]?.exists) {
            return;
          }
        } finally {
          await pool.end();
        }

        await new Promise((resolvePromise) => {
          setTimeout(resolvePromise, 1_000);
        });
      }

      throw new Error('Timed out waiting for test database schema to become ready');
    })();
  }

  await schemaReadyPromise;
}

export async function seedAuthenticatedOwnerSession(
  input: SeedSessionInput
): Promise<SeededSession> {
  const connectionUrl = await getConnectionUrl();
  await ensureMainSchemaReady(connectionUrl);
  const pool = new Pool({ connectionString: connectionUrl });

  try {
    const tenantResult = await pool.query<{ id: number }>(
      `insert into tenants (type, status) values ('organization', 'active') returning id`
    );
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) {
      throw new Error('Failed to create tenant for web E2E auth session');
    }

    const slugBase = buildSlug(input.organizationName);
    const slug = `${slugBase}-${Date.now().toString().slice(-6)}`.slice(0, 50);
    const organizationResult = await pool.query<{ id: number }>(
      `insert into organizations (tenant_id, name, display_name, slug, is_active)
       values ($1, $2, $2, $3, true)
       returning id`,
      [tenantId, input.organizationName, slug]
    );
    const organizationId = organizationResult.rows[0]?.id;
    if (!organizationId) {
      throw new Error('Failed to create organization for web E2E auth session');
    }

    const userResult = await pool.query<{ id: number }>(
      `insert into users (
         organization_id,
         email_hash,
         display_name,
         encryption_key_version,
         is_active,
         is_verified
       )
       values ($1, $2, $3, $4, true, true)
       returning id`,
      [organizationId, hashEmail(input.email), input.displayName, TEST_ENCRYPTION_KEY_VERSION]
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      throw new Error('Failed to create user for web E2E auth session');
    }

    await pool.query(`update organizations set owner_id = $1 where id = $2`, [
      userId,
      organizationId
    ]);

    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role, is_default, is_active)
       values ($1, $2, 'tenant_owner', true, true)`,
      [userId, tenantId]
    );

    const accessToken = jwt.sign(
      {
        sub: String(userId),
        db_user_id: String(userId),
        tenant_id: String(organizationId),
        organization_id: String(organizationId),
        actor_id: String(userId),
        email: input.email,
        name: input.displayName,
        roles: ['tenant_owner'],
        permissions: [...OWNER_PERMISSIONS]
      },
      TEST_JWT_SECRET,
      { expiresIn: '1h' }
    );

    return {
      accessToken,
      tenantId: String(organizationId),
      userId,
      organizationId,
      tenantRecordId: tenantId
    };
  } finally {
    await pool.end();
  }
}

export async function seedAuthenticatedOrganizationMemberSession(
  input: SeedOrganizationMemberSessionInput
): Promise<SeededSession> {
  const connectionUrl = await getConnectionUrl();
  await ensureMainSchemaReady(connectionUrl);
  const pool = new Pool({ connectionString: connectionUrl });
  const role = input.role ?? 'tenant_user';

  try {
    const userResult = await pool.query<{ id: number }>(
      `insert into users (
         organization_id,
         email_hash,
         display_name,
         encryption_key_version,
         is_active,
         is_verified
       )
       values ($1, $2, $3, $4, true, true)
       returning id`,
      [input.organizationId, hashEmail(input.email), input.displayName, TEST_ENCRYPTION_KEY_VERSION]
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      throw new Error('Failed to create organization member for web E2E auth session');
    }

    await pool.query(
      `insert into user_tenants (user_id, tenant_id, role, is_default, is_active)
       values ($1, $2, $3, false, true)`,
      [userId, input.tenantRecordId, role]
    );

    const accessToken = jwt.sign(
      {
        sub: String(userId),
        db_user_id: String(userId),
        tenant_id: String(input.organizationId),
        organization_id: String(input.organizationId),
        actor_id: String(userId),
        email: input.email,
        name: input.displayName,
        roles: [role],
        permissions: [...input.permissions]
      },
      TEST_JWT_SECRET,
      { expiresIn: '1h' }
    );

    return {
      accessToken,
      tenantId: String(input.organizationId),
      userId,
      organizationId: input.organizationId,
      tenantRecordId: input.tenantRecordId
    };
  } finally {
    await pool.end();
  }
}

export async function seedProject(input: SeedProjectInput): Promise<{ id: number; name: string }> {
  const connectionUrl = await getConnectionUrl();
  await ensureMainSchemaReady(connectionUrl);
  const pool = new Pool({ connectionString: connectionUrl });
  const visibility = input.visibility ?? 'private';

  try {
    const projectResult = await pool.query<{ id: number; name: string }>(
      `insert into projects (organization_id, created_by, name, visibility)
       values ($1, $2, $3, $4)
       returning id, name`,
      [input.organizationId, input.createdByUserId, input.name, visibility]
    );
    const project = projectResult.rows[0];

    if (!project?.id) {
      throw new Error('Failed to create project fixture for web E2E');
    }

    const memberUserIds = Array.from(
      new Set([input.createdByUserId, ...(input.memberUserIds ?? [])])
    );

    for (const memberUserId of memberUserIds) {
      await pool.query(
        `insert into project_members (project_id, user_id, assigned_by_user_id)
         values ($1, $2, $3)
         on conflict (project_id, user_id) do nothing`,
        [project.id, memberUserId, input.createdByUserId]
      );
    }

    return project;
  } finally {
    await pool.end();
  }
}

export async function installSeededSession(
  context: BrowserContext,
  session: SeededSession
): Promise<void> {
  await context.addCookies(
    SESSION_BASE_URLS.flatMap((url) => [
      {
        name: 'accessToken',
        value: session.accessToken,
        url
      },
      {
        name: 'tenantId',
        value: session.tenantId,
        url
      }
    ])
  );
}
