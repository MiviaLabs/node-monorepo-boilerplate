/**
 * Mock Keycloak Auth Provider
 *
 * Mock implementation for testing without external dependencies
 */

import { randomUUID } from 'node:crypto';

import type {
  AuthResult,
  TokenValidationResult,
  TokenRefreshResult,
  UserInfo
} from '../../types/auth.types';
import type { UserCredentials } from '../../types/user.types';
import type { IAuthProvider } from '../auth-provider.interface';
import { BaseAuthProvider } from '../base-auth-provider';
import type { KeycloakAuthProviderOptions } from '../factory.types';

/**
 * Mock options
 */
export interface MockKeycloakProviderOptions {
  /** Latency to simulate in ms */
  latency?: number;
  /** Failure rate (0-1) */
  failureRate?: number;
  /** Whether to simulate errors */
  simulateErrors?: boolean;
}

/**
 * Mock Keycloak auth provider for testing
 */
export class KeycloakMockProvider extends BaseAuthProvider implements IAuthProvider {
  private users = new Map<string, { password: string; userInfo: UserInfo }>();
  private refreshTokens = new Map<string, { userId: string; tenantId: string }>();
  private accessTokens = new Map<string, { userId: string; tenantId: string }>();
  private mockOptions: MockKeycloakProviderOptions;

  constructor(options: KeycloakAuthProviderOptions & MockKeycloakProviderOptions) {
    super(options.name ?? 'keycloak-mock', 'keycloak', options);
    this.mockOptions = options;

    // Create default test user
    this.users.set('test-user', {
      password: 'test-password',
      userInfo: {
        userId: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        givenName: 'Test',
        familyName: 'User',
        name: 'Test User',
        emailVerified: true,
        roles: ['user'],
        permissions: ['read:own'],
        tenantId: 'default'
      }
    });
  }

  /**
   * Simulate latency and potential failure
   */
  private async simulate<T>(operation: () => T): Promise<T> {
    if (this.mockOptions.latency) {
      await new Promise((resolve) => setTimeout(resolve, this.mockOptions.latency));
    }

    if (this.mockOptions.failureRate && Math.random() < this.mockOptions.failureRate) {
      throw new Error('Simulated random failure');
    }

    return operation();
  }

  /**
   * Authenticate user
   */
  async authenticate(credentials: UserCredentials): Promise<AuthResult> {
    return this.simulate(async () => {
      const user = this.users.get(credentials.username);

      if (!user || user.password !== credentials.password) {
        throw new Error('Invalid credentials');
      }

      const tokenId = randomUUID();
      const refreshTokenId = randomUUID();

      this.accessTokens.set(tokenId, {
        userId: user.userInfo.userId,
        tenantId: credentials.tenantId ?? 'default'
      });

      this.refreshTokens.set(refreshTokenId, {
        userId: user.userInfo.userId,
        tenantId: credentials.tenantId ?? 'default'
      });

      return {
        accessToken: this.createMockToken(user.userInfo, tokenId),
        refreshToken: this.createMockToken(user.userInfo, refreshTokenId),
        idToken: this.createMockToken(user.userInfo, tokenId),
        expiresIn: 3600,
        refreshExpiresIn: 2592000
      };
    });
  }

  /**
   * Validate token
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    return this.simulate(async () => {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        const tokenData = this.accessTokens.get(payload['jti'] as string);

        if (!tokenData) {
          return {
            valid: false,
            error: 'Token not found'
          };
        }

        // Check expiration
        if (payload['exp'] && payload['exp'] < Math.floor(Date.now() / 1000)) {
          return {
            valid: false,
            error: 'Token expired'
          };
        }

        return {
          valid: true,
          userId: tokenData.userId,
          tenantId: tokenData.tenantId,
          exp: payload['exp'] as number
        };
      } catch {
        return {
          valid: false,
          error: 'Invalid token'
        };
      }
    });
  }

  /**
   * Refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    return this.simulate(async () => {
      try {
        const payload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url').toString());
        const tokenData = this.refreshTokens.get(payload['jti'] as string);

        if (!tokenData) {
          throw new Error('Invalid refresh token');
        }

        const user = this.getUserById(tokenData.userId);
        if (!user) {
          throw new Error('User not found');
        }

        const newTokenId = randomUUID();
        this.accessTokens.set(newTokenId, tokenData);

        return {
          accessToken: this.createMockToken(user, newTokenId),
          refreshToken,
          idToken: this.createMockToken(user, newTokenId),
          expiresIn: 3600,
          rotated: false
        };
      } catch {
        throw new Error('Token refresh failed');
      }
    });
  }

  /**
   * Logout
   */
  async logout(_refreshToken: string, accessToken?: string): Promise<void> {
    await this.simulate(async () => {
      if (accessToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(accessToken.split('.')[1], 'base64url').toString()
          );
          this.accessTokens.delete(payload['jti'] as string);
        } catch {
          // Ignore
        }
      }
    });
  }

  /**
   * Get user info by ID
   */
  async getUserInfo(userId: string, tenantId: string): Promise<UserInfo> {
    return this.simulate(async () => {
      const user = this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      return { ...user, tenantId };
    });
  }

  /**
   * Get user info from token
   */
  async getUserInfoFromToken(token: string): Promise<UserInfo> {
    return this.simulate(async () => {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        const tokenData = this.accessTokens.get(payload['jti'] as string);

        if (!tokenData) {
          throw new Error('Token not found');
        }

        const user = this.getUserById(tokenData.userId);
        if (!user) {
          throw new Error('User not found');
        }

        return { ...user, tenantId: tokenData.tenantId };
      } catch {
        throw new Error('Invalid token');
      }
    });
  }

  /**
   * Get user roles
   */
  async getRoles(userId: string, _tenantId: string): Promise<string[]> {
    return this.simulate(async () => {
      const user = this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      return user.roles;
    });
  }

  /**
   * Get user roles from token
   */
  async getRolesFromToken(token: string): Promise<string[]> {
    return this.simulate(async () => {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return (payload['roles'] as string[]) ?? [];
      } catch {
        return [];
      }
    });
  }

  /**
   * Get user permissions
   */
  async getPermissions(userId: string, _tenantId: string): Promise<string[]> {
    return this.simulate(async () => {
      const user = this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      return user.permissions;
    });
  }

  /**
   * Get user permissions from token
   */
  async getPermissionsFromToken(token: string): Promise<string[]> {
    return this.simulate(async () => {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        return (payload['permissions'] as string[]) ?? [];
      } catch {
        return [];
      }
    });
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  /**
   * Delete a user (mock implementation)
   *
   * @param userId - User ID to delete
   * @param _tenantId - Optional tenant ID (unused in mock)
   */
  async deleteUser(userId: string, _tenantId?: string): Promise<void> {
    // Remove user from users map by userId
    for (const [username, user] of this.users.entries()) {
      if (user.userInfo.userId === userId) {
        this.users.delete(username);
        return;
      }
    }
  }

  /**
   * Delete all users in a tenant (mock implementation)
   *
   * @param tenantId - Tenant ID to delete users from
   */
  async deleteTenantUsers(tenantId: string): Promise<void> {
    // Remove all users with matching tenantId
    for (const [username, user] of this.users.entries()) {
      if (user.userInfo.tenantId === tenantId) {
        this.users.delete(username);
      }
    }
  }

  /**
   * Add a test user
   *
   * @param username - User's username
   * @param password - User's password
   * @param userInfo - Partial user information to merge with defaults
   */
  addTestUser(username: string, password: string, userInfo: Partial<UserInfo>): void {
    const fullUserInfo: UserInfo = {
      userId: userInfo.userId ?? `user-${username}`,
      username,
      email: userInfo.email ?? `${username}@example.com`,
      givenName: userInfo.givenName,
      familyName: userInfo.familyName,
      name: userInfo.name,
      emailVerified: true,
      roles: userInfo.roles ?? ['user'],
      permissions: userInfo.permissions ?? [],
      tenantId: userInfo.tenantId ?? 'default',
      attributes: userInfo.attributes
    };

    this.users.set(username, {
      password,
      userInfo: fullUserInfo
    });
  }

  /**
   * Get user by ID
   */
  private getUserById(userId: string): UserInfo | undefined {
    for (const user of this.users.values()) {
      if (user.userInfo.userId === userId) {
        return user.userInfo;
      }
    }
    return undefined;
  }

  /**
   * Create a mock JWT token
   */
  private createMockToken(userInfo: UserInfo, jti: string): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: userInfo.userId,
      username: userInfo.username,
      email: userInfo.email,
      tenant_id: userInfo.tenantId,
      actor_id: userInfo.userId,
      roles: userInfo.roles,
      permissions: userInfo.permissions,
      iat: now,
      exp: now + 3600,
      jti
    };

    const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = 'mock-signature';

    return `${headerEncoded}.${payloadEncoded}.${signature}`;
  }

  /**
   * Reset the mock
   */
  reset(): void {
    this.users.clear();
    this.refreshTokens.clear();
    this.accessTokens.clear();

    // Re-add default test user
    this.users.set('test-user', {
      password: 'test-password',
      userInfo: {
        userId: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        givenName: 'Test',
        familyName: 'User',
        name: 'Test User',
        emailVerified: true,
        roles: ['user'],
        permissions: ['read:own'],
        tenantId: 'default'
      }
    });
  }
}

/**
 * Create a mock Keycloak auth provider
 *
 * @param options - Optional mock provider configuration
 * @returns New KeycloakMockProvider instance
 */
export function createMockKeycloakProvider(
  options?: MockKeycloakProviderOptions
): KeycloakMockProvider {
  return new KeycloakMockProvider({
    authServerUrl: 'http://localhost:8080',
    realm: 'mock',
    clientId: 'mock-client',
    ...options
  });
}
