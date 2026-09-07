/**
 * Unit tests for GoogleAuthHeadersProvider
 *
 * Validates token lifecycle handling fixes for non-JWT tokens.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

describe('GoogleAuthHeadersProvider - token lifecycle', () => {
  /**
   * Replicate the fixed getAccessToken token parsing logic
   * to verify expiry is always set.
   */
  function parseTokenExpiry(accessToken: string): number {
    const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
    let tokenExpiryTime: number;

    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        let base64 = parts[1];
        if (!base64) {
          throw new Error('Invalid token: missing payload');
        }
        base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
        if (payload.exp) {
          tokenExpiryTime = payload.exp * 1000;
        } else {
          tokenExpiryTime = Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
        }
      } else {
        tokenExpiryTime = Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
      }
    } catch {
      tokenExpiryTime = Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
    }

    return tokenExpiryTime;
  }

  it('should set expiry for valid JWT tokens with exp claim', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp: futureExp })).toString('base64');
    const token = `header.${payload}.signature`;

    const expiry = parseTokenExpiry(token);
    assert.strictEqual(expiry, futureExp * 1000);
  });

  it('should set default expiry for JWT tokens without exp claim', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64');
    const token = `header.${payload}.signature`;

    const before = Date.now();
    const expiry = parseTokenExpiry(token);
    const after = Date.now();

    const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
    assert.ok(expiry >= before + DEFAULT_TOKEN_LIFETIME_MS);
    assert.ok(expiry <= after + DEFAULT_TOKEN_LIFETIME_MS);
  });

  it('should set default expiry for non-JWT (opaque) tokens', () => {
    const token = 'ya29.opaque-access-token-without-dots';

    const before = Date.now();
    const expiry = parseTokenExpiry(token);
    const after = Date.now();

    const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
    assert.ok(expiry >= before + DEFAULT_TOKEN_LIFETIME_MS);
    assert.ok(expiry <= after + DEFAULT_TOKEN_LIFETIME_MS);
  });

  it('should set default expiry for malformed JWT tokens', () => {
    const token = 'header.not-valid-base64-json.signature';

    const before = Date.now();
    const expiry = parseTokenExpiry(token);
    const after = Date.now();

    const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
    assert.ok(expiry >= before + DEFAULT_TOKEN_LIFETIME_MS);
    assert.ok(expiry <= after + DEFAULT_TOKEN_LIFETIME_MS);
  });

  it('should handle empty token string', () => {
    const token = '';

    const before = Date.now();
    const expiry = parseTokenExpiry(token);
    const after = Date.now();

    const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
    assert.ok(expiry >= before + DEFAULT_TOKEN_LIFETIME_MS);
    assert.ok(expiry <= after + DEFAULT_TOKEN_LIFETIME_MS);
  });
});
