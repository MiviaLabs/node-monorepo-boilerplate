import { createHash } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { getRedisClient } from '@package/redis';
import request from 'supertest';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { startTestServer } from '../../helpers/bootstrap';
import {
  setupE2ETestDatabaseJest,
  createTestOrganization,
  createTestUserTenant,
  TEST_USER_ENCRYPTION_KEY_VERSION
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

describe('Get User Sessions E2E', () => {
  let server: TestServer;
  let jwtService: JwtService;
  let db: NodePgDatabase<Record<string, never>>;

  let tenantAId: number;
  let tenantBId: number;
  let userAId: number;
  let userBId: number;
  let tenantAToken: string;

  async function seedSession(params: {
    tenantId: number;
    sessionId: string;
    userId: number;
    tokenId: string;
    active?: boolean;
    accessTokenId?: string;
    accessTokenExpiresAt?: string;
  }): Promise<void> {
    const redis = getRedisClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86400 * 1000);
    const active = params.active ?? true;

    await redis.setex(
      `auth:session:${params.tenantId}:${params.sessionId}`,
      86400,
      JSON.stringify({
        sessionId: params.sessionId,
        userId: String(params.userId),
        tenantId: String(params.tenantId),
        tokenId: params.tokenId,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        lastActivity: now.toISOString(),
        ...(params.accessTokenId !== undefined && { accessTokenId: params.accessTokenId }),
        ...(params.accessTokenExpiresAt !== undefined && {
          accessTokenExpiresAt: params.accessTokenExpiresAt
        }),
        active
      })
    );

    await redis.setex(
      `auth:refresh:${params.tenantId}:${params.tokenId}`,
      86400,
      JSON.stringify({
        tokenId: params.tokenId,
        userId: String(params.userId),
        tenantId: String(params.tenantId),
        sessionId: params.sessionId,
        expiresAt: expiresAt.toISOString(),
        revoked: false
      })
    );

    await redis.setex(
      `auth:refresh:token-id:${params.tokenId}`,
      86400,
      JSON.stringify({
        tokenId: params.tokenId,
        userId: String(params.userId),
        tenantId: String(params.tenantId),
        sessionId: params.sessionId,
        expiresAt: expiresAt.toISOString(),
        revoked: false
      })
    );

    await redis.zadd(
      `auth:user-sessions:${params.tenantId}:${params.userId}`,
      expiresAt.getTime(),
      params.sessionId
    );
    await redis.expire(`auth:user-sessions:${params.tenantId}:${params.userId}`, 86400);
    await redis.setex(
      `auth:user-sessions:index-ready:${params.tenantId}:${params.userId}`,
      86400,
      '1'
    );
  }

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();

    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);
    jwtService = server.app.get<JwtService>(JwtService);

    const tenantA = await createTestOrganization(server.app, 'Session Tenant A');
    const tenantB = await createTestOrganization(server.app, 'Session Tenant B');
    tenantAId = tenantA.organizationId;
    tenantBId = tenantB.organizationId;

    const { users } = await import('@package/db-core');

    const [userA] = await db
      .insert(users)
      .values({
        organizationId: tenantAId,
        emailHash: `session-user-a-${Date.now()}`,
        encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
        isActive: true,
        isVerified: true
      })
      .returning();

    const [userB] = await db
      .insert(users)
      .values({
        organizationId: tenantBId,
        emailHash: `session-user-b-${Date.now()}`,
        encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
        isActive: true,
        isVerified: true
      })
      .returning();

    if (!userA || !userB) {
      throw new Error('Failed to create test users for session E2E');
    }

    userAId = userA.id;
    userBId = userB.id;

    await createTestUserTenant(server.app, userAId, tenantA.tenantId, 'tenant_admin', false);
    await createTestUserTenant(server.app, userBId, tenantB.tenantId, 'tenant_admin', false);

    tenantAToken = jwtService.sign({
      sub: String(userAId),
      db_user_id: String(userAId),
      tenant_id: String(tenantAId),
      actor_id: String(userAId),
      email: 'session-user-a@example.com',
      name: 'Session User A',
      roles: ['tenant_admin'],
      permissions: ['*']
    });
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it('returns only sessions for the authenticated user within the current tenant', async () => {
    await seedSession({
      tenantId: tenantAId,
      sessionId: 'session-active-a',
      userId: userAId,
      tokenId: 'token-a'
    });
    await seedSession({
      tenantId: tenantAId,
      sessionId: 'session-other-user',
      userId: userBId,
      tokenId: 'token-c'
    });
    await seedSession({
      tenantId: tenantBId,
      sessionId: 'session-other-tenant',
      userId: userAId,
      tokenId: 'token-d'
    });

    const response = await request(server.app.getHttpServer())
      .get('/v1/iam/sessions')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', String(tenantAId));

    expect(response.status).toBe(200);

    const sessions = (response.body as { data?: Array<Record<string, unknown>> }).data ?? [];

    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        id: 'session-active-a',
        userId: userAId,
        tenantId: String(tenantAId),
        tokenId: 'token-a',
        active: true
      })
    );
  });

  it('revokes a session for the authenticated user within the current tenant', async () => {
    const revokedAccessToken = jwtService.sign({
      sub: String(userAId),
      db_user_id: String(userAId),
      tenant_id: String(tenantAId),
      actor_id: String(userAId),
      email: 'session-user-a@example.com',
      name: 'Session User A',
      jti: 'revoked-session-token',
      roles: ['tenant_admin'],
      permissions: ['*']
    });
    const accessTokenId = createHash('sha256').update(revokedAccessToken).digest('hex');
    await seedSession({
      tenantId: tenantAId,
      sessionId: 'session-revoke-a',
      userId: userAId,
      tokenId: 'token-revoke-a',
      accessTokenId,
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString()
    });

    const response = await request(server.app.getHttpServer())
      .delete('/v1/iam/sessions/session-revoke-a')
      .set('Authorization', `Bearer ${revokedAccessToken}`)
      .set('x-tenant-id', String(tenantAId));

    expect(response.status).toBe(204);

    const redis = getRedisClient();
    const storedSession = await redis.get(`auth:session:${tenantAId}:session-revoke-a`);
    const storedRefreshToken = await redis.get(`auth:refresh:${tenantAId}:token-revoke-a`);
    const storedRefreshLookup = await redis.get(`auth:refresh:token-id:token-revoke-a`);
    const remainingIndexedSessions = await redis.zrange(
      `auth:user-sessions:${tenantAId}:${userAId}`,
      0,
      -1
    );

    expect(storedSession).not.toBeNull();
    expect(JSON.parse(storedSession ?? '{}')).toEqual(
      expect.objectContaining({
        sessionId: 'session-revoke-a',
        active: false
      })
    );
    expect(storedRefreshToken).toBeNull();
    expect(storedRefreshLookup).toBeNull();
    expect(remainingIndexedSessions).not.toContain('session-revoke-a');

    const followUpResponse = await request(server.app.getHttpServer())
      .get('/v1/iam/sessions')
      .set('Authorization', `Bearer ${revokedAccessToken}`)
      .set('x-tenant-id', String(tenantAId));

    expect(followUpResponse.status).toBe(401);
  });

  it('returns 404 when the session belongs to another user in the same tenant', async () => {
    await seedSession({
      tenantId: tenantAId,
      sessionId: 'session-other-user-same-tenant',
      userId: userBId,
      tokenId: 'token-other-user-same-tenant'
    });

    const response = await request(server.app.getHttpServer())
      .delete('/v1/iam/sessions/session-other-user-same-tenant')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', String(tenantAId));

    expect(response.status).toBe(404);
  });

  it('returns 404 when the session does not exist', async () => {
    const response = await request(server.app.getHttpServer())
      .delete('/v1/iam/sessions/missing-session')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', String(tenantAId));

    expect(response.status).toBe(404);
  });

  it('returns 404 when the session exists in another tenant', async () => {
    await seedSession({
      tenantId: tenantBId,
      sessionId: 'session-tenant-b',
      userId: userAId,
      tokenId: 'token-tenant-b'
    });

    const response = await request(server.app.getHttpServer())
      .delete('/v1/iam/sessions/session-tenant-b')
      .set('Authorization', `Bearer ${tenantAToken}`)
      .set('x-tenant-id', String(tenantAId));

    expect(response.status).toBe(404);
  });
});
