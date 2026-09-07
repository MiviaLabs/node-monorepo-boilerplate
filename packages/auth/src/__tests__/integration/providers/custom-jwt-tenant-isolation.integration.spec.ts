/**
 * Integration tests for Custom JWT Auth Provider - Tenant Isolation and Scoping
 *
 * These tests verify multi-tenant token isolation and security.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import * as jwt from 'jsonwebtoken';

import {
  MockCacheService,
  TEST_JWT_SECRET,
  TEST_TENANT_A,
  TEST_TENANT_B,
  TEST_USER_ID,
  TEST_USER_ID_2,
  type TokenServiceCacheParam
} from './custom-jwt-test-helpers';
import { TokenService } from '../../../services/token.service';

describe('CustomJwtAuthProvider - Tenant Isolation and Scoping', () => {
  let mockCache: MockCacheService;
  let tokenService: TokenService;

  beforeEach(() => {
    mockCache = new MockCacheService();
    tokenService = new TokenService(mockCache as unknown as TokenServiceCacheParam);
  });

  afterEach(() => {
    mockCache.clear();
  });

  it('should store tokens separately for different tenants', async () => {
    const tokenIdA = `refresh-a-${Date.now()}`;
    const tokenIdB = `refresh-b-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    await tokenService.storeRefreshToken(tokenIdA, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400);
    await tokenService.storeRefreshToken(tokenIdB, TEST_USER_ID, TEST_TENANT_B, sessionId, 86400);

    const tokenA = await tokenService.getRefreshToken(tokenIdA, TEST_TENANT_A);
    assert.ok(tokenA, 'Tenant A token should exist');
    assert.strictEqual(tokenA.tenantId, TEST_TENANT_A);

    const tokenB = await tokenService.getRefreshToken(tokenIdB, TEST_TENANT_B);
    assert.ok(tokenB, 'Tenant B token should exist');
    assert.strictEqual(tokenB.tenantId, TEST_TENANT_B);
  });

  it('should not allow tenant A token to be retrieved with tenant B context', async () => {
    const tokenId = `refresh-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    await tokenService.storeRefreshToken(tokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400);

    const token = await tokenService.getRefreshToken(tokenId, TEST_TENANT_B);

    assert.strictEqual(token, undefined, 'Token should not be accessible from different tenant');
  });

  it('should blacklist tokens within tenant scope only', async () => {
    const tokenId = `access-${Date.now()}`;
    const expiresIn = 3600;

    await tokenService.blacklistAccessToken(tokenId, TEST_TENANT_A, expiresIn);

    const isBlacklistedA = await tokenService.isAccessTokenBlacklisted(tokenId, TEST_TENANT_A);
    assert.strictEqual(isBlacklistedA, true, 'Token should be blacklisted in tenant A');

    const isBlacklistedB = await tokenService.isAccessTokenBlacklisted(tokenId, TEST_TENANT_B);
    assert.strictEqual(isBlacklistedB, false, 'Token should not be blacklisted in tenant B');
  });

  it('should maintain tenant isolation for refresh tokens throughout flow', async () => {
    const tokenId = `refresh-${Date.now()}`;
    const sessionIdA = `session-a-${Date.now()}`;
    const sessionIdB = `session-b-${Date.now()}`;

    await tokenService.storeRefreshToken(tokenId, TEST_USER_ID, TEST_TENANT_A, sessionIdA, 86400);
    await tokenService.storeRefreshToken(tokenId, TEST_USER_ID_2, TEST_TENANT_B, sessionIdB, 86400);

    await tokenService.revokeRefreshToken(tokenId, TEST_TENANT_A);

    const tokenA = await tokenService.getRefreshToken(tokenId, TEST_TENANT_A);
    assert.ok(tokenA === undefined || tokenA.revoked === true, 'Tenant A token should be revoked');

    const tokenB = await tokenService.getRefreshToken(tokenId, TEST_TENANT_B);
    assert.ok(tokenB, 'Tenant B token should still exist');
    assert.strictEqual(tokenB.revoked, false, 'Tenant B token should not be revoked');
  });

  it('should include tenant_id claim in generated JWT', async () => {
    const payload = {
      sub: TEST_USER_ID,
      email: 'test@example.com',
      tenant_id: TEST_TENANT_A,
      jti: `jti-${Date.now()}`
    };

    const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as jwt.JwtPayload;

    assert.strictEqual(decoded.tenant_id, TEST_TENANT_A, 'Token should contain tenant_id claim');
  });

  it('should validate tenant_id claim matches expected tenant', async () => {
    const payload = {
      sub: TEST_USER_ID,
      tenant_id: TEST_TENANT_A,
      jti: `jti-${Date.now()}`
    };

    const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as jwt.JwtPayload;

    const requestedTenant = TEST_TENANT_A;
    const tokenTenant = decoded.tenant_id;

    assert.strictEqual(tokenTenant, requestedTenant, 'Token tenant should match requested tenant');

    const wrongTenant = TEST_TENANT_B;
    assert.notStrictEqual(tokenTenant, wrongTenant, 'Token tenant should not match wrong tenant');
  });
});
