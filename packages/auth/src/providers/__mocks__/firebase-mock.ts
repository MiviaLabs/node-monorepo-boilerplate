/**
 * Mock Firebase Admin SDK
 *
 * Mock implementation for testing Google Cloud Identity Platform provider
 * without requiring actual Firebase credentials or network calls.
 */

import { randomUUID } from 'node:crypto';

import { TokenValidationError } from '../../errors';
import type {
  AuthResult,
  TokenValidationResult,
  TokenRefreshResult,
  UserInfo
} from '../../types/auth.types';
import type { UserCredentials } from '../../types/user.types';
import type { IAuthProvider, BaseAuthProviderOptions } from '../auth-provider.interface';
import { BaseAuthProvider } from '../base-auth-provider';
import type { GoogleIdentityPlatformAuthProviderOptions } from '../factory.types';

/**
 * Mock Firebase Admin SDK Auth instance
 */
export class MockFirebaseAuth {
  private users = new Map<
    string,
    {
      uid: string;
      email: string | null;
      password: string | null;
      displayName: string | null;
      emailVerified: boolean;
      phoneNumber: string | null;
      photoURL: string | null;
      disabled: boolean;
      customClaims: Record<string, unknown>;
      tenantId: string | null;
      metadata: {
        creationTime: string;
        lastSignInTime: string;
      };
    }
  >();

  private refreshTokens = new Map<string, { uid: string; revoked: boolean }>();
  private failHealthCheck = false;

  constructor() {
    // Create default test user
    this.users.set('test-user-id', {
      uid: 'test-user-id',
      email: 'test@example.com',
      password: 'test-password',
      displayName: 'Test User',
      emailVerified: true,
      phoneNumber: '+1234567890',
      photoURL: 'https://example.com/avatar.jpg',
      disabled: false,
      customClaims: {
        roles: ['user'],
        permissions: ['read:own', 'write:own']
      },
      tenantId: 'test-tenant',
      metadata: {
        creationTime: '2024-01-01T00:00:00.000Z',
        lastSignInTime: '2024-01-06T00:00:00.000Z'
      }
    });

    // Create admin user
    this.users.set('admin-user-id', {
      uid: 'admin-user-id',
      email: 'admin@example.com',
      password: 'admin-password',
      displayName: 'Admin User',
      emailVerified: true,
      phoneNumber: null,
      photoURL: null,
      disabled: false,
      customClaims: {
        roles: ['admin', 'user'],
        permissions: ['read:all', 'write:all', 'delete:all']
      },
      tenantId: 'test-tenant',
      metadata: {
        creationTime: '2024-01-01T00:00:00.000Z',
        lastSignInTime: '2024-01-06T00:00:00.000Z'
      }
    });

    // Create user without roles
    this.users.set('user-without-roles', {
      uid: 'user-without-roles',
      email: 'noroles@example.com',
      password: 'noroles-password',
      displayName: 'No Roles User',
      emailVerified: true,
      phoneNumber: null,
      photoURL: null,
      disabled: false,
      customClaims: {},
      tenantId: 'test-tenant',
      metadata: {
        creationTime: '2024-01-01T00:00:00.000Z',
        lastSignInTime: '2024-01-06T00:00:00.000Z'
      }
    });
  }

  async createUser(data: {
    email?: string;
    password?: string;
    displayName?: string;
    emailVerified?: boolean;
    disabled?: boolean;
    tenantId?: string;
  }): Promise<{ uid: string }> {
    const email = data.email?.trim().toLowerCase();
    if (!email) {
      throw new Error('Email is required');
    }

    const existing = Array.from(this.users.values()).find((user) => user.email === email);
    if (existing) {
      throw new Error('Email already exists');
    }

    const uid = `mock-user-${randomUUID()}`;
    const timestamp = new Date().toISOString();

    this.users.set(uid, {
      uid,
      email,
      password: data.password ?? null,
      displayName: data.displayName ?? email.split('@')[0] ?? null,
      emailVerified: data.emailVerified ?? false,
      phoneNumber: null,
      photoURL: null,
      disabled: data.disabled ?? false,
      customClaims: {},
      tenantId: data.tenantId ?? null,
      metadata: {
        creationTime: timestamp,
        lastSignInTime: timestamp
      }
    });

    return { uid };
  }

  async setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
    const user = this.users.get(uid);
    if (!user) {
      throw new Error(`User not found: ${uid}`);
    }

    this.users.set(uid, {
      ...user,
      customClaims: {
        ...user.customClaims,
        ...claims
      }
    });
  }

  async authenticateUser(
    email: string,
    password: string,
    tenantId?: string
  ): Promise<{ uid: string; idToken: string; refreshToken: string; expiresIn: number }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = Array.from(this.users.values()).find((entry) => entry.email === normalizedEmail);

    if (!user || user.password !== password) {
      throw new Error('Invalid credentials');
    }

    if (user.disabled) {
      throw new Error('User is disabled');
    }

    if (tenantId && user.tenantId && user.tenantId !== tenantId) {
      throw new Error('Invalid tenant');
    }

    const effectiveTenantId = tenantId ?? user.tenantId ?? 'default';
    const idToken = this.createMockIdToken(user.uid, {
      email: user.email ?? '',
      tenant_id: effectiveTenantId,
      ...user.customClaims
    });
    const refreshToken = this.createMockRefreshToken(user.uid);

    return {
      uid: user.uid,
      idToken,
      refreshToken,
      expiresIn: 3600
    };
  }

  /**
   * Get user by UID
   */
  async getUser(uid: string): Promise<{
    uid: string;
    email: string | null;
    displayName: string | null;
    emailVerified: boolean;
    phoneNumber: string | null;
    photoURL: string | null;
    disabled: boolean;
    customClaims: Record<string, unknown> | null;
    metadata: {
      creationTime: string;
      lastSignInTime: string;
    };
  }> {
    const user = this.users.get(uid);
    if (!user) {
      throw new Error(`User not found: ${uid}`);
    }
    return {
      ...user,
      customClaims: user.customClaims
    };
  }

  /**
   * List users
   */
  async listUsers(
    maxResults?: number,
    pageToken?: string
  ): Promise<{
    users: Array<{ uid: string }>;
    pageToken?: string;
  }> {
    if (this.failHealthCheck) {
      throw new Error('Health check failed');
    }
    const allUsers = Array.from(this.users.values());
    const users = maxResults ? allUsers.slice(0, maxResults) : allUsers;
    return {
      users: users as Array<{ uid: string }>,
      pageToken: pageToken && users.length >= (maxResults ?? 1000) ? 'next-page' : undefined
    };
  }

  /**
   * Set health check failure mode
   */
  setFailHealthCheck(fail: boolean): void {
    this.failHealthCheck = fail;
  }

  /**
   * Verify ID token
   */
  async verifyIdToken(
    token: string,
    checkRevoked?: boolean
  ): Promise<{
    uid: string;
    exp: number;
    [key: string]: unknown;
  }> {
    // Decode token
    const parts = token.split('.');
    const encodedPayload = parts[1];
    if (parts.length !== 3 || encodedPayload === undefined) {
      throw new Error('Invalid token format');
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as {
      uid: string;
      exp: number;
      [key: string]: unknown;
    };

    // Check if revoked
    if (checkRevoked) {
      const tokenRecord = this.refreshTokens.get(token);
      if (tokenRecord?.revoked) {
        throw new Error('Token has been revoked');
      }
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token has expired');
    }

    return payload;
  }

  /**
   * Revoke refresh tokens
   */
  async revokeRefreshTokens(uid: string): Promise<void> {
    // Mark all refresh tokens for this user as revoked
    for (const [tokenId, tokenRecord] of this.refreshTokens.entries()) {
      if (tokenRecord.uid === uid) {
        this.refreshTokens.set(tokenId, { ...tokenRecord, revoked: true });
      }
    }
  }

  /**
   * Delete user
   */
  async deleteUser(uid: string): Promise<void> {
    if (!this.users.has(uid)) {
      throw new Error(`User not found: ${uid}`);
    }
    this.users.delete(uid);
    // Also remove refresh tokens
    for (const [tokenId, tokenRecord] of this.refreshTokens.entries()) {
      if (tokenRecord.uid === uid) {
        this.refreshTokens.delete(tokenId);
      }
    }
  }

  /**
   * Create mock ID token
   */
  createMockIdToken(uid: string, customClaims: Record<string, unknown> = {}): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      uid,
      user_id: uid,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      sub: uid,
      email: this.users.get(uid)?.email ?? '',
      email_verified: this.users.get(uid)?.emailVerified ?? false,
      ...customClaims
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = 'mock-signature';

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Create mock refresh token
   */
  createMockRefreshToken(uid: string): string {
    const tokenId = randomUUID();
    this.refreshTokens.set(tokenId, { uid, revoked: false });
    return tokenId;
  }
}

/**
 * Mock Firebase Tenant Manager
 */
export class MockTenantManager {
  private auth: MockFirebaseAuth;
  private tenants = new Map<string, { tenantId: string; displayName?: string }>();

  constructor(auth: MockFirebaseAuth) {
    this.auth = auth;
  }

  async createTenant(config: { displayName?: string }): Promise<{ tenantId: string }> {
    const tenantId = `mock-tenant-${randomUUID()}`;
    this.tenants.set(tenantId, { tenantId, displayName: config.displayName });
    return { tenantId };
  }

  async deleteTenant(tenantId: string): Promise<void> {
    this.tenants.delete(tenantId);
  }

  /**
   * Get tenant-aware auth instance
   */
  authForTenant(_tenantId: string): MockFirebaseAuth {
    // For simplicity, return the same auth instance
    // In a real implementation, this would filter by tenant
    return this.auth;
  }
}

/**
 * Mock Firebase App
 */
export class MockFirebaseApp {
  private authInstance: MockFirebaseAuth;
  private tenantManager: MockTenantManager;

  constructor() {
    this.authInstance = new MockFirebaseAuth();
    this.tenantManager = new MockTenantManager(this.authInstance);
  }

  /**
   * Get auth instance
   */
  auth(): MockFirebaseAuth {
    return this.authInstance;
  }

  /**
   * Get tenant manager
   */
  get tenantManagerInstance(): MockTenantManager {
    return this.tenantManager;
  }
}

/**
 * Mock Firebase Admin SDK
 */
export const mockFirebaseAdmin = {
  apps: [] as MockFirebaseApp[],

  initializeApp: (): MockFirebaseApp => {
    const app = new MockFirebaseApp();
    mockFirebaseAdmin.apps.push(app);
    return app;
  },

  app: (_name?: string): MockFirebaseApp => {
    const app = mockFirebaseAdmin.apps[0];
    if (!app) {
      throw new Error('No Firebase app initialized');
    }
    return app;
  },

  getAuth: (app?: MockFirebaseApp): MockFirebaseAuth => {
    const firebaseApp = app ?? mockFirebaseAdmin.apps[0];
    if (!firebaseApp) {
      throw new Error('No Firebase app initialized');
    }
    return firebaseApp.auth();
  },

  credential: {
    cert: (credentials: { projectId: string; privateKey: string; clientEmail: string }) => ({
      ...credentials,
      getAccessToken: async () => ({
        access_token: 'mock-access-token',
        expires_in: 3600
      })
    }),

    applicationDefault: () => ({
      getAccessToken: async () => ({
        access_token: 'mock-access-token',
        expires_in: 3600
      })
    })
  }
};

/**
 * Mock options
 */
export interface MockFirebaseIdentityPlatformProviderOptions {
  /** Latency to simulate in ms */
  latency?: number;
  /** Failure rate (0-1) */
  failureRate?: number;
  /** Whether to simulate errors */
  simulateErrors?: boolean;
}

/**
 * Mock Google Cloud Identity Platform auth provider for testing
 */
export class FirebaseIdentityPlatformMockProvider
  extends BaseAuthProvider
  implements IAuthProvider
{
  private firebaseAuth: MockFirebaseAuth;
  private mockOptions: MockFirebaseIdentityPlatformProviderOptions;
  private config: GoogleIdentityPlatformAuthProviderOptions;

  constructor(
    options: GoogleIdentityPlatformAuthProviderOptions & MockFirebaseIdentityPlatformProviderOptions
  ) {
    // Convert GoogleIdentityPlatformAuthProviderOptions to BaseAuthProviderOptions
    const baseOptions: BaseAuthProviderOptions = {
      name: options.name ?? 'firebase-mock',
      authServerUrl: `https://identitytoolkit.googleapis.com/v1/projects/${options.projectId}`,
      realm: options.tenantId ?? 'default',
      clientId: options.clientId ?? 'firebase-admin-sdk',
      clientSecret: options.clientSecret,
      useSsl: true,
      timeout: options.timeout ?? 10000
    };

    super(baseOptions.name ?? 'firebase-mock', 'google-identity-platform', baseOptions);
    this.mockOptions = options;
    this.config = options;

    // Initialize mock Firebase
    const app = mockFirebaseAdmin.initializeApp();
    this.firebaseAuth = mockFirebaseAdmin.getAuth(app);

    // If simulateErrors is true, set the auth to fail health checks
    if (options.simulateErrors) {
      this.firebaseAuth.setFailHealthCheck(true);
    }
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
   * Authenticate user with email and password
   */
  async authenticate(credentials: UserCredentials): Promise<AuthResult> {
    return this.simulate(async () => {
      const { username, password, tenantId } = credentials;

      // Simulate password authentication
      if (username === 'test@example.com' && password === 'test-password') {
        const uid = 'test-user-id';
        const idToken = this.firebaseAuth.createMockIdToken(uid, {
          email: username,
          tenant_id: tenantId ?? this.config.tenantId ?? 'default'
        });
        const refreshToken = this.firebaseAuth.createMockRefreshToken(uid);

        return {
          accessToken: idToken,
          refreshToken,
          idToken,
          expiresIn: 3600,
          refreshExpiresIn: 3600 * 24 * 14
        };
      }

      if (username === 'admin@example.com' && password === 'admin-password') {
        const uid = 'admin-user-id';
        const idToken = this.firebaseAuth.createMockIdToken(uid, {
          email: username,
          tenant_id: tenantId ?? this.config.tenantId ?? 'default'
        });
        const refreshToken = this.firebaseAuth.createMockRefreshToken(uid);

        return {
          accessToken: idToken,
          refreshToken,
          idToken,
          expiresIn: 3600,
          refreshExpiresIn: 3600 * 24 * 14
        };
      }

      throw new Error('Invalid credentials');
    });
  }

  /**
   * Validate an ID token
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    return this.simulate(async () => {
      try {
        const decoded = await this.firebaseAuth.verifyIdToken(token, true);
        return {
          valid: true,
          userId: decoded.uid,
          tenantId: (decoded['tenant_id'] as string) ?? this.config.tenantId ?? 'default',
          exp: decoded.exp
        };
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : 'Token validation failed'
        };
      }
    });
  }

  /**
   * Refresh an ID token using a refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    return this.simulate(async () => {
      // Check if refresh token is invalid
      if (refreshToken === 'invalid-refresh-token') {
        throw new TokenValidationError('Invalid refresh token');
      }

      // Create new tokens
      const uid = 'test-user-id';
      const idToken = this.firebaseAuth.createMockIdToken(uid);
      const newRefreshToken = this.firebaseAuth.createMockRefreshToken(uid);

      return {
        accessToken: idToken,
        refreshToken: newRefreshToken,
        idToken,
        expiresIn: 3600,
        rotated: true,
        refreshExpiresIn: 3600 * 24 * 14
      };
    });
  }

  /**
   * Logout user and revoke tokens
   */
  async logout(_refreshToken: string, _accessToken?: string): Promise<void> {
    return this.simulate(async () => {
      // Mock logout - in real implementation, would revoke tokens
      // Refresh token parameter is unused in mock but kept for interface compliance
      void _refreshToken;
      void _accessToken;
    });
  }

  /**
   * Get user information by user ID
   */
  async getUserInfo(userId: string, tenantId: string): Promise<UserInfo> {
    return this.simulate(async () => {
      const userRecord = await this.firebaseAuth.getUser(userId);
      const customClaims = (userRecord.customClaims ?? {}) as {
        roles?: string[];
        permissions?: string[];
      };

      return {
        userId: userRecord.uid,
        username: userRecord.email ?? userRecord.uid,
        email: userRecord.email ?? '',
        givenName: userRecord.displayName?.split(' ')[0],
        familyName: userRecord.displayName?.split(' ').slice(1).join(' '),
        name: userRecord.displayName ?? undefined,
        emailVerified: userRecord.emailVerified,
        roles: customClaims.roles ?? [],
        permissions: customClaims.permissions ?? [],
        tenantId,
        attributes: {
          phoneNumber: userRecord.phoneNumber,
          photoURL: userRecord.photoURL,
          disabled: userRecord.disabled,
          emailVerified: userRecord.emailVerified,
          createdAt: userRecord.metadata.creationTime,
          lastSignInAt: userRecord.metadata.lastSignInTime
        }
      };
    });
  }

  /**
   * Get user information from ID token
   */
  async getUserInfoFromToken(token: string): Promise<UserInfo> {
    return this.simulate(async () => {
      const decoded = await this.firebaseAuth.verifyIdToken(token);
      const customClaims = decoded as {
        roles?: string[];
        permissions?: string[];
        tenant_id?: string;
      };

      return {
        userId: decoded.uid,
        username: (decoded['email'] as string) ?? decoded.uid,
        email: (decoded['email'] as string) ?? '',
        givenName: (decoded['given_name'] as string) ?? undefined,
        familyName: (decoded['family_name'] as string) ?? undefined,
        name: (decoded['name'] as string) ?? undefined,
        emailVerified: decoded['email_verified'] as boolean,
        roles: customClaims.roles ?? [],
        permissions: customClaims.permissions ?? [],
        tenantId: customClaims.tenant_id ?? this.config.tenantId ?? 'default',
        attributes: { ...decoded }
      };
    });
  }

  /**
   * Get user roles
   */
  async getRoles(userId: string, _tenantId: string): Promise<string[]> {
    return this.simulate(async () => {
      const userRecord = await this.firebaseAuth.getUser(userId);
      const customClaims = (userRecord.customClaims ?? {}) as {
        roles?: string[];
      };
      return customClaims.roles ?? [];
    });
  }

  /**
   * Get user roles from token
   */
  async getRolesFromToken(token: string): Promise<string[]> {
    return this.simulate(async () => {
      const decoded = await this.firebaseAuth.verifyIdToken(token);
      const customClaims = decoded as {
        roles?: string[];
      };
      return customClaims.roles ?? [];
    });
  }

  /**
   * Get user permissions
   */
  async getPermissions(
    _userId: string,
    _tenantId: string,
    _userAccessToken?: string
  ): Promise<string[]> {
    return this.simulate(async () => {
      // Mock permissions
      return ['read:own', 'write:own'];
    });
  }

  /**
   * Get user permissions from token
   */
  async getPermissionsFromToken(token: string): Promise<string[]> {
    return this.simulate(async () => {
      const decoded = await this.firebaseAuth.verifyIdToken(token);
      const customClaims = decoded as {
        permissions?: string[];
      };
      return customClaims.permissions ?? [];
    });
  }

  /**
   * Check if the provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await this.healthCheck();
    } catch {
      return false;
    }
  }

  /**
   * Health check for the provider
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.firebaseAuth.listUsers(1);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set health check failure mode for testing
   *
   * @param fail - Whether health checks should fail
   */
  setFailHealthCheck(fail: boolean): void {
    this.firebaseAuth.setFailHealthCheck(fail);
  }

  /**
   * Delete a user from the provider (mock implementation)
   *
   * @param userId - User ID to delete
   * @param _tenantId - Optional tenant ID (unused in mock)
   */
  async deleteUser(userId: string, _tenantId?: string): Promise<void> {
    await this.firebaseAuth.deleteUser(userId);
  }

  /**
   * Delete all users in a tenant (mock implementation)
   *
   * @param _tenantId - Tenant ID to delete users from
   */
  async deleteTenantUsers(_tenantId: string): Promise<void> {
    let pageToken: string | undefined;
    do {
      const listUsersResult = await this.firebaseAuth.listUsers(1000, pageToken);

      await Promise.all(
        listUsersResult.users.map(async (user: { uid: string }) => {
          try {
            await this.firebaseAuth.deleteUser(user.uid);
          } catch (error) {
            console.warn(`Failed to delete user ${user.uid}:`, error);
          }
        })
      );

      pageToken = listUsersResult.pageToken;
    } while (pageToken);
  }
}

/**
 * Create a mock Firebase Identity Platform provider
 *
 * @param options - Optional provider configuration with mock options
 * @returns New FirebaseIdentityPlatformMockProvider instance
 */
export function createMockFirebaseIdentityPlatformProvider(
  options?: GoogleIdentityPlatformAuthProviderOptions &
    Partial<MockFirebaseIdentityPlatformProviderOptions>
): FirebaseIdentityPlatformMockProvider {
  return new FirebaseIdentityPlatformMockProvider({
    projectId: 'test-project',
    apiKey: 'test-api-key',
    ...options
  } as GoogleIdentityPlatformAuthProviderOptions & MockFirebaseIdentityPlatformProviderOptions);
}
