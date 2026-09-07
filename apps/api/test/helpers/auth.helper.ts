/* eslint-disable @typescript-eslint/no-explicit-any */
import request, { type Response, type Test } from 'supertest';

import type { INestApplication } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';

/**
 * Auth Test Helper
 *
 * Helper class for authentication testing in E2E tests.
 * Provides methods to generate tokens and make authenticated requests.
 */
export class AuthTestHelper {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Generate a JWT token with the given payload
   */
  generateToken(payload: any): string {
    return this.jwtService.sign(payload);
  }

  /**
   * Generate a user token with default fields
   */
  generateUserToken(overrides: Partial<any> = {}): string {
    return this.generateToken({
      sub: 'test-user-id',
      tenant_id: 'test-tenant-id',
      actor_id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['user'],
      permissions: ['users:read', 'posts:read', 'posts:write'],
      ...overrides
    });
  }

  /**
   * Generate an admin token with all permissions
   */
  generateAdminToken(overrides: Partial<any> = {}): string {
    return this.generateToken({
      sub: 'admin-id',
      tenant_id: 'test-tenant-id',
      actor_id: 'admin-id',
      email: 'admin@example.com',
      name: 'Test Admin',
      roles: ['admin'],
      permissions: ['*'], // All permissions
      ...overrides
    });
  }

  /**
   * Generate a token for a specific tenant
   */
  generateTenantToken(tenantId: string, overrides: Partial<any> = {}): string {
    return this.generateToken({
      sub: `user-${tenantId}`,
      tenant_id: tenantId,
      actor_id: `user-${tenantId}`,
      email: `user@${tenantId}.com`,
      roles: ['user'],
      permissions: ['posts:read', 'posts:write'],
      ...overrides
    });
  }

  /**
   * Generate a token with specific roles
   */
  generateTokenWithRoles(roles: string[], overrides: Partial<any> = {}): string {
    return this.generateToken({
      sub: 'test-user-id',
      tenant_id: 'test-tenant-id',
      email: 'test@example.com',
      roles,
      permissions: ['*'],
      ...overrides
    });
  }

  /**
   * Generate a token with specific permissions
   */
  generateTokenWithPermissions(permissions: string[], overrides: Partial<any> = {}): string {
    return this.generateToken({
      sub: 'test-user-id',
      tenant_id: 'test-tenant-id',
      email: 'test@example.com',
      roles: ['user'],
      permissions,
      ...overrides
    });
  }

  /**
   * Make an authenticated request
   */
  async authenticatedRequest(
    app: INestApplication,
    method: string,
    url: string,
    token?: string,
    body?: any
  ): Promise<Response> {
    const http = request(app.getHttpServer());
    const normalizedMethod = method.toUpperCase();
    let req: Test;

    switch (normalizedMethod) {
      case 'GET':
        req = http.get(url);
        break;
      case 'POST':
        req = http.post(url);
        break;
      case 'PUT':
        req = http.put(url);
        break;
      case 'DELETE':
        req = http.delete(url);
        break;
      case 'PATCH':
        req = http.patch(url);
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }

    if (token) {
      req.set('Authorization', `Bearer ${token}`);
    }

    if (body) {
      req.send(body);
    }

    return req;
  }

  /**
   * Make a GET request with authentication
   */
  async authenticatedGet(app: INestApplication, url: string, token?: string): Promise<Response> {
    return this.authenticatedRequest(app, 'GET', url, token);
  }

  /**
   * Make a POST request with authentication
   */
  async authenticatedPost(
    app: INestApplication,
    url: string,
    body?: any,
    token?: string
  ): Promise<Response> {
    return this.authenticatedRequest(app, 'POST', url, token, body);
  }

  /**
   * Make a PUT request with authentication
   */
  async authenticatedPut(
    app: INestApplication,
    url: string,
    body?: any,
    token?: string
  ): Promise<Response> {
    return this.authenticatedRequest(app, 'PUT', url, token, body);
  }

  /**
   * Make a DELETE request with authentication
   */
  async authenticatedDelete(app: INestApplication, url: string, token?: string): Promise<Response> {
    return this.authenticatedRequest(app, 'DELETE', url, token);
  }

  /**
   * Make a PATCH request with authentication
   */
  async authenticatedPatch(
    app: INestApplication,
    url: string,
    body?: any,
    token?: string
  ): Promise<Response> {
    return this.authenticatedRequest(app, 'PATCH', url, token, body);
  }
}

/**
 * Create an AuthTestHelper instance
 */
export function createAuthTestHelper(jwtService: JwtService): AuthTestHelper {
  return new AuthTestHelper(jwtService);
}

/**
 * Mock user fixtures for testing
 */
export const mockUsers = {
  admin: {
    sub: 'admin-123',
    tenant_id: 'primary-encryption-key',
    actor_id: 'admin-123',
    email: 'admin@example.com',
    name: 'Admin User',
    roles: ['admin'],
    permissions: ['*']
  },
  user: {
    sub: 'user-123',
    tenant_id: 'primary-encryption-key',
    actor_id: 'user-123',
    email: 'user@example.com',
    name: 'Regular User',
    roles: ['user'],
    permissions: ['users:read', 'posts:read', 'posts:write']
  },
  moderator: {
    sub: 'mod-123',
    tenant_id: 'primary-encryption-key',
    actor_id: 'mod-123',
    email: 'moderator@example.com',
    name: 'Moderator User',
    roles: ['moderator'],
    permissions: ['posts:*', 'comments:*']
  },
  readOnly: {
    sub: 'readonly-123',
    tenant_id: 'primary-encryption-key',
    actor_id: 'readonly-123',
    email: 'readonly@example.com',
    name: 'Read Only User',
    roles: ['user'],
    permissions: ['users:read', 'posts:read']
  }
};

/**
 * Generate token from mock user
 */
export function generateMockToken(jwtService: JwtService, user: keyof typeof mockUsers): string {
  return jwtService.sign(mockUsers[user]);
}
