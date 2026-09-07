/**
 * Unit tests for Token Service Redis read/write round-trips
 *
 * Reproduces the double-JSON.parse bug: CacheService.get() already parses the
 * stored JSON, but TokenService re-parsed the parsed object with
 * JSON.parse(object), which coerces to "[object Object]" and throws a
 * SyntaxError wrapped in TokenOperationError.
 *
 * Uses the real CacheService (MockRedis backend via TEST_MODE) to exercise the
 * production set→stringify / get→parse contract.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { CacheService } from '@package/redis';

import { SessionNotFoundError } from '../../../errors';
import { TokenService } from '../../../services/token.service';

describe('TokenService (Redis round-trip)', () => {
  const tokenService = new TokenService(new CacheService());

  it('should return the stored refresh token info from getRefreshToken', async () => {
    await tokenService.storeRefreshToken('tok-1', 'user-1', 'tenant-1', 'sess-1', 3600);

    const result = await tokenService.getRefreshToken('tok-1', 'tenant-1');

    assert.ok(result, 'getRefreshToken must return the stored token info');
    assert.strictEqual(result.tokenId, 'tok-1');
    assert.strictEqual(result.userId, 'user-1');
    assert.strictEqual(result.tenantId, 'tenant-1');
    assert.strictEqual(result.sessionId, 'sess-1');
    assert.strictEqual(result.revoked, false);
  });

  it('should return undefined for a missing refresh token', async () => {
    const result = await tokenService.getRefreshToken('does-not-exist', 'tenant-1');
    assert.strictEqual(result, undefined);
  });

  it('should look up refresh token by tokenId when tenantId is omitted', async () => {
    await tokenService.storeRefreshToken('tok-lookup', 'user-2', 'tenant-2', 'sess-2', 3600);

    const result = await tokenService.getRefreshToken('tok-lookup');

    assert.ok(result, 'getRefreshToken by tokenId must return the stored token info');
    assert.strictEqual(result.tenantId, 'tenant-2');
  });

  it('should return the stored session from getSession', async () => {
    await tokenService.storeSession('sess-3', 'user-3', 'tenant-3', 'tok-3', 3600);

    const session = await tokenService.getSession('sess-3', 'tenant-3');

    assert.strictEqual(session.sessionId, 'sess-3');
    assert.strictEqual(session.userId, 'user-3');
    assert.strictEqual(session.active, true);
  });

  it('should throw SessionNotFoundError only when the session does not exist', async () => {
    await assert.rejects(
      () => tokenService.getSession('missing-session', 'tenant-3'),
      (error: unknown) => error instanceof SessionNotFoundError
    );
  });

  it('should revoke a refresh token without throwing', async () => {
    await tokenService.storeRefreshToken('tok-4', 'user-4', 'tenant-4', 'sess-4', 3600);

    await tokenService.revokeRefreshToken('tok-4', 'tenant-4');

    const revoked = await tokenService.getRefreshToken('tok-4', 'tenant-4');
    assert.ok(revoked, 'revoked token should remain readable');
    assert.strictEqual(revoked.revoked, true);
  });

  it('should update session activity without throwing and preserve expiry', async () => {
    await tokenService.storeSession('sess-5', 'user-5', 'tenant-5', 'tok-5', 3600);

    await tokenService.updateSessionActivity('sess-5', 'tenant-5');

    const session = await tokenService.getSession('sess-5', 'tenant-5');
    // Dates serialize to ISO strings in Redis; just require a parseable value
    assert.ok(session.lastActivity, 'lastActivity must be set');
    assert.ok(!Number.isNaN(new Date(session.lastActivity as unknown as Date).getTime()));
    assert.ok(session.expiresAt, 'original expiration must be preserved');
  });

  it('should invalidate a session without throwing', async () => {
    await tokenService.storeSession('sess-6', 'user-6', 'tenant-6', 'tok-6', 3600);

    await tokenService.invalidateSession('sess-6', 'tenant-6');

    const session = await tokenService.getSession('sess-6', 'tenant-6');
    assert.strictEqual(session.active, false);
  });
});
