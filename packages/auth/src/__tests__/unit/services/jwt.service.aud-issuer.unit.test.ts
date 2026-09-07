/**
 * Unit tests for JwtService.validate audience/issuer enforcement
 *
 * Reproduces the validation bypass: when options.audience (or options.issuers)
 * is configured but the token omits the corresponding claim entirely, the
 * check was skipped and the token was accepted, contradicting the documented
 * contract that the token "must contain the required audience".
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { JwtService } from '../../../services/jwt.service';

function makeToken(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${headerEncoded}.${payloadEncoded}.mock-signature`;
}

describe('JwtService.validate - audience/issuer claim enforcement', () => {
  const service = new JwtService();
  const futureExp = Math.floor(Date.now() / 1000) + 3600;

  it('should accept a token whose aud matches the required audience', () => {
    const token = makeToken({ sub: 'user-1', exp: futureExp, aud: 'my-api' });
    const result = service.validate(token, { audience: 'my-api' });
    assert.strictEqual(result.valid, true);
  });

  it('should reject a token with a different aud', () => {
    const token = makeToken({ sub: 'user-1', exp: futureExp, aud: 'other-api' });
    const result = service.validate(token, { audience: 'my-api' });
    assert.strictEqual(result.valid, false);
  });

  it('should reject a token that omits the aud claim entirely when audience is required', () => {
    const token = makeToken({ sub: 'user-1', exp: futureExp });
    const result = service.validate(token, { audience: 'my-api' });
    assert.strictEqual(
      result.valid,
      false,
      'token without aud claim must not pass audience validation'
    );
  });

  it('should accept a token whose iss is in the allowed issuers list', () => {
    const token = makeToken({ sub: 'user-1', exp: futureExp, iss: 'https://issuer-a' });
    const result = service.validate(token, { issuers: ['https://issuer-a', 'https://issuer-b'] });
    assert.strictEqual(result.valid, true);
  });

  it('should reject a token that omits the iss claim entirely when issuers are required', () => {
    const token = makeToken({ sub: 'user-1', exp: futureExp });
    const result = service.validate(token, { issuers: ['https://issuer-a'] });
    assert.strictEqual(
      result.valid,
      false,
      'token without iss claim must not pass issuer validation'
    );
  });
});
