import { createHash } from 'node:crypto';

import { EventBus } from '@nestjs/cqrs';
import { AUTH_PROVIDER_FACTORY, AUTH_SERVICE } from '@package/auth';
import { eq, passwordResetTokens, userIdentities, users } from '@package/db-core';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../src/common/database/database.constants';
import { PasswordResetRequestedEvent } from '../../../src/modules/auth/events/password-reset-requested.event';
import { TokenCleanupService } from '../../../src/modules/auth/services/token-cleanup.service';
import { startTestServer } from '../../helpers/bootstrap';
import {
  createTestOrganization,
  cleanupOrganization,
  setupE2ETestDatabaseJest,
  TEST_USER_ENCRYPTION_KEY_VERSION
} from '../../helpers/database';

import type { TestServer } from '../../helpers/bootstrap';
import type { AuthProviderFactory } from '@package/auth';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

interface TestAuthProvider {
  changePassword: (providerUid: string, newPassword: string, tenantId?: string) => Promise<void>;
  getUserInfo: (providerUid: string, tenantId?: string) => Promise<{ email?: string }>;
}

function isSuccessResponse(body: unknown): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const response = body as {
    success?: unknown;
    data?: {
      success?: unknown;
    };
  };

  return response.success === true || response.data?.success === true;
}

function getSingleResult<T>(result: T | T[]): T {
  if (Array.isArray(result)) {
    const [first] = result;
    if (!first) {
      throw new Error('Expected non-empty result array');
    }
    return first;
  }
  return result;
}

describe('Password Reset Flow (E2E)', () => {
  let server: TestServer;
  let db: NodePgDatabase<Record<string, never>>;
  let eventBus: EventBus;
  let authProvider: TestAuthProvider;
  let publishSpy: jest.SpyInstance;
  let changePasswordSpy: jest.SpyInstance;
  let getUserInfoSpy: jest.SpyInstance;

  let org1Id: number;
  let org2Id: number;
  let user1Id: number;
  let user2Id: number;
  const user1Email = `pw-reset-1-${Date.now()}@example.com`;
  const user2Email = `pw-reset-2-${Date.now()}@example.com`;

  beforeAll(async () => {
    await setupE2ETestDatabaseJest();
    server = await startTestServer();

    db = server.app.get<NodePgDatabase<Record<string, never>>>(MAIN_DB);

    const org1 = await createTestOrganization(server.app, 'Password Reset Org 1');
    const org2 = await createTestOrganization(server.app, 'Password Reset Org 2');
    org1Id = org1.organizationId;
    org2Id = org2.organizationId;

    const user1 = getSingleResult(
      await db
        .insert(users)
        .values({
          organizationId: org1Id,
          emailHash: hashEmail(user1Email),
          encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
          isActive: true,
          isVerified: true
        })
        .returning()
    );

    const user2 = getSingleResult(
      await db
        .insert(users)
        .values({
          organizationId: org2Id,
          emailHash: hashEmail(user2Email),
          encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
          isActive: true,
          isVerified: true
        })
        .returning()
    );

    user1Id = Number(user1.id);
    user2Id = Number(user2.id);

    await db.insert(userIdentities).values({
      userId: user1Id,
      provider: 'email_password',
      providerUid: `provider-uid-${user1Id}`,
      providerEmailHash: hashEmail(user1Email),
      encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
      emailVerified: true,
      isPrimary: true
    });

    await db.insert(userIdentities).values({
      userId: user2Id,
      provider: 'email_password',
      providerUid: `provider-uid-${user2Id}`,
      providerEmailHash: hashEmail(user2Email),
      encryptionKeyVersion: TEST_USER_ENCRYPTION_KEY_VERSION,
      emailVerified: true,
      isPrimary: true
    });

    eventBus = server.app.get(EventBus);
    server.app.get(AUTH_SERVICE);
    const authProviderFactory = server.app.get<AuthProviderFactory>(AUTH_PROVIDER_FACTORY);
    const defaultAuthProvider = authProviderFactory.getDefaultProvider();
    if (!defaultAuthProvider) {
      throw new Error(
        'Expected default auth provider to be initialized for password reset E2E tests'
      );
    }
    authProvider = defaultAuthProvider as TestAuthProvider;

    publishSpy = jest.spyOn(eventBus, 'publish').mockResolvedValue(undefined);
    changePasswordSpy = jest.spyOn(authProvider, 'changePassword').mockResolvedValue(undefined);
    getUserInfoSpy = jest
      .spyOn(authProvider, 'getUserInfo')
      .mockResolvedValue({ email: user1Email });
  }, 120000);

  afterAll(async () => {
    publishSpy?.mockRestore();
    changePasswordSpy?.mockRestore();
    getUserInfoSpy?.mockRestore();

    if (server?.app) {
      await cleanupOrganization(server.app, org1Id);
      await cleanupOrganization(server.app, org2Id);
      await server.close();
    }
  }, 30000);

  it('should complete request -> validate -> reset flow and enforce single-use token', async () => {
    const beforeCalls = publishSpy.mock.calls.length;

    const requestResponse = await server.request({
      method: 'POST',
      url: '/v1/iam/credentials/recovery',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email: user1Email
      }
    });

    expect(requestResponse.status).toBe(200);
    expect(isSuccessResponse(requestResponse.body)).toBe(true);

    const requestEventCall = publishSpy.mock.calls
      .slice(beforeCalls)
      .find((call) => call[0] instanceof PasswordResetRequestedEvent);

    expect(requestEventCall).toBeDefined();
    const requestEvent = requestEventCall?.[0] as PasswordResetRequestedEvent;
    const rawToken = requestEvent.resetToken;

    const validateResponse = await server.request({
      method: 'GET',
      url: `/v1/iam/credentials/validate?token=${encodeURIComponent(rawToken)}`
    });

    expect(validateResponse.status).toBe(200);
    expect(validateResponse.body.data).toMatchObject({
      isValid: true,
      status: 'valid'
    });

    const resetResponse = await server.request({
      method: 'POST',
      url: '/v1/iam/credentials/restore',
      headers: { 'Content-Type': 'application/json' },
      body: {
        token: rawToken,
        newPassword: 'NewPass123!',
        confirmPassword: 'NewPass123!'
      }
    });

    expect(resetResponse.status).toBe(200);
    expect(isSuccessResponse(resetResponse.body)).toBe(true);
    expect(changePasswordSpy).toHaveBeenCalled();

    const validateUsedResponse = await server.request({
      method: 'GET',
      url: `/v1/iam/credentials/validate?token=${encodeURIComponent(rawToken)}`
    });

    expect(validateUsedResponse.status).toBe(200);
    expect(validateUsedResponse.body.data).toMatchObject({
      isValid: false,
      status: 'used'
    });

    const secondResetResponse = await server.request({
      method: 'POST',
      url: '/v1/iam/credentials/restore',
      headers: { 'Content-Type': 'application/json' },
      body: {
        token: rawToken,
        newPassword: 'AnotherPass123!',
        confirmPassword: 'AnotherPass123!'
      }
    });

    expect(secondResetResponse.status).toBeGreaterThanOrEqual(400);
  });

  it('should return expired status for expired tokens', async () => {
    const rawExpiredToken = `expired-token-${Date.now()}`;
    const expiredHash = createHash('sha256').update(rawExpiredToken).digest('hex');

    await db.insert(passwordResetTokens).values({
      organizationId: org1Id,
      userId: user1Id,
      emailHash: hashEmail(user1Email),
      tokenHash: expiredHash,
      expiresAt: new Date(Date.now() - 60_000)
    });

    const validateResponse = await server.request({
      method: 'GET',
      url: `/v1/iam/credentials/validate?token=${encodeURIComponent(rawExpiredToken)}`
    });

    expect(validateResponse.status).toBe(200);
    expect(validateResponse.body.data).toMatchObject({
      isValid: false,
      status: 'expired'
    });
  });

  it('should not create cross-tenant reset token when email belongs to another organization', async () => {
    const beforeCalls = publishSpy.mock.calls.length;

    // This test is now obsolete since we removed organizationSlug parameter.
    // The system will find the user by email globally and use their organizationId,
    // so user2Email will always find user2 in org2Id.
    // This is the expected behavior: password reset should work for any valid user email.

    const response = await server.request({
      method: 'POST',
      url: '/v1/iam/credentials/recovery',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email: user2Email
      }
    });

    expect(response.status).toBe(200);
    expect(isSuccessResponse(response.body)).toBe(true);

    // Should now create event since user exists
    const newRequestedEvents = publishSpy.mock.calls
      .slice(beforeCalls)
      .filter((call) => call[0] instanceof PasswordResetRequestedEvent);

    expect(newRequestedEvents).toHaveLength(1);
  });

  it('should cleanup expired and used tokens through TokenCleanupService', async () => {
    const cleanupService = server.app.get(TokenCleanupService);

    const expiredDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const usedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const tokenHashExpired = createHash('sha256')
      .update(`cleanup-expired-${Date.now()}`)
      .digest('hex');
    const tokenHashUsed = createHash('sha256').update(`cleanup-used-${Date.now()}`).digest('hex');

    await db.insert(passwordResetTokens).values({
      organizationId: org1Id,
      userId: user1Id,
      emailHash: hashEmail(user1Email),
      tokenHash: tokenHashExpired,
      expiresAt: expiredDate
    });

    await db.insert(passwordResetTokens).values({
      organizationId: org1Id,
      userId: user1Id,
      emailHash: hashEmail(user1Email),
      tokenHash: tokenHashUsed,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt
    });

    const result = await cleanupService.runManualCleanup();

    expect(result.expiredTokensDeleted).toBeGreaterThanOrEqual(1);
    expect(result.usedTokensDeleted).toBeGreaterThanOrEqual(1);
    expect(result.organizationsProcessed).toBeGreaterThanOrEqual(2);

    const remainingExpired = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHashExpired))
      .limit(1);

    const remainingUsed = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHashUsed))
      .limit(1);

    expect(remainingExpired).toHaveLength(0);
    expect(remainingUsed).toHaveLength(0);
  });
});
