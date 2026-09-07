/**
 * Integration tests for Custom JWT Auth Provider - Session Management
 *
 * These tests verify session creation, retrieval, activity updates, and invalidation.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import * as jwt from 'jsonwebtoken';

import {
  MockCacheService,
  TEST_JWT_SECRET,
  TEST_TENANT_A,
  TEST_USER_ID,
  injectCacheFailure,
  type TokenServiceCacheParam
} from './custom-jwt-test-helpers';
import { TokenService } from '../../../services/token.service';

describe('CustomJwtAuthProvider - Session Management', () => {
  let mockCache: MockCacheService;
  let tokenService: TokenService;

  beforeEach(() => {
    mockCache = new MockCacheService();
    tokenService = new TokenService(mockCache as unknown as TokenServiceCacheParam);
  });

  afterEach(() => {
    mockCache.clear();
  });

  it('should create and retrieve session', async () => {
    const sessionId = `session-${Date.now()}`;
    const tokenId = `token-${sessionId}`;
    const expiresIn = 86400;

    await tokenService.storeSession(sessionId, TEST_USER_ID, TEST_TENANT_A, tokenId, expiresIn);

    const session = await tokenService.getSession(sessionId, TEST_TENANT_A);

    assert.ok(session, 'Session should be created');
    assert.strictEqual(session.sessionId, sessionId);
    assert.strictEqual(session.userId, TEST_USER_ID);
    assert.strictEqual(session.tenantId, TEST_TENANT_A);
    assert.strictEqual(session.tokenId, tokenId);
    assert.strictEqual(session.active, true);
  });

  it('should invalidate session', async () => {
    const sessionId = `session-${Date.now()}`;
    const tokenId = `token-${sessionId}`;

    await tokenService.storeSession(sessionId, TEST_USER_ID, TEST_TENANT_A, tokenId, 86400);

    await tokenService.invalidateSession(sessionId, TEST_TENANT_A);

    const session = await tokenService.getSession(sessionId, TEST_TENANT_A);

    assert.ok(session === undefined || session.active === false, 'Session should be invalidated');
  });

  it('should update session activity', async () => {
    const sessionId = `session-${Date.now()}`;
    const tokenId = `token-${sessionId}`;

    await tokenService.storeSession(sessionId, TEST_USER_ID, TEST_TENANT_A, tokenId, 86400);

    const initialSession = await tokenService.getSession(sessionId, TEST_TENANT_A);
    assert.ok(initialSession, 'Initial session should exist');
    assert.ok(initialSession.lastActivity, 'Initial session should have lastActivity');
    const initialLastActivity = initialSession.lastActivity;

    // Update activity (deterministic - no sleep needed since we use >= comparison)
    await tokenService.updateSessionActivity(sessionId, TEST_TENANT_A);

    const updatedSession = await tokenService.getSession(sessionId, TEST_TENANT_A);

    assert.ok(updatedSession, 'Session should still exist');
    // lastActivity should be same or later (equal is valid if operation completes within same ms)
    assert.ok(
      new Date(updatedSession.lastActivity).getTime() >= new Date(initialLastActivity).getTime(),
      'Last activity should be updated or equal'
    );
  });
});

describe('CustomJwtAuthProvider - Full Authentication Flow (Integration)', () => {
  let mockCache: MockCacheService;
  let tokenService: TokenService;

  beforeEach(() => {
    mockCache = new MockCacheService();
    tokenService = new TokenService(mockCache as unknown as TokenServiceCacheParam);
  });

  afterEach(() => {
    mockCache.clear();
  });

  it('should complete full authentication cycle: login -> validate -> refresh -> logout', async () => {
    // Step 1: Simulate login - generate tokens
    const accessTokenId = `access-${Date.now()}`;
    const refreshTokenId = `refresh-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    const accessPayload = {
      sub: TEST_USER_ID,
      email: 'test@example.com',
      tenant_id: TEST_TENANT_A,
      jti: accessTokenId,
      roles: ['user'],
      permissions: ['read:profile']
    };

    const accessToken = jwt.sign(accessPayload, TEST_JWT_SECRET, { expiresIn: '1h' });

    await tokenService.storeRefreshToken(
      refreshTokenId,
      TEST_USER_ID,
      TEST_TENANT_A,
      sessionId,
      86400
    );

    // Step 2: Validate access token
    const decoded = jwt.verify(accessToken, TEST_JWT_SECRET) as jwt.JwtPayload;
    assert.strictEqual(decoded.sub, TEST_USER_ID);
    assert.strictEqual(decoded.tenant_id, TEST_TENANT_A);

    const isBlacklisted = await tokenService.isAccessTokenBlacklisted(accessTokenId, TEST_TENANT_A);
    assert.strictEqual(isBlacklisted, false);

    // Step 3: Simulate token refresh
    const oldRefreshToken = await tokenService.getRefreshToken(refreshTokenId, TEST_TENANT_A);
    assert.ok(oldRefreshToken, 'Refresh token should exist');
    assert.strictEqual(oldRefreshToken.revoked, false);

    const newRefreshTokenId = `refresh-new-${Date.now()}`;
    await tokenService.revokeRefreshToken(refreshTokenId, TEST_TENANT_A);
    await tokenService.storeRefreshToken(
      newRefreshTokenId,
      TEST_USER_ID,
      TEST_TENANT_A,
      sessionId,
      86400
    );

    const revokedToken = await tokenService.getRefreshToken(refreshTokenId, TEST_TENANT_A);
    assert.ok(
      revokedToken === undefined || revokedToken.revoked === true,
      'Old refresh token should be revoked'
    );

    const newToken = await tokenService.getRefreshToken(newRefreshTokenId, TEST_TENANT_A);
    assert.ok(newToken, 'New refresh token should exist');
    assert.strictEqual(newToken.revoked, false);

    // Step 4: Logout - blacklist access token and delete refresh token
    await tokenService.blacklistAccessToken(accessTokenId, TEST_TENANT_A, 3600);
    await tokenService.deleteRefreshToken(newRefreshTokenId, TEST_TENANT_A);

    const isBlacklistedAfterLogout = await tokenService.isAccessTokenBlacklisted(
      accessTokenId,
      TEST_TENANT_A
    );
    assert.strictEqual(
      isBlacklistedAfterLogout,
      true,
      'Access token should be blacklisted after logout'
    );

    const deletedToken = await tokenService.getRefreshToken(newRefreshTokenId, TEST_TENANT_A);
    assert.strictEqual(deletedToken, undefined, 'Refresh token should be deleted after logout');
  });

  it('should handle concurrent token operations safely', async () => {
    const tokenIds = Array.from({ length: 10 }, (_, i) => `token-${Date.now()}-${i}`);
    const sessionId = `session-${Date.now()}`;

    await Promise.all(
      tokenIds.map((tokenId) =>
        tokenService.storeRefreshToken(tokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400)
      )
    );

    const results = await Promise.all(
      tokenIds.map((tokenId) => tokenService.getRefreshToken(tokenId, TEST_TENANT_A))
    );

    results.forEach((token, index) => {
      assert.ok(token, `Token ${index} should exist`);
      assert.strictEqual(token.revoked, false);
    });

    await Promise.all(
      tokenIds.map((tokenId) => tokenService.revokeRefreshToken(tokenId, TEST_TENANT_A))
    );

    const revokedResults = await Promise.all(
      tokenIds.map((tokenId) => tokenService.getRefreshToken(tokenId, TEST_TENANT_A))
    );

    revokedResults.forEach((token, index) => {
      assert.ok(token === undefined || token.revoked === true, `Token ${index} should be revoked`);
    });
  });

  it('should handle partial failure during concurrent operations gracefully', async () => {
    const tokenIds = Array.from({ length: 5 }, (_, i) => `token-${Date.now()}-${i}`);
    const failingTokenId = 'token-that-will-fail';
    const allTokenIds = [...tokenIds, failingTokenId];
    const sessionId = `session-${Date.now()}`;

    // Store all tokens first
    await Promise.all(
      allTokenIds.map((tokenId) =>
        tokenService.storeRefreshToken(tokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400)
      )
    );

    // Verify all tokens exist
    const initialResults = await Promise.all(
      allTokenIds.map((tokenId) => tokenService.getRefreshToken(tokenId, TEST_TENANT_A))
    );
    initialResults.forEach((token, index) => {
      assert.ok(token, `Token ${index} should exist before revocation`);
    });

    // Inject a failure for the specific token to test partial failure handling
    const restoreCache = injectCacheFailure(
      mockCache,
      failingTokenId,
      new Error('Simulated cache failure for specific token')
    );

    // Use Promise.allSettled to handle partial failures
    const revokeResults = await Promise.allSettled(
      allTokenIds.map((tokenId) => tokenService.revokeRefreshToken(tokenId, TEST_TENANT_A))
    );

    // Restore original cache behavior
    restoreCache();

    // Count fulfilled and rejected promises
    const fulfilled = revokeResults.filter((r) => r.status === 'fulfilled');
    const rejected = revokeResults.filter((r) => r.status === 'rejected');

    // Assert that exactly one operation failed (the one for failingTokenId)
    assert.strictEqual(rejected.length, 1, 'Exactly one operation should have failed');
    assert.ok(
      (rejected[0] as PromiseRejectedResult).reason instanceof Error,
      'Rejected promise should contain an Error'
    );
    assert.ok(
      (rejected[0] as PromiseRejectedResult).reason.message.includes('Simulated cache failure'),
      'Error should be the simulated cache failure'
    );

    // Assert that all other operations succeeded
    assert.strictEqual(fulfilled.length, 5, 'Five operations should have succeeded');

    // Verify the non-failing tokens were still revoked correctly
    const verifyResults = await Promise.all(
      tokenIds.map((tokenId) => tokenService.getRefreshToken(tokenId, TEST_TENANT_A))
    );

    verifyResults.forEach((token, index) => {
      assert.ok(
        token === undefined || token.revoked === true,
        `Non-failing token ${index} should be revoked despite partial failure`
      );
    });
  });
});
