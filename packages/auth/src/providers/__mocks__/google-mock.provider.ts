/**
 * Mock Google Auth Provider
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
import type { GoogleAuthProviderOptions } from '../factory.types';

/**
 * Mock options
 */
export interface MockGoogleProviderOptions {
  /** Latency to simulate in ms */
  latency?: number;
  /** Failure rate (0-1) */
  failureRate?: number;
  /** Whether to simulate errors */
  simulateErrors?: boolean;
}

/**
 * Mock Google auth provider for testing
 *
 * Simulates Google OAuth 2.0 behavior:
 * - authenticate() throws AuthenticationError (Google doesn't support password grant)
 * - validateToken() validates tokens
 * - refreshToken() refreshes tokens with rotation support
 * - logout() revokes tokens
 * - getUserInfo*() returns user info
 * - getRoles*() returns empty arrays (Google doesn't have built-in roles)
 * - getPermissions*() returns empty arrays (Google doesn't have built-in permissions)
 */
export class GoogleMockProvider extends BaseAuthProvider implements IAuthProvider {
  private users = new Map<string, UserInfo>(); // email -> UserInfo
  private usersById = new Map<string, UserInfo>(); // userId -> UserInfo
  private refreshTokens = new Map<
    string,
    { userId: string; tenantId: string; expiresAt: number }
  >();
  private accessTokens = new Map<string, { userId: string; tenantId: string; expiresAt: number }>();
  private revokedTokens = new Set<string>();
  private mockOptions: MockGoogleProviderOptions;

  constructor(options: GoogleAuthProviderOptions & MockGoogleProviderOptions) {
    super(options.name ?? 'google-mock', 'google', {
      authServerUrl: 'https://accounts.google.com',
      realm: 'google',
      clientId: options.clientId,
      clientSecret: options.clientSecret
    });
    this.mockOptions = options;

    // Create default test user
    const defaultUser: UserInfo = {
      userId: 'google-123456789',
      username: 'testuser',
      email: 'test-user@gmail.com',
      givenName: 'Test',
      familyName: 'User',
      name: 'Test User',
      emailVerified: true,
      roles: [],
      permissions: [],
      tenantId: 'default',
      attributes: {
        picture: 'https://example.com/avatar.jpg'
      }
    };
    this.users.set('test-user@gmail.com', defaultUser);
    this.usersById.set('google-123456789', defaultUser);
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
   *
   * NOTE: Google does NOT support password grant (Resource Owner Password Credentials).
   * This method throws an error to indicate that Google OAuth 2.0 authorization code flow
   * should be used instead.
   */
  async authenticate(_credentials: UserCredentials): Promise<AuthResult> {
    return this.simulate(async () => {
      throw new Error(
        'Google does not support password grant (Resource Owner Password Credentials). ' +
          'Please use OAuth 2.0 authorization code flow instead. ' +
          'See: https://developers.google.com/identity/protocols/oauth2'
      );
    });
  }

  /**
   * Validate token
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    return this.simulate(async () => {
      try {
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1] as string, 'base64url').toString()
        );
        const tokenId = payload['jti'] as string | undefined;

        // Check if token is revoked
        if (tokenId && this.revokedTokens.has(tokenId)) {
          return {
            valid: false,
            error: 'Token has been revoked'
          };
        }

        const tokenData = this.accessTokens.get(tokenId ?? '');

        if (!tokenData) {
          return {
            valid: false,
            error: 'Token not found'
          };
        }

        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        if (tokenData.expiresAt < now) {
          return {
            valid: false,
            error: 'Token expired'
          };
        }

        return {
          valid: true,
          userId: tokenData.userId,
          tenantId: tokenData.tenantId,
          exp: tokenData.expiresAt
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
        const payload = JSON.parse(
          Buffer.from(refreshToken.split('.')[1] as string, 'base64url').toString()
        );
        const tokenId = payload['jti'] as string;
        const tokenData = this.refreshTokens.get(tokenId);

        if (!tokenData) {
          throw new Error('Invalid refresh token');
        }

        // Check if refresh token is expired
        const now = Math.floor(Date.now() / 1000);
        if (tokenData.expiresAt < now) {
          throw new Error('Refresh token expired');
        }

        const user = this.getUserById(tokenData.userId);
        if (!user) {
          throw new Error('User not found');
        }

        // Create new access token
        const newTokenId = randomUUID();
        const newExpiresAt = now + 3600; // 1 hour
        this.accessTokens.set(newTokenId, {
          userId: tokenData.userId,
          tenantId: tokenData.tenantId,
          expiresAt: newExpiresAt
        });

        // Simulate token rotation (30% chance)
        const shouldRotate = Math.random() < 0.3;
        let newRefreshToken = refreshToken;
        if (shouldRotate) {
          const newRefreshTokenId = randomUUID();
          const newRefreshExpiresAt = now + 2592000; // 30 days
          this.refreshTokens.set(newRefreshTokenId, {
            userId: tokenData.userId,
            tenantId: tokenData.tenantId,
            expiresAt: newRefreshExpiresAt
          });
          // Revoke old refresh token
          this.refreshTokens.delete(tokenId);
          newRefreshToken = this.createMockToken(user, newRefreshTokenId, newRefreshExpiresAt);
        }

        return {
          accessToken: this.createMockToken(user, newTokenId, newExpiresAt),
          refreshToken: shouldRotate ? newRefreshToken : undefined,
          idToken: this.createMockToken(user, newTokenId, newExpiresAt),
          expiresIn: 3600,
          rotated: shouldRotate
        };
      } catch {
        throw new Error('Token refresh failed');
      }
    });
  }

  /**
   * Logout
   */
  async logout(refreshToken: string, accessToken?: string): Promise<void> {
    await this.simulate(async () => {
      // Revoke refresh token
      try {
        const payload = JSON.parse(
          Buffer.from(refreshToken.split('.')[1] as string, 'base64url').toString()
        );
        const tokenId = payload['jti'] as string;
        this.refreshTokens.delete(tokenId);
      } catch {
        // Ignore invalid token format
      }

      // Blacklist access token
      if (accessToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(accessToken.split('.')[1] as string, 'base64url').toString()
          );
          const tokenId = payload['jti'] as string;
          this.revokedTokens.add(tokenId);
        } catch {
          // Ignore invalid token format
        }
      }
    });
  }

  /**
   * Get user info by ID
   *
   * NOTE: Google's getUserInfo requires an access token.
   * This mock returns basic user info since we don't have the token.
   */
  async getUserInfo(userId: string, tenantId: string): Promise<UserInfo> {
    return this.simulate(async () => {
      const user = this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      return {
        userId,
        username: userId,
        email: user.email,
        roles: [],
        permissions: [],
        tenantId: tenantId ?? 'default'
      };
    });
  }

  /**
   * Get user info from token
   */
  async getUserInfoFromToken(token: string): Promise<UserInfo> {
    return this.simulate(async () => {
      try {
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1] as string, 'base64url').toString()
        );
        const userId = payload['sub'] as string;
        const user = this.getUserById(userId);

        if (!user) {
          throw new Error('User not found');
        }

        return {
          ...user,
          tenantId: (payload['tenant_id'] as string) ?? 'default',
          attributes: {
            ...user.attributes,
            picture: payload['picture'] as string | undefined
          }
        };
      } catch {
        throw new Error('Invalid token');
      }
    });
  }

  /**
   * Get user roles
   *
   * NOTE: Google does not have built-in role management.
   * Returns empty array.
   */
  async getRoles(_userId: string, _tenantId: string): Promise<string[]> {
    return this.simulate(async () => {
      return [];
    });
  }

  /**
   * Get user roles from token
   *
   * NOTE: Google tokens do not include role information.
   * Returns empty array.
   */
  async getRolesFromToken(_token: string): Promise<string[]> {
    return this.simulate(async () => {
      return [];
    });
  }

  /**
   * Get user permissions
   *
   * NOTE: Google does not have built-in permission management.
   * Returns empty array.
   *
   * SECURITY: This method accepts userAccessToken parameter for security validation,
   * though Google doesn't support permissions.
   */
  async getPermissions(
    _userId: string,
    _tenantId: string,
    _userAccessToken?: string
  ): Promise<string[]> {
    return this.simulate(async () => {
      return [];
    });
  }

  /**
   * Get user permissions from token
   *
   * NOTE: Google tokens do not include permission information.
   * Returns empty array.
   */
  async getPermissionsFromToken(_token: string): Promise<string[]> {
    return this.simulate(async () => {
      return [];
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
    // Remove user from usersById map
    const user = this.usersById.get(userId);
    if (user) {
      this.usersById.delete(userId);
      this.users.delete(user.email);
    }
  }

  /**
   * Delete all users in a tenant (mock implementation)
   *
   * @param tenantId - Tenant ID to delete users from
   */
  async deleteTenantUsers(tenantId: string): Promise<void> {
    // Remove all users with matching tenantId
    for (const [email, user] of this.users.entries()) {
      if (user.tenantId === tenantId) {
        this.users.delete(email);
        this.usersById.delete(user.userId);
      }
    }
  }

  /**
   * Add a test user
   *
   * @param email - User email address
   * @param userInfo - Partial user information to merge with defaults
   */
  addTestUser(email: string, userInfo: Partial<UserInfo>): void {
    const userId = userInfo.userId ?? `google-${randomUUID()}`;
    const fullUserInfo: UserInfo = {
      userId,
      username: userInfo.username ?? email.split('@')[0] ?? email,
      email,
      givenName: userInfo.givenName,
      familyName: userInfo.familyName,
      name: userInfo.name,
      emailVerified: userInfo.emailVerified ?? true,
      roles: [],
      permissions: [],
      tenantId: userInfo.tenantId ?? 'default',
      attributes: {
        ...userInfo.attributes,
        picture: userInfo.attributes?.['picture'] as string
      }
    };

    this.users.set(email, fullUserInfo);
    this.usersById.set(userId, fullUserInfo);
  }

  /**
   * Get user by ID
   */
  private getUserById(userId: string): UserInfo | undefined {
    return this.usersById.get(userId);
  }

  /**
   * Create a mock JWT token
   */
  private createMockToken(userInfo: UserInfo, jti: string, exp: number): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://accounts.google.com',
      aud: 'test-client-id.apps.googleusercontent.com',
      sub: userInfo.userId,
      email: userInfo.email,
      email_verified: true,
      name: userInfo.name,
      given_name: userInfo.givenName,
      family_name: userInfo.familyName,
      picture: userInfo.attributes?.['picture'] as string,
      tenant_id: userInfo.tenantId,
      iat: now,
      exp,
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
    this.usersById.clear();
    this.refreshTokens.clear();
    this.accessTokens.clear();
    this.revokedTokens.clear();

    // Re-add default test user
    const defaultUser: UserInfo = {
      userId: 'google-123456789',
      username: 'testuser',
      email: 'test-user@gmail.com',
      givenName: 'Test',
      familyName: 'User',
      name: 'Test User',
      emailVerified: true,
      roles: [],
      permissions: [],
      tenantId: 'default',
      attributes: {
        picture: 'https://example.com/avatar.jpg'
      }
    };
    this.users.set('test-user@gmail.com', defaultUser);
    this.usersById.set('google-123456789', defaultUser);
  }

  /**
   * Get all access tokens (for testing)
   *
   * @returns Map of token IDs to token data
   */
  getAccessTokens(): Map<string, { userId: string; tenantId: string; expiresAt: number }> {
    return this.accessTokens;
  }

  /**
   * Get all refresh tokens (for testing)
   *
   * @returns Map of token IDs to token data
   */
  getRefreshTokens(): Map<string, { userId: string; tenantId: string; expiresAt: number }> {
    return this.refreshTokens;
  }
}

/**
 * Create a mock Google auth provider
 *
 * @param options - Optional mock provider configuration
 * @returns New GoogleMockProvider instance
 */
export function createMockGoogleProvider(options?: MockGoogleProviderOptions): GoogleMockProvider {
  return new GoogleMockProvider({
    clientId: 'test-client-id.apps.googleusercontent.com',
    clientSecret: 'test-client-secret',
    projectId: 'test-project',
    ...options
  });
}
