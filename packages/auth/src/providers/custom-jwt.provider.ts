/**
 * Custom JWT Auth Provider
 *
 * Generates and validates JWT tokens locally using JWT_SECRET.
 * Authenticates users against the local database.
 *
 * Use this for:
 * - Development without Firebase/GCP setup
 * - Testing with local auth
 * - Standalone deployments
 * - Cost savings (no Firebase/GCP)
 *
 * References:
 * - JWT: https://jwt.io/
 * - NestJS JwtService: https://docs.nestjs.com/security/authentication#jwt-functionality
 */

import * as crypto from 'node:crypto';
import { randomBytes } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';

import {
  AuthenticationError,
  TokenValidationError,
  UserInfoRetrievalError,
  InvalidAuthProviderConfigError
} from '../errors';
import { BaseAuthProvider } from './base-auth-provider';
import { REPLAY_DETECTION_FAIL_BEHAVIOR } from './factory.types';
import {
  TokenUsageTrackingService,
  type TokenUsageTrackingCacheService
} from '../services/token-usage-tracking.service';

import type { IAuthProvider, BaseAuthProviderOptions } from './auth-provider.interface';
import type { ReplayDetectionFailBehavior } from './factory.types';
import type {
  AuthResult,
  TokenValidationResult,
  TokenRefreshResult,
  UserInfo,
  RequestContext
} from '../types/auth.types';
import type { UserCredentials } from '../types/user.types';
import type { ConfigService } from '@nestjs/config';

/**
 * Hash email using SHA-256
 */
function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Safely parse an integer from a string
 *
 * @param value - String value to parse
 * @param fieldName - Field name for error message
 * @returns Parsed integer
 * @throws Error if value is NaN
 */
function parseSafeInt(value: string, fieldName: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid ${fieldName}: "${value}" is not a valid integer`);
  }
  return parsed;
}

/**
 * Simple logger for non-NestJS classes
 */
/* eslint-disable no-console */
class SimpleLogger {
  constructor(private readonly context: string) {}

  log(message: string): void {
    console.log(`[${this.context}] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[${this.context}] ${message}`);
  }

  error(message: string, error?: Error): void {
    if (error) {
      console.error(`[${this.context}] ${message}:`, error.message);
    } else {
      console.error(`[${this.context}] ${message}`);
    }
  }

  debug(message: string): void {
    if (process.env['DEBUG'] === 'true') {
      console.log(`[${this.context}] ${message}`);
    }
  }
}

/**
 * Access token payload for JWT
 */
interface AccessTokenPayload {
  userId: string;
  email: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

/**
 * Database table definitions for CustomJwtAuthProvider
 *
 * ## TypeScript Strict Mode Compliance
 *
 * This interface uses `any` types intentionally to maintain proper dependency direction:
 *
 * **Architecture Principle:** Infrastructure packages should NOT depend on concrete database implementations.
 * The auth package defines abstractions (interfaces), while the application layer (apps/api)
 * provides concrete implementations via dependency injection.
 *
 * **Why `any` is acceptable here:**
 * 1. **Dependency Inversion:** We depend on abstractions, not concrete types from @package/db-core
 * 2. **Type Safety at Boundary:** The application layer injects properly-typed tables
 * 3. **Runtime Safety:** Drizzle ORM validates queries at runtime
 * 4. **Future-Proof:** Allows different database implementations without changing infrastructure
 *
 * **Alternative approaches considered:**
 * - Import types from @package/db-core: ❌ Creates circular dependency
 * - Create duplicate type definitions: ❌ Maintenance burden, type drift
 * - Use generics: ❌ Excessive complexity for single provider
 * - Accept `any`: ✅ Minimal surface area, well-documented
 *
 * The actual type safety is enforced at the application layer where these dependencies are provided.
 *
 * @see {@link https://en.wikipedia.org/wiki/Dependency_inversion_principle | Dependency Inversion Principle}
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DatabaseTables {
  /** Users table from @package/db-core */
  users: any;
  /** User identities table from @package/db-core */
  userIdentities: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Database query utilities for CustomJwtAuthProvider
 *
 * ## TypeScript Strict Mode Compliance
 *
 * This interface uses `any` types for Drizzle ORM operators to avoid importing from @package/db-core.
 * See {@link DatabaseTables} for detailed rationale on using `any` in dependency interfaces.
 */
export interface DatabaseQueryUtils {
  /** Drizzle eq operator */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: any;
  /** Drizzle and operator */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: any;
  /** Drizzle isNull operator */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isNull: any;
}

/**
 * Encryption utilities for CustomJwtAuthProvider
 */
export interface EncryptionUtils {
  /** Decrypt a field that was encrypted at rest */
  decryptField: (encrypted: string) => Promise<string>;
}

/**
 * Password hashing utilities for CustomJwtAuthProvider
 */
export interface PasswordHasher {
  /** Verify a password against a hash */
  verify: (hash: string, password: string) => Promise<boolean>;
}

/**
 * Dependencies injected via module
 *
 * ## TypeScript Strict Mode Compliance
 *
 * The `db` and `configService` properties use `any` to avoid importing concrete types.
 * See {@link DatabaseTables} for detailed rationale on using `any` in dependency interfaces.
 */
export interface CustomJwtProviderDependencies {
  /** Database instance with user tables */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  /** Database table definitions */
  tables: DatabaseTables;
  /** Database query utilities */
  queryUtils: DatabaseQueryUtils;
  /** Password hashing utilities */
  passwordHasher: PasswordHasher;
  /** Encryption utilities for PII fields */
  encryption: EncryptionUtils;
  /** Role service for user roles */
  roleService: {
    getSystemRoles(userId: number): Promise<string[]>;
    getTenantRole(userId: number, tenantId: number): Promise<string | null>;
  };
  /** Permission service for user permissions */
  permissionService: {
    getUserPermissions(userId: number, tenantId?: number): Promise<string[]>;
  };
  /** Token service for refresh token management */
  tokenService: {
    storeRefreshToken: (
      tokenId: string,
      userId: string,
      tenantId: string,
      sessionId: string,
      expiresIn?: number
    ) => Promise<void>;
    getRefreshToken: (
      tokenId: string,
      tenantId?: string
    ) => Promise<
      | {
          userId: string;
          tokenId: string;
          tenantId: string;
          expiresAt: Date;
          revoked: boolean;
        }
      | undefined
    >;
    deleteRefreshToken: (tokenId: string, tenantId: string) => Promise<void>;
    blacklistAccessToken: (tokenId: string, tenantId: string, expiresIn: number) => Promise<void>;
    isAccessTokenBlacklisted: (tokenId: string, tenantId: string) => Promise<boolean>;
  };
  /** Cache service for token blacklist */
  cacheService: {
    get: <T = unknown>(key: string) => Promise<T | null>;
    set: (key: string, value: string, options?: { ttl?: number }) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  /** Config service */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configService?: any;
}

/**
 * Custom JWT Auth Provider options
 */
export interface CustomJwtAuthProviderOptions {
  /** Provider name (defaults to 'custom-jwt') */
  name?: string;
  /**
   * Behavior when replay detection fails due to cache/service errors.
   *
   * - 'fail-open': Continue validation without replay protection (default)
   *   Use when availability is critical and you have other security layers.
   * - 'fail-closed': Return invalid token response
   *   Use when security is paramount and downtime is acceptable.
   *
   * @default 'fail-open'
   */
  replayDetectionFailBehavior?: ReplayDetectionFailBehavior;
}

/**
 * Convert provider options to base options
 */
function convertToBaseOptions(options: CustomJwtAuthProviderOptions): BaseAuthProviderOptions {
  return {
    name: options.name ?? 'custom-jwt',
    authServerUrl: 'local',
    realm: 'default',
    clientId: 'custom-jwt',
    useSsl: true,
    timeout: 10000
  };
}

/**
 * Custom JWT Auth Provider
 *
 * Generates and validates JWT tokens locally using JWT_SECRET from environment.
 * Authenticates users against the local database using email/password.
 *
 * This provider is useful for:
 * - Development without Firebase/GCP setup
 * - Testing with local auth
 * - Standalone deployments
 * - Cost savings (no Firebase/GCP)
 *
 * Token Structure:
 * - Access Token: JWT with roles and permissions embedded
 * - Refresh Token: Random string stored in Redis
 *
 * @example
 * ```typescript
 * import { users, userIdentities } from '@package/db-core';
 * import { eq, and, isNull } from 'drizzle-orm';
 * import { decryptField } from '@package/encryption';
 * import { verify } from 'argon2';
 *
 * const provider = new CustomJwtAuthProvider({
 *   name: 'custom-jwt',
 *   dependencies: {
 *     db,
 *     tables: {
 *       users,
 *       userIdentities,
 *     },
 *     queryUtils: {
 *       eq,
 *       and,
 *       isNull,
 *     },
 *     passwordHasher: {
 *       verify,
 *     },
 *     encryption: {
 *       decryptField,
 *     },
 *     roleService,
 *     permissionService,
 *     tokenService,
 *     cacheService,
 *   }
 * });
 *
 * const result = await provider.authenticate({
 *   username: 'user@example.com',
 *   password: 'password123',
 *   tenantId: 'tenant-123',
 * });
 * ```
 */
@Injectable()
export class CustomJwtAuthProvider extends BaseAuthProvider implements IAuthProvider {
  private readonly jwtService: NestJwtService;
  private readonly configService: ConfigService;
  private readonly dependencies: CustomJwtProviderDependencies;
  private readonly logger: SimpleLogger;
  private readonly _replayDetectionFailBehavior: ReplayDetectionFailBehavior;
  private readonly tokenUsageTrackingService: TokenUsageTrackingService;

  constructor(
    options: CustomJwtAuthProviderOptions & { dependencies: CustomJwtProviderDependencies }
  ) {
    const baseOptions = convertToBaseOptions(options);
    const providerName = baseOptions.name ?? 'custom-jwt';

    super(providerName, 'custom-jwt', baseOptions);

    this.logger = new SimpleLogger('CustomJwtAuthProvider');
    this.dependencies = options.dependencies;

    // Initialize ConfigService
    this.configService =
      (this.dependencies.configService as ConfigService) ||
      ({
        get: (key: string) => process.env[key]
      } as unknown as ConfigService);

    // Initialize JwtService
    const jwtSecret = this.configService.get<string>('JWT_SECRET') || process.env['JWT_SECRET'];
    const jwtOptions: {
      secret?: string;
      signOptions?: {
        expiresIn:
          | '1h'
          | '2h'
          | '3h'
          | '4h'
          | '5h'
          | '6h'
          | '7h'
          | '8h'
          | '9h'
          | '10h'
          | '11h'
          | '12h'
          | '1d'
          | '2d'
          | '3d'
          | '4d'
          | '5d'
          | '6d'
          | '7d'
          | '8d'
          | '9d'
          | '10d'
          | number;
      };
    } = {
      signOptions: {
        expiresIn: (this.configService.get<string>('JWT_EXPIRES_IN') ||
          process.env['JWT_EXPIRES_IN'] ||
          '1h') as
          | '1h'
          | '2h'
          | '3h'
          | '4h'
          | '5h'
          | '6h'
          | '7h'
          | '8h'
          | '9h'
          | '10h'
          | '11h'
          | '12h'
          | '1d'
          | '2d'
          | '3d'
          | '4d'
          | '5d'
          | '6d'
          | '7d'
          | '8d'
          | '9d'
          | '10d'
          | number
      }
    };
    if (jwtSecret !== undefined) {
      jwtOptions.secret = jwtSecret;
    }
    this.jwtService = new NestJwtService(jwtOptions);

    // Configure replay detection failure behavior (default: fail-open for availability)
    this._replayDetectionFailBehavior =
      options.replayDetectionFailBehavior ?? REPLAY_DETECTION_FAIL_BEHAVIOR.FailOpen;

    // Initialize token usage tracking service once for reuse across validateToken calls
    this.tokenUsageTrackingService = new TokenUsageTrackingService(
      this.dependencies.cacheService as TokenUsageTrackingCacheService
    );

    this.logger.debug(
      `Custom JWT Auth Provider initialized (replayDetectionFailBehavior=${this._replayDetectionFailBehavior})`
    );
  }

  /**
   * Get the configured replay detection failure behavior
   *
   * @returns 'fail-open' or 'fail-closed'
   */
  getReplayDetectionFailBehavior(): ReplayDetectionFailBehavior {
    return this._replayDetectionFailBehavior;
  }

  /**
   * Authenticate user with email/password
   *
   * Returns JWT tokens with roles and permissions embedded.
   *
   * Uses constant-time comparison to prevent timing attacks.
   *
   * @param credentials - User credentials (username=email, password, tenantId)
   * @returns Authentication result with tokens
   * @throws AuthenticationError if authentication fails
   */
  async authenticate(credentials: UserCredentials): Promise<AuthResult> {
    const startTime = Date.now();
    const email = credentials.username;
    const password = credentials.password;
    const tenantId = credentials.tenantId;

    if (!email || !password) {
      const duration = Date.now() - startTime;
      this.recordAuthenticate(
        this.buildAttributes('Missing credentials', { tenant_id: tenantId }),
        duration
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      const { db } = this.dependencies;
      const { users, userIdentities } = this.dependencies.tables;
      const { eq, and, isNull } = this.dependencies.queryUtils;

      const emailHash = hashEmail(email);

      // Get user and identity in parallel to prevent timing attacks
      const [userResult, identityResult] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any)
          .select()
          .from(users)
          .where(
            and(eq(users.emailHash, emailHash), isNull(users.deletedAt), eq(users.isActive, true))
          )
          .limit(1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db as any)
          .select()
          .from(userIdentities)
          .where(eq(userIdentities.emailHash, emailHash))
          .limit(1)
      ]);

      const [user] = userResult;
      const [identity] = identityResult;

      // Check all conditions before throwing to prevent timing attacks
      const hasUser = !!user;
      const hasIdentity = !!identity;
      const hasPasswordHash = !!identity?.passwordHash;

      // Verify password if identity exists
      let passwordValid = false;
      if (identity?.passwordHash) {
        try {
          passwordValid = await this.dependencies.passwordHasher.verify(
            identity.passwordHash,
            password
          );
        } catch {
          passwordValid = false;
        }
      }

      // Single error path for all auth failures to prevent timing attacks
      if (!hasUser || !hasIdentity || !hasPasswordHash || !passwordValid) {
        const duration = Date.now() - startTime;
        this.recordAuthenticate(
          this.buildAttributes('Invalid credentials', { tenant_id: tenantId }),
          duration
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      // Get effective tenant ID
      const effectiveTenantId = tenantId || String(user.organizationId);

      // Get user roles and permissions
      const { roles, permissions } = await this.getUserRolesAndPermissions(
        user.id,
        effectiveTenantId
      );

      // Generate and store tokens
      return this.generateAuthTokens(user, email, effectiveTenantId, roles, permissions, startTime);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordAuthenticate(
        this.buildAttributes(errorMessage, { tenant_id: tenantId }),
        duration
      );

      if (error instanceof UnauthorizedException || error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError('Authentication failed', error);
    }
  }

  /**
   * Get user roles and permissions
   */
  private async getUserRolesAndPermissions(userId: number, effectiveTenantId: string) {
    const systemRoles = await this.dependencies.roleService.getSystemRoles(userId);
    const tenantRole = effectiveTenantId
      ? await this.dependencies.roleService.getTenantRole(
          userId,
          parseSafeInt(effectiveTenantId, 'tenantId')
        )
      : null;

    const roles = [...systemRoles];
    if (tenantRole) {
      roles.push(tenantRole);
    }

    const permissions = await this.dependencies.permissionService.getUserPermissions(
      userId,
      effectiveTenantId ? parseSafeInt(effectiveTenantId, 'tenantId') : undefined
    );

    return { roles, permissions };
  }

  /**
   * Generate and store authentication tokens
   */
  private async generateAuthTokens(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: any,
    email: string,
    effectiveTenantId: string,
    roles: string[],
    permissions: string[],
    startTime: number
  ): Promise<AuthResult> {
    const accessToken = await this.generateAccessToken({
      userId: String(user.id),
      email,
      tenantId: effectiveTenantId,
      roles,
      permissions
    });

    const tokenId = randomBytes(16).toString('hex');
    const refreshToken = tokenId;
    const sessionId = randomBytes(16).toString('hex');

    const expiresIn = this.parseExpiration(
      this.configService.get<string>('JWT_EXPIRES_IN') || '1h'
    );
    const refreshExpiresIn = parseInt(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '2592000',
      10
    );

    await this.dependencies.tokenService.storeRefreshToken(
      tokenId,
      String(user.id),
      effectiveTenantId,
      sessionId,
      refreshExpiresIn
    );

    const duration = Date.now() - startTime;
    this.recordAuthenticate(
      this.buildAttributes(undefined, { tenant_id: effectiveTenantId }),
      duration
    );

    return {
      accessToken,
      refreshToken,
      idToken: accessToken,
      expiresIn,
      refreshExpiresIn
    };
  }

  /**
   * Validate JWT token
   *
   * @param token - JWT access token
   * @param requestContext - Optional request context for replay attack prevention
   * @returns Token validation result
   */
  // eslint-disable-next-line complexity
  async validateToken(
    token: string,
    requestContext?: RequestContext
  ): Promise<TokenValidationResult> {
    const startTime = Date.now();

    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) {
        throw new InvalidAuthProviderConfigError('JWT_SECRET is not configured');
      }

      const verifyOptions: { secret: string } = { secret };
      const payload = await this.jwtService.verifyAsync(token, verifyOptions);

      // Check if token is blacklisted
      const tokenId = payload.jti as string | undefined;
      const tenantId = payload.tenant_id as string | undefined;
      const userId = payload.sub as string;
      const exp = payload.exp as number;

      if (tokenId && tenantId) {
        const isBlacklisted = await this.dependencies.tokenService.isAccessTokenBlacklisted(
          tokenId,
          tenantId
        );
        if (isBlacklisted) {
          const duration = Date.now() - startTime;
          this.recordValidateToken(this.buildAttributes('Token blacklisted'), duration);
          return {
            valid: false,
            error: 'Token has been revoked'
          };
        }
      }

      // CRITICAL: Check for token replay attack if request context provided
      if (tokenId && tenantId && userId && exp) {
        try {
          const usageCheck = await this.tokenUsageTrackingService.checkTokenUsage(
            tokenId,
            tenantId,
            userId,
            requestContext,
            exp
          );

          if (!usageCheck.isValid) {
            const duration = Date.now() - startTime;
            const alertMessage = usageCheck.securityAlert?.message ?? 'Token replay detected';
            this.recordValidateToken(this.buildAttributes('Token replay detected'), duration);

            // Log security alert for monitoring
            if (usageCheck.securityAlert) {
              console.warn('[Security Alert]', JSON.stringify(usageCheck.securityAlert));
            }

            return {
              valid: false,
              error: alertMessage
            };
          }
        } catch (replayError) {
          // CRITICAL: Log replay detection failures for monitoring/alerting
          const maskedTokenId = tokenId
            ? `${tokenId.slice(0, 4)}...${tokenId.slice(-4)}`
            : 'unknown';
          const errorMessage =
            replayError instanceof Error ? replayError.message : String(replayError);
          const failBehavior = this._replayDetectionFailBehavior;

          this.logger.warn(
            `Replay detection error: tokenId=${maskedTokenId}, tenant=${tenantId}, ` +
              `error="${errorMessage}", behavior=${failBehavior}`
          );

          // Record metric for monitoring with behavior label
          this.recordValidateToken(
            this.buildAttributes('replay-detection-error', {
              error_type: replayError instanceof Error ? replayError.name : 'Unknown',
              tenant_id: tenantId,
              fail_behavior: failBehavior
            }),
            0
          );

          // Apply configured behavior
          if (failBehavior === REPLAY_DETECTION_FAIL_BEHAVIOR.FailClosed) {
            this.logger.warn(
              `Replay detection fail-closed: rejecting token tokenId=${maskedTokenId}, tenant=${tenantId}`
            );
            const duration = Date.now() - startTime;
            this.recordValidateToken(
              this.buildAttributes('replay-detection-fail-closed', { tenant_id: tenantId }),
              duration
            );
            return {
              valid: false,
              error: 'Token validation failed due to security check unavailability'
            };
          }

          // fail-open: Continue validation without replay protection (default)
          this.logger.warn(
            `Replay detection fail-open: continuing without replay protection tokenId=${maskedTokenId}`
          );
        }
      }

      const duration = Date.now() - startTime;
      this.recordValidateToken(this.buildAttributes(undefined), duration);

      const result: TokenValidationResult = {
        valid: true,
        userId
      };
      if (tenantId !== undefined) {
        result.tenantId = tenantId;
      }
      if (exp !== undefined) {
        result.exp = exp;
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordValidateToken(this.buildAttributes(errorMessage), duration);

      return {
        valid: false,
        error: errorMessage
      };
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * @param refreshToken - Refresh token
   * @returns Token refresh result with new tokens
   * @throws TokenValidationError if refresh fails
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResult> {
    const startTime = Date.now();

    try {
      // 1. Verify refresh token exists in Redis and extract tenantId from stored data
      const stored = await this.dependencies.tokenService.getRefreshToken(refreshToken);

      if (!stored || stored.revoked) {
        const duration = Date.now() - startTime;
        this.recordRefreshToken(this.buildAttributes('Invalid refresh token'), duration);
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Extract tenantId from stored token data
      const tenantId = stored.tenantId;

      // 2. Get user
      const { db } = this.dependencies;
      const { users } = this.dependencies.tables;
      const { eq } = this.dependencies.queryUtils;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [user] = await (db as any)
        .select()
        .from(users)
        .where(eq(users.id, parseSafeInt(stored.userId, 'userId')))
        .limit(1);

      if (!user) {
        const duration = Date.now() - startTime;
        this.recordRefreshToken(this.buildAttributes('User not found'), duration);
        throw new UnauthorizedException('User not found');
      }

      // CRITICAL: Validate tenant consistency - user's organization must match stored tenant
      // This prevents cross-tenant claim drift where a user could refresh into a different tenant
      if (String(user.organizationId) !== tenantId) {
        const duration = Date.now() - startTime;
        this.recordRefreshToken(this.buildAttributes('Tenant mismatch'), duration);
        throw new UnauthorizedException(
          'Tenant context changed. Please re-authenticate with the correct tenant.'
        );
      }

      // Decrypt email from database
      const email = await this.dependencies.encryption.decryptField(user.emailEncrypted);

      // 3. Get roles and permissions using stored tenantId for consistency
      const systemRoles = await this.dependencies.roleService.getSystemRoles(user.id);
      const tenantRole = await this.dependencies.roleService.getTenantRole(
        user.id,
        parseSafeInt(tenantId, 'tenantId')
      );
      const roles = tenantRole ? [...systemRoles, tenantRole] : systemRoles;

      const permissions = await this.dependencies.permissionService.getUserPermissions(
        user.id,
        parseSafeInt(tenantId, 'tenantId')
      );

      // 4. Generate new access token using stored tenantId
      const accessToken = await this.generateAccessToken({
        userId: String(user.id),
        email,
        tenantId,
        roles,
        permissions
      });

      // 5. Generate new refresh token (rotation) using stored tenantId
      const newRefreshToken = randomBytes(16).toString('hex');
      const sessionId = randomBytes(16).toString('hex');
      const refreshExpiresIn = parseInt(
        this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '2592000',
        10
      );

      await this.dependencies.tokenService.storeRefreshToken(
        newRefreshToken,
        String(user.id),
        tenantId,
        sessionId,
        refreshExpiresIn
      );

      // 6. Invalidate old refresh token
      await this.dependencies.tokenService.deleteRefreshToken(refreshToken, tenantId);

      const expiresIn = this.parseExpiration(
        this.configService.get<string>('JWT_EXPIRES_IN') || '1h'
      );

      const duration = Date.now() - startTime;
      this.recordRefreshToken(this.buildAttributes(undefined), duration);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        idToken: accessToken,
        expiresIn,
        rotated: true,
        refreshExpiresIn
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordRefreshToken(this.buildAttributes(errorMessage), duration);

      if (error instanceof UnauthorizedException || error instanceof TokenValidationError) {
        throw error;
      }

      throw new TokenValidationError('Token refresh failed', error);
    }
  }

  /**
   * Logout user - invalidate refresh token
   *
   * @param refreshToken - Refresh token to revoke
   * @param accessToken - Access token to blacklist (optional)
   */
  async logout(refreshToken: string, accessToken?: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Get stored token data to extract tenantId
      const stored = await this.dependencies.tokenService.getRefreshToken(refreshToken);

      if (!stored) {
        const duration = Date.now() - startTime;
        this.recordLogout(this.buildAttributes('Refresh token not found'), duration);
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tenantId = stored.tenantId;

      await this.dependencies.tokenService.deleteRefreshToken(refreshToken, tenantId);

      // Optionally blacklist access token
      if (accessToken) {
        try {
          const secret = this.configService.get<string>('JWT_SECRET');
          const verifyOptions: { secret?: string } = {};
          if (secret !== undefined) {
            verifyOptions.secret = secret;
          }
          const payload = await this.jwtService.verifyAsync(accessToken, verifyOptions);
          const ttl = payload.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            const tokenId = payload.jti as string | undefined;
            if (tokenId) {
              await this.dependencies.tokenService.blacklistAccessToken(tokenId, tenantId, ttl);
            }
          }
        } catch {
          // Token might be invalid, continue with logout
        }
      }

      const duration = Date.now() - startTime;
      this.recordLogout(this.buildAttributes(undefined), duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordLogout(this.buildAttributes(errorMessage), duration);

      throw new AuthenticationError('Logout failed', error);
    }
  }

  /**
   * Get user info by ID
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns User information
   * @throws UserInfoRetrievalError if retrieval fails
   */
  async getUserInfo(userId: string, tenantId: string): Promise<UserInfo> {
    const startTime = Date.now();

    try {
      const { db } = this.dependencies;
      const { users } = this.dependencies.tables;
      const { eq } = this.dependencies.queryUtils;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, parseSafeInt(userId, 'userId')))
        .limit(1);

      if (!user) {
        const duration = Date.now() - startTime;
        this.recordGetUserInfo(
          this.buildAttributes('User not found', { tenant_id: tenantId }),
          duration
        );
        throw new UserInfoRetrievalError('User not found');
      }

      const email = await this.dependencies.encryption.decryptField(user.emailEncrypted);
      const firstName = user.firstNameEncrypted
        ? await this.dependencies.encryption.decryptField(user.firstNameEncrypted)
        : undefined;
      const lastName = user.lastNameEncrypted
        ? await this.dependencies.encryption.decryptField(user.lastNameEncrypted)
        : undefined;

      const roles = await this.getRoles(userId, tenantId);
      const permissions = await this.getPermissions(userId, tenantId);

      const duration = Date.now() - startTime;
      this.recordGetUserInfo(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      const result: UserInfo = {
        userId,
        username: email,
        email,
        roles,
        permissions,
        tenantId
      };
      if (firstName !== undefined) {
        result.givenName = firstName;
      }
      if (lastName !== undefined) {
        result.familyName = lastName;
      }
      if (user.displayName !== undefined) {
        result.name = user.displayName;
      } else if (firstName !== undefined || lastName !== undefined) {
        result.name = `${firstName || ''} ${lastName || ''}`.trim();
      }
      if (user.isVerified !== undefined) {
        result.emailVerified = user.isVerified;
      }
      result.attributes = {
        isActive: user.isActive,
        isVerified: user.isVerified,
        photoUrl: user.photoUrl,
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt
      } as Record<string, unknown>;
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetUserInfo(this.buildAttributes(errorMessage, { tenant_id: tenantId }), duration);

      if (error instanceof UserInfoRetrievalError) {
        throw error;
      }

      throw new UserInfoRetrievalError('Failed to get user info', error);
    }
  }

  /**
   * Get user info from token
   *
   * @param token - Access token
   * @returns User information
   * @throws UserInfoRetrievalError if retrieval fails
   */
  async getUserInfoFromToken(token: string): Promise<UserInfo> {
    const result = await this.validateToken(token);

    if (!result.valid || !result.userId || !result.tenantId) {
      throw new UnauthorizedException('Invalid token');
    }

    return this.getUserInfo(result.userId, result.tenantId);
  }

  /**
   * Get user roles
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns Array of role names
   */
  async getRoles(userId: string, tenantId: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      const parsedUserId = parseSafeInt(userId, 'userId');
      const parsedTenantId = parseSafeInt(tenantId, 'tenantId');

      const systemRoles = await this.dependencies.roleService.getSystemRoles(parsedUserId);
      const tenantRole = await this.dependencies.roleService.getTenantRole(
        parsedUserId,
        parsedTenantId
      );

      const roles = [...systemRoles];
      if (tenantRole) {
        roles.push(tenantRole);
      }

      const duration = Date.now() - startTime;
      this.recordGetRoles(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return roles;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetRoles(this.buildAttributes(errorMessage, { tenant_id: tenantId }), duration);

      return [];
    }
  }

  /**
   * Get user roles from token
   *
   * @param token - Access token
   * @returns Array of role names
   */
  async getRolesFromToken(token: string): Promise<string[]> {
    const result = await this.validateToken(token);

    if (!result.valid || !result.userId || !result.tenantId) {
      throw new UnauthorizedException('Invalid token');
    }

    // Get roles from database since token doesn't have them
    return this.getRoles(result.userId, result.tenantId);
  }

  /**
   * Get user permissions
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID
   * @returns Array of permission names
   */
  async getPermissions(userId: string, tenantId: string): Promise<string[]> {
    const startTime = Date.now();

    try {
      const parsedUserId = parseSafeInt(userId, 'userId');
      const parsedTenantId = parseSafeInt(tenantId, 'tenantId');

      const permissions = await this.dependencies.permissionService.getUserPermissions(
        parsedUserId,
        parsedTenantId
      );

      const duration = Date.now() - startTime;
      this.recordGetPermissions(this.buildAttributes(undefined, { tenant_id: tenantId }), duration);

      return permissions;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordGetPermissions(
        this.buildAttributes(errorMessage, { tenant_id: tenantId }),
        duration
      );

      return [];
    }
  }

  /**
   * Get user permissions from token
   *
   * @param token - Access token
   * @returns Array of permission names
   */
  async getPermissionsFromToken(token: string): Promise<string[]> {
    const result = await this.validateToken(token);

    if (!result.valid || !result.userId || !result.tenantId) {
      throw new UnauthorizedException('Invalid token');
    }

    // Get permissions from database since token doesn't have them
    return this.getPermissions(result.userId, result.tenantId);
  }

  /**
   * Check if the provider is available
   *
   * @returns true if JWT_SECRET is configured
   */
  async isAvailable(): Promise<boolean> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      return !!secret && secret.length >= 32;
    } catch {
      return false;
    }
  }

  /**
   * Health check for the provider
   *
   * @returns true if provider is configured
   */
  async healthCheck(): Promise<boolean> {
    return this.isAvailable();
  }

  /**
   * Delete user (no-op for custom JWT - users managed in database)
   *
   * @param userId - User ID to delete
   * @param tenantId - Optional tenant ID
   */
  async deleteUser(userId: string, tenantId?: string): Promise<void> {
    // User deletion handled by database, not auth provider
    // This is a no-op for custom JWT provider
    this.logger.debug(
      `deleteUser called for user ${userId} in tenant ${tenantId || 'default'} (no-op)`
    );
  }

  /**
   * Delete all users in a tenant
   *
   * @param tenantId - Tenant ID
   */
  async deleteTenantUsers(tenantId: string): Promise<void> {
    // Handled by database
    this.logger.debug(`deleteTenantUsers called for tenant ${tenantId} (no-op)`);
  }

  /**
   * Generate access token with all claims
   *
   * @param payload - Token payload
   * @returns Signed JWT token
   */
  private async generateAccessToken(payload: AccessTokenPayload): Promise<string> {
    const tokenId = randomBytes(16).toString('hex');

    return this.jwtService.signAsync({
      sub: payload.userId,
      email: payload.email,
      tenant_id: payload.tenantId,
      roles: payload.roles,
      permissions: payload.permissions, // Embed ALL permissions in token
      jti: tokenId // JWT ID for blacklist
    });
  }

  /**
   * Parse expiration string to seconds
   *
   * @param expiresIn - Expiration string (e.g., "1h", "30d")
   * @returns Expiration in seconds
   */
  private parseExpiration(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([hdm])$/);
    if (!match) return 3600;

    const value = parseInt(match[1] as string, 10);
    const unit = match[2];

    switch (unit) {
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      case 'm':
        return value * 60;
      default:
        return 3600;
    }
  }
}
