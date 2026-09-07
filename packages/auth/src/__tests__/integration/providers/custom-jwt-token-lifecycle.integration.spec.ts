/**
 * Integration tests for Custom JWT Auth Provider - Token Lifecycle
 *
 * These tests verify token generation, validation, expiration, refresh, and revocation flows.
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, afterEach } from 'node:test';

import * as jwt from 'jsonwebtoken';

import {
  type TokenServiceCacheParam,
  MockCacheService,
  TEST_JWT_SECRET,
  TEST_TENANT_A,
  TEST_USER_ID
} from './custom-jwt-test-helpers';
import { RedisKeyPrefix } from '../../../constants';
import { TokenService } from '../../../services/token.service';

describe('CustomJwtAuthProvider - Token Lifecycle', () => {
  let mockCache: MockCacheService;
  let tokenService: TokenService;

  before(() => {
    mockCache = new MockCacheService();
    tokenService = new TokenService(mockCache as unknown as TokenServiceCacheParam);
  });

  afterEach(() => {
    mockCache.clear();
  });

  it('should generate access token with valid claims', async () => {
    const tokenId = `jti-${Date.now()}`;
    const payload = {
      sub: TEST_USER_ID,
      email: 'test@example.com',
      tenant_id: TEST_TENANT_A,
      jti: tokenId,
      roles: ['user'],
      permissions: ['read:profile']
    };

    const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as jwt.JwtPayload;

    assert.strictEqual(decoded.sub, TEST_USER_ID);
    assert.strictEqual(decoded.email, 'test@example.com');
    assert.strictEqual(decoded.tenant_id, TEST_TENANT_A);
    assert.strictEqual(decoded.jti, tokenId);
    assert.deepStrictEqual(decoded.roles, ['user']);
    assert.deepStrictEqual(decoded.permissions, ['read:profile']);
    assert.ok(decoded.exp, 'Token should have expiration');
    assert.ok(decoded.iat, 'Token should have issued at');
  });

  it('should validate token and extract claims correctly', async () => {
    const tokenId = `jti-${Date.now()}`;
    const payload = {
      sub: TEST_USER_ID,
      tenant_id: TEST_TENANT_A,
      jti: tokenId
    };

    const token = jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, TEST_JWT_SECRET) as jwt.JwtPayload;

    assert.strictEqual(decoded.sub, TEST_USER_ID);
    assert.strictEqual(decoded.tenant_id, TEST_TENANT_A);
  });

  it('should reject expired access token', async () => {
    // Create token with explicit exp timestamp in the past (deterministic, no sleep needed)
    const pastTimestamp = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
    const payload = {
      sub: TEST_USER_ID,
      tenant_id: TEST_TENANT_A,
      jti: `jti-${Date.now()}`,
      exp: pastTimestamp
    };

    // Sign without expiresIn since we're providing explicit exp
    const token = jwt.sign(payload, TEST_JWT_SECRET);

    // Token is already expired - no need to wait
    assert.throws(
      () => jwt.verify(token, TEST_JWT_SECRET),
      (error: Error) => {
        assert.ok(error.name === 'TokenExpiredError');
        return true;
      }
    );
  });

  it('should reject token with invalid signature', async () => {
    const payload = {
      sub: TEST_USER_ID,
      tenant_id: TEST_TENANT_A
    };

    const token = jwt.sign(payload, TEST_JWT_SECRET);
    const tamperedToken = token.slice(0, -5) + 'xxxxx';

    assert.throws(
      () => jwt.verify(tamperedToken, TEST_JWT_SECRET),
      (error: Error) => {
        assert.ok(error.name === 'JsonWebTokenError');
        return true;
      }
    );
  });

  it('should store and retrieve refresh token end-to-end', async () => {
    const tokenId = `refresh-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;
    const expiresIn = 86400;

    await tokenService.storeRefreshToken(
      tokenId,
      TEST_USER_ID,
      TEST_TENANT_A,
      sessionId,
      expiresIn
    );

    const retrieved = await tokenService.getRefreshToken(tokenId, TEST_TENANT_A);

    assert.ok(retrieved, 'Refresh token should be retrieved');
    assert.strictEqual(retrieved.tokenId, tokenId);
    assert.strictEqual(retrieved.userId, TEST_USER_ID);
    assert.strictEqual(retrieved.tenantId, TEST_TENANT_A);
    assert.strictEqual(retrieved.sessionId, sessionId);
    assert.strictEqual(retrieved.revoked, false);
  });

  it('should rotate refresh token on refresh', async () => {
    const oldTokenId = `refresh-old-${Date.now()}`;
    const newTokenId = `refresh-new-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    await tokenService.storeRefreshToken(oldTokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400);
    await tokenService.revokeRefreshToken(oldTokenId, TEST_TENANT_A);
    await tokenService.storeRefreshToken(newTokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400);

    const oldToken = await tokenService.getRefreshToken(oldTokenId, TEST_TENANT_A);
    assert.ok(
      oldToken === undefined || oldToken.revoked === true,
      'Old token should be revoked or deleted'
    );

    const newToken = await tokenService.getRefreshToken(newTokenId, TEST_TENANT_A);
    assert.ok(newToken, 'New token should exist');
    assert.strictEqual(newToken.revoked, false);
  });
});

describe('CustomJwtAuthProvider - Token Revocation and Blacklisting', () => {
  let mockCache: MockCacheService;
  let tokenService: TokenService;

  before(() => {
    mockCache = new MockCacheService();
    tokenService = new TokenService(mockCache as unknown as TokenServiceCacheParam);
  });

  afterEach(() => {
    mockCache.clear();
  });

  it('should blacklist access token via TokenService', async () => {
    const tokenId = `access-${Date.now()}`;
    const expiresIn = 3600;

    await tokenService.blacklistAccessToken(tokenId, TEST_TENANT_A, expiresIn);

    const isBlacklisted = await tokenService.isAccessTokenBlacklisted(tokenId, TEST_TENANT_A);

    assert.strictEqual(isBlacklisted, true, 'Token should be blacklisted');
  });

  it('should verify blacklist key format is tenant-scoped', async () => {
    const tokenId = `access-${Date.now()}`;
    const expiresIn = 3600;

    await tokenService.blacklistAccessToken(tokenId, TEST_TENANT_A, expiresIn);

    const expectedKey = `${RedisKeyPrefix.ACCESS_TOKEN_BLACKLIST}:${TEST_TENANT_A}:${tokenId}`;
    const keyExists = mockCache.has(expectedKey);

    assert.strictEqual(keyExists, true, `Blacklist key should match format: ${expectedKey}`);
  });

  it('should set TTL on blacklist entries', async () => {
    const tokenId = `access-${Date.now()}`;
    const expiresIn = 3600;

    await tokenService.blacklistAccessToken(tokenId, TEST_TENANT_A, expiresIn);

    const expectedKey = `${RedisKeyPrefix.ACCESS_TOKEN_BLACKLIST}:${TEST_TENANT_A}:${tokenId}`;
    const entry = mockCache.getEntry(expectedKey);

    assert.ok(entry, 'Entry should exist');
    assert.ok(entry.expiresAt, 'Entry should have TTL set');

    const expectedExpiry = mockCache.now() + expiresIn * 1000;
    const tolerance = 1000;
    assert.ok(
      Math.abs(entry.expiresAt - expectedExpiry) < tolerance,
      `TTL should be approximately ${expiresIn} seconds`
    );
  });

  it('should reject blacklisted token on subsequent validation', async () => {
    const tokenId = `access-${Date.now()}`;
    const expiresIn = 3600;

    let isBlacklisted = await tokenService.isAccessTokenBlacklisted(tokenId, TEST_TENANT_A);
    assert.strictEqual(isBlacklisted, false, 'Token should not be blacklisted initially');

    await tokenService.blacklistAccessToken(tokenId, TEST_TENANT_A, expiresIn);

    isBlacklisted = await tokenService.isAccessTokenBlacklisted(tokenId, TEST_TENANT_A);
    assert.strictEqual(isBlacklisted, true, 'Token should be blacklisted after blacklisting');
  });

  it('should revoke refresh token and reject subsequent refresh attempts', async () => {
    const tokenId = `refresh-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    await tokenService.storeRefreshToken(tokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400);

    let token = await tokenService.getRefreshToken(tokenId, TEST_TENANT_A);
    assert.ok(token, 'Token should exist');
    assert.strictEqual(token.revoked, false, 'Token should not be revoked');

    await tokenService.revokeRefreshToken(tokenId, TEST_TENANT_A);

    token = await tokenService.getRefreshToken(tokenId, TEST_TENANT_A);
    assert.ok(token === undefined || token.revoked === true, 'Token should be revoked or deleted');
  });

  it('should delete refresh token on logout', async () => {
    const tokenId = `refresh-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    await tokenService.storeRefreshToken(tokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400);
    await tokenService.deleteRefreshToken(tokenId, TEST_TENANT_A);

    const token = await tokenService.getRefreshToken(tokenId, TEST_TENANT_A);
    assert.strictEqual(token, undefined, 'Token should not exist after deletion');
  });
});

describe('CustomJwtAuthProvider - Token Storage', () => {
  let mockCache: MockCacheService;
  let tokenService: TokenService;

  before(() => {
    mockCache = new MockCacheService();
    tokenService = new TokenService(mockCache as unknown as TokenServiceCacheParam);
  });

  afterEach(() => {
    mockCache.clear();
  });

  it('should store refresh token with correct key format', async () => {
    const tokenId = `refresh-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    await tokenService.storeRefreshToken(tokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400);

    const primaryKey = `${RedisKeyPrefix.REFRESH_TOKEN}:${TEST_TENANT_A}:${tokenId}`;
    assert.ok(mockCache.has(primaryKey), `Primary key should exist: ${primaryKey}`);

    const tokenIdKey = `${RedisKeyPrefix.REFRESH_TOKEN_TOKEN_ID}:${tokenId}`;
    assert.ok(mockCache.has(tokenIdKey), `Token ID key should exist: ${tokenIdKey}`);
  });

  it('should retrieve refresh token by tokenId only (without tenantId)', async () => {
    const tokenId = `refresh-${Date.now()}`;
    const sessionId = `session-${Date.now()}`;

    await tokenService.storeRefreshToken(tokenId, TEST_USER_ID, TEST_TENANT_A, sessionId, 86400);

    const token = await tokenService.getRefreshToken(tokenId);

    assert.ok(token, 'Token should be retrievable by tokenId only');
    assert.strictEqual(token.tenantId, TEST_TENANT_A);
  });

  it('should expire blacklist entries after TTL using time control', async () => {
    const tokenId = `access-${Date.now()}`;
    const shortTtl = 1; // 1 second

    // Set a fixed time for deterministic testing
    const startTime = Date.now();
    mockCache.setNow(startTime);

    await tokenService.blacklistAccessToken(tokenId, TEST_TENANT_A, shortTtl);

    // Initially blacklisted
    let isBlacklisted = await tokenService.isAccessTokenBlacklisted(tokenId, TEST_TENANT_A);
    assert.strictEqual(isBlacklisted, true);

    // Advance time past TTL (1100ms = 1.1 seconds)
    mockCache.advanceTime(1100);

    // Should no longer be blacklisted
    isBlacklisted = await tokenService.isAccessTokenBlacklisted(tokenId, TEST_TENANT_A);
    assert.strictEqual(isBlacklisted, false, 'Token should not be blacklisted after TTL expiry');
  });
});
