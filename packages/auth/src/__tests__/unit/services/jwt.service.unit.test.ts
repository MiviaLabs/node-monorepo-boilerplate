/**
 * Unit tests for JWT Service
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { jwtService, JwtService } from '../../../services/jwt.service';

describe('JwtService', () => {
  const service = new JwtService();

  describe('decode', () => {
    it('should decode a valid JWT token', () => {
      const header = { alg: 'HS256', typ: 'JWT' };
      const payload = {
        sub: 'user-123',
        tenant_id: 'tenant-abc',
        roles: ['admin', 'user'],
        permissions: ['read:all', 'write:all'],
        iat: 1234567890,
        exp: 9999999999
      };

      const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = 'mock-signature';
      const token = `${headerEncoded}.${payloadEncoded}.${signature}`;

      const decoded = service.decode(token);

      assert.strictEqual(decoded.sub, 'user-123');
      assert.strictEqual(decoded.tenant_id, 'tenant-abc');
      assert.deepStrictEqual(decoded.roles, ['admin', 'user']);
      assert.deepStrictEqual(decoded.permissions, ['read:all', 'write:all']);
    });

    it('should throw InvalidTokenError for malformed token', () => {
      assert.throws(
        () => {
          service.decode('invalid-token');
        },
        {
          name: 'InvalidTokenError',
          message: /Invalid token format/
        }
      );
    });

    it('should throw InvalidTokenError for token without 3 parts', () => {
      const token = 'only.two';
      assert.throws(
        () => {
          service.decode(token);
        },
        {
          name: 'InvalidTokenError'
        }
      );
    });
  });

  describe('validate', () => {
    it('should validate a valid token', () => {
      const token = createMockToken({
        sub: 'user-123',
        tenant_id: 'tenant-abc',
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const result = service.validate(token);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.userId, 'user-123');
      assert.strictEqual(result.tenantId, 'tenant-abc');
    });

    it('should reject an expired token', () => {
      const token = createMockToken({
        sub: 'user-123',
        tenant_id: 'tenant-abc',
        exp: Math.floor(Date.now() / 1000) - 100
      });

      const result = service.validate(token);

      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('expired'));
    });

    it('should ignore expiration when configured', () => {
      const token = createMockToken({
        sub: 'user-123',
        tenant_id: 'tenant-abc',
        exp: Math.floor(Date.now() / 1000) - 100
      });

      const result = service.validate(token, { ignoreExpiration: true });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.userId, 'user-123');
    });

    it('should validate issuer when configured', () => {
      const token = createMockToken({
        sub: 'user-123',
        tenant_id: 'tenant-abc',
        iss: 'https://keycloak.example.com',
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const result = service.validate(token, {
        issuers: ['https://keycloak.example.com']
      });

      assert.strictEqual(result.valid, true);
    });

    it('should reject invalid issuer', () => {
      const token = createMockToken({
        sub: 'user-123',
        tenant_id: 'tenant-abc',
        iss: 'https://wrong-issuer.com',
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const result = service.validate(token, {
        issuers: ['https://keycloak.example.com']
      });

      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('issuer'));
    });
  });

  describe('extractTenantId', () => {
    it('should extract tenant_id from token', () => {
      const token = createMockToken({
        sub: 'user-123',
        tenant_id: 'tenant-abc'
      });

      const tenantId = service.extractTenantId(token);
      assert.strictEqual(tenantId, 'tenant-abc');
    });

    it('should return undefined if tenant_id is missing', () => {
      const token = createMockToken({
        sub: 'user-123'
      });

      const tenantId = service.extractTenantId(token);
      assert.strictEqual(tenantId, undefined);
    });
  });

  describe('extractUserId', () => {
    it('should extract sub (user ID) from token', () => {
      const token = createMockToken({
        sub: 'user-123',
        tenant_id: 'tenant-abc'
      });

      const userId = service.extractUserId(token);
      assert.strictEqual(userId, 'user-123');
    });
  });

  describe('extractActorId', () => {
    it('should extract actor_id from token', () => {
      const token = createMockToken({
        sub: 'user-123',
        actor_id: 'actor-456'
      });

      const actorId = service.extractActorId(token);
      assert.strictEqual(actorId, 'actor-456');
    });

    it('should return undefined if actor_id is missing', () => {
      const token = createMockToken({
        sub: 'user-123'
      });

      const actorId = service.extractActorId(token);
      assert.strictEqual(actorId, undefined);
    });
  });

  describe('extractRoles', () => {
    it('should extract roles from token', () => {
      const token = createMockToken({
        sub: 'user-123',
        roles: ['admin', 'user']
      });

      const roles = service.extractRoles(token);
      assert.deepStrictEqual(roles, ['admin', 'user']);
    });

    it('should return empty array if roles are missing', () => {
      const token = createMockToken({
        sub: 'user-123'
      });

      const roles = service.extractRoles(token);
      assert.deepStrictEqual(roles, []);
    });
  });

  describe('extractPermissions', () => {
    it('should extract permissions from token', () => {
      const token = createMockToken({
        sub: 'user-123',
        permissions: ['read:all', 'write:all']
      });

      const permissions = service.extractPermissions(token);
      assert.deepStrictEqual(permissions, ['read:all', 'write:all']);
    });

    it('should return empty array if permissions are missing', () => {
      const token = createMockToken({
        sub: 'user-123'
      });

      const permissions = service.extractPermissions(token);
      assert.deepStrictEqual(permissions, []);
    });
  });

  describe('isExpired', () => {
    it('should return true for expired token', () => {
      const token = createMockToken({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) - 100
      });

      assert.strictEqual(service.isExpired(token), true);
    });

    it('should return false for valid token', () => {
      const token = createMockToken({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      assert.strictEqual(service.isExpired(token), false);
    });

    it('should return false for token without exp claim', () => {
      const token = createMockToken({
        sub: 'user-123'
      });

      assert.strictEqual(service.isExpired(token), false);
    });
  });

  describe('getExpiration', () => {
    it('should return expiration date', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = createMockToken({
        sub: 'user-123',
        exp
      });

      const expiration = service.getExpiration(token);
      assert.ok(expiration);
      // Allow small time difference due to test execution time
      assert.ok(
        Math.abs(Math.floor(((expiration ?? new Date()).getTime() - Date.now()) / 1000) - 3600) <= 1
      );
    });

    it('should return expiration date from default exp claim', () => {
      const token = createMockToken({
        sub: 'user-123'
      });

      const expiration = service.getExpiration(token);
      assert.ok(expiration);
      // Default expiration is 3600 seconds from now
      assert.ok((expiration ?? new Date()) > new Date(Date.now() + 3500 * 1000));
      assert.ok((expiration ?? new Date()) < new Date(Date.now() + 3700 * 1000));
    });
  });

  describe('getIssuedAt', () => {
    it('should return issued at date', () => {
      const iat = Math.floor(Date.now() / 1000) - 100;
      const token = createMockToken({
        sub: 'user-123',
        iat
      });

      const issuedAt = service.getIssuedAt(token);
      assert.ok(issuedAt);
      // Allow small time difference due to test execution time
      assert.ok(
        Math.abs(Math.floor((Date.now() - (issuedAt ?? new Date()).getTime()) / 1000) - 100) <= 1
      );
    });

    it('should return issued at date from default iat claim', () => {
      const token = createMockToken({
        sub: 'user-123'
      });

      const issuedAt = service.getIssuedAt(token);
      assert.ok(issuedAt);
      // Default iat is the current time
      assert.ok((issuedAt ?? new Date()) <= new Date());
      assert.ok((issuedAt ?? new Date()) > new Date(Date.now() - 1000));
    });
  });

  describe('getTokenId', () => {
    it('should return token ID (jti)', () => {
      const token = createMockToken({
        sub: 'user-123',
        jti: 'token-abc-123'
      });

      const tokenId = service.getTokenId(token);
      assert.strictEqual(tokenId, 'token-abc-123');
    });

    it('should return undefined if no jti claim', () => {
      const token = createMockToken({
        sub: 'user-123'
      });

      const tokenId = service.getTokenId(token);
      assert.strictEqual(tokenId, undefined);
    });
  });
});

/**
 * Helper function to create a mock JWT token
 */
function createMockToken(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload = {
    ...payload,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + 3600
  };

  const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadEncoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = 'mock-signature';

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}
