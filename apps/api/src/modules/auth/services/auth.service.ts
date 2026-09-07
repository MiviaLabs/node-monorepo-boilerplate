/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AUTH_PROVIDER_FACTORY,
  type IAuthProvider,
  AuthProviderFactory,
  RoleService,
  CachedRoleService,
  CachedPermissionService,
  TokenExpiration
} from '@package/auth';
import { SYSTEM_ROLE, TENANT_ROLE } from '@package/constants';
import { OutboxRepository } from '@package/events';
import { CacheService } from '@package/redis';
import { sql } from 'drizzle-orm';

import { MAIN_DB } from '../../../common/database/database.constants';
import {
  getPhase0RedisTarget,
  measurePhase0,
  recordPhase0Note
} from '../../../common/services/phase-zero-diagnostics.service';
import { AUTH_ERROR_CODES, PUBLIC_AUTH_TENANT_ID, AUTH_PROVIDERS } from '../auth.constants';
import { buildAuthAuditEvent, AuthEventSchemaVersion } from '../events';
import { AuthSessionStoreService } from './auth-session-store.service';
import { AuthRepository } from '../repositories/auth.repository';
import { UserIdentityRepository } from '../repositories/user-identity.repository';

import type { AuthResult, UserInfo, ProviderProfile } from '../auth.types';
import type { User } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

interface BootstrapInstallParams {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
  organizationSlug: string;
  firstName?: string;
  lastName?: string;
}

interface AuditTraceContext {
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Auth Service
 *
 * Central service for authentication operations
 * Handles user/identity management logic
 *
 * Uses GCP Identity Platform for authentication via IAuthProvider
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly authProvider: IAuthProvider;
  private static readonly BOOTSTRAP_INSTALL_ADVISORY_LOCK_KEY = 7042001;

  constructor(
    @Inject(AUTH_PROVIDER_FACTORY) private readonly authProviderFactory: AuthProviderFactory,
    private readonly authRepository: AuthRepository,
    private readonly userIdentityRepository: UserIdentityRepository,
    private readonly cache: CacheService,
    private readonly outboxRepo: OutboxRepository,
    private readonly roleService: RoleService,
    private readonly cachedRoleService: CachedRoleService,
    private readonly cachedPermissionService: CachedPermissionService,
    private readonly authSessionStore: AuthSessionStoreService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {
    // Initialize provider in constructor for multi-replica safety
    // This ensures consistent provider resolution across all replicas
    const provider = this.authProviderFactory.getDefaultProvider();
    if (!provider) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
        message: 'No auth provider configured. Please configure GCP Identity Platform.'
      });
    }
    this.authProvider = provider;
    this.logger.log('AuthService initialized with auth provider');
  }

  /**
   * Get the default auth provider
   *
   * Provider is initialized in constructor for multi-replica safety.
   * This avoids race conditions during concurrent provider initialization.
   */
  private getProvider(): IAuthProvider {
    return this.authProvider;
  }

  /**
   * Authenticate with email/password
   *
   * Uses GCP Identity Platform for authentication
   *
   * NOTE: This method does NOT update last sign-in timestamp.
   * The login handler is responsible for updating the last sign-in timestamp
   * within a transaction that also includes the outbox event insert.
   */
  async authenticateWithEmailPassword(
    tenantId: string | undefined,
    email: string,
    password: string,
    options?: { isRetryForNewUser?: boolean }
  ): Promise<{ authResult: AuthResult; userInfo: UserInfo; isNewUser: boolean; user: User }> {
    // Step 1: Validate user exists and get GCP tenant ID
    const { user, gcpTenantId } = await this.validateUserExists(tenantId, email);

    // Step 2: Authenticate with GCP Identity Platform
    // Use retry logic if this is a newly created user (GCP propagation delay)
    const gcpAuthResult = await this.authenticateWithGCP(email, password, gcpTenantId, {
      isRetryForNewUser: options?.isRetryForNewUser ?? false
    });

    // Step 3: Get user info from GCP token
    const gcpUserInfo = await this.getGCPUserInfo(gcpAuthResult.idToken);

    // Step 4: Ensure custom claims are set (for existing users who may not have them)
    const claimsWereSet = await this.ensureCustomClaims(
      gcpUserInfo.userId,
      `${user.organizationId}`,
      user.id,
      gcpTenantId
    );

    // Step 5: Local app JWTs do not depend on provider token claim propagation.
    // Keep the claim sync for provider-side consistency, but do not obtain a second provider token.
    if (claimsWereSet) {
      this.logger.debug(
        'Custom claims were updated for the provider identity; returning app-local session tokens.'
      );
    }

    // Step 6: Fetch roles and permissions from database (immediate, no Firebase delay)
    // Firebase custom claims can take up to 1 hour to propagate, so we always query DB
    const dbRoles = await this.cachedRoleService.getUserRoles(
      user.id,
      user.organizationId ?? undefined
    );
    const dbPermissions = await this.cachedPermissionService.getUserPermissions(
      user.id,
      user.organizationId ?? undefined
    );

    // Step 7: Build user info response with database-backed roles/permissions
    // This ensures dashboard displays roles immediately after registration
    const userInfo = this.buildUserInfo(user, gcpUserInfo, gcpTenantId, dbRoles, dbPermissions);

    // Step 8: Issue app-local session tokens after provider authentication succeeds.
    // Session persistence is owned by the command handlers so auth-only checks
    // like change-password verification do not create stray sessions.
    const appAuthResult = await this.buildLocalAuthResult({
      userId: String(user.id),
      email: gcpUserInfo.email,
      tenantId: String(user.organizationId),
      roles: dbRoles,
      permissions: dbPermissions,
      name: user.displayName ?? undefined
    });

    return { authResult: appAuthResult, userInfo, isNewUser: false, user };
  }

  /**
   * Change password for the currently authenticated user
   *
   * Security flow:
   * 1. Ensure account has an email/password identity
   * 2. Verify current password
   * 3. Update password in provider by provider UID
   */
  async changeMyPassword(
    tenantId: string,
    userId: number,
    email: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    if (currentPassword === newPassword) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.PASSWORD_MISMATCH,
        message: 'New password must be different from current password'
      });
    }

    const provider = this.getProvider();
    if (typeof provider.changePassword !== 'function') {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
        message: 'Password change is not supported by the configured auth provider'
      });
    }

    const hasEmailPasswordIdentity = await this.userIdentityRepository.userHasProvider(
      userId,
      AUTH_PROVIDERS.EMAIL_PASSWORD
    );
    if (!hasEmailPasswordIdentity) {
      throw new ForbiddenException({
        code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
        message: 'Password change is only available for email/password accounts'
      });
    }

    try {
      await this.authenticateWithEmailPassword(tenantId, email, currentPassword);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Current password is incorrect'
        });
      }
      throw error;
    }

    const identities = await this.userIdentityRepository.findByUserId(userId);
    const passwordIdentity = identities.find(
      (identity) => identity.provider === String(AUTH_PROVIDERS.EMAIL_PASSWORD)
    );
    const providerUserId = passwordIdentity?.providerUid;

    if (!providerUserId) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.IDENTITY_NOT_FOUND,
        message: 'Email/password identity not found for this account'
      });
    }

    const user = await this.authRepository.findById(tenantId, userId);
    if (!user) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.USER_NOT_FOUND,
        message: 'User account not found'
      });
    }

    const organization = await this.authRepository.findOrganizationById(user.organizationId);
    const gcpTenantId = organization?.gcpTenantId ?? undefined;

    await provider.changePassword(providerUserId, newPassword, gcpTenantId);
  }

  /**
   * Validate user exists by email
   *
   * @param email - User email
   * @returns User and GCP tenant ID
   */
  private async validateUserExists(
    tenantId: string | undefined,
    email: string
  ): Promise<{ user: User; gcpTenantId: string | null }> {
    const tenantScope =
      tenantId && tenantId !== PUBLIC_AUTH_TENANT_ID && tenantId.trim() !== ''
        ? tenantId
        : undefined;
    const userWithOrg = await this.authRepository.findWithOrganizationByEmail(email, tenantScope);

    if (!userWithOrg) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password'
      });
    }

    const { user, organization } = userWithOrg;
    const gcpTenantId = organization.gcpTenantId;

    return { user, gcpTenantId };
  }

  private parsePositiveInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private async buildLocalAuthResult(params: {
    userId: string;
    email?: string;
    tenantId: string;
    roles: string[];
    permissions: string[];
    name?: string;
  }): Promise<AuthResult> {
    const accessToken = await this.jwtService.signAsync({
      sub: params.userId,
      db_user_id: params.userId,
      actor_id: params.userId,
      tenant_id: params.tenantId,
      roles: params.roles,
      permissions: params.permissions,
      ...(params.email !== undefined && { email: params.email }),
      ...(params.name !== undefined && { name: params.name }),
      jti: randomBytes(16).toString('hex')
    });

    const expiresIn = this.parseTokenExpiration(
      this.configService.get<string>('JWT_EXPIRES_IN') ?? '1h'
    );
    const refreshExpiresIn = Number.parseInt(
      this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN') ??
        String(TokenExpiration.REFRESH_TOKEN),
      10
    );

    return {
      accessToken,
      refreshToken: randomBytes(32).toString('hex'),
      idToken: accessToken,
      expiresIn,
      refreshExpiresIn:
        Number.isInteger(refreshExpiresIn) && refreshExpiresIn > 0
          ? refreshExpiresIn
          : TokenExpiration.REFRESH_TOKEN
    };
  }

  private parseTokenExpiration(expiresIn: string): number {
    const match = /^(\d+)([mhd])$/.exec(expiresIn.trim());
    if (!match) {
      return 3600;
    }

    const [, rawAmount, unit] = match;
    if (!rawAmount || !unit) {
      return 3600;
    }

    const amount = Number.parseInt(rawAmount, 10);
    switch (unit) {
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 3600;
      case 'd':
        return amount * 86400;
      default:
        return 3600;
    }
  }

  private isProviderIssuedAccessToken(token?: string): boolean {
    return this.isFirebaseTokenPayload(this.decodeTokenPayload(token));
  }

  private decodeTokenPayload(token?: string): Record<string, unknown> | null {
    if (!token) {
      return null;
    }

    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) {
        return null;
      }

      return JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8')) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  }

  private isFirebaseTokenPayload(payload: Record<string, unknown> | null): boolean {
    return (
      typeof payload?.['iss'] === 'string' && payload['iss'].includes('securetoken.google.com')
    );
  }

  private tryValidateLocalAccessToken(token: string): UserInfo | null {
    try {
      const payload = this.jwtService.verify(token) as Record<string, unknown>;
      const userId = this.toOptionalString(
        payload['db_user_id'] ?? payload['user_id'] ?? payload['sub']
      );
      const tenantId = this.toOptionalString(payload['tenant_id'] ?? payload['tenantId']);

      if (!userId || !tenantId) {
        return null;
      }

      const email = this.toOptionalString(payload['email']) ?? '';
      const name =
        this.toOptionalString(payload['name']) ??
        this.toOptionalString(payload['displayName']) ??
        '';
      const roles = Array.isArray(payload['roles'])
        ? payload['roles'].filter((value): value is string => typeof value === 'string')
        : [];
      const permissions = Array.isArray(payload['permissions'])
        ? payload['permissions'].filter((value): value is string => typeof value === 'string')
        : [];

      return {
        userId,
        email,
        name,
        emailVerified: Boolean(email),
        roles,
        permissions,
        tenantId,
        attributes: {
          db_user_id: userId,
          tenant_id: tenantId,
          actor_id: this.toOptionalString(payload['actor_id']) ?? userId
        }
      };
    } catch {
      return null;
    }
  }

  private toOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private extractDbUserContext(userInfo: UserInfo): { userId: number; tenantId: number } | null {
    const attributeUserId =
      userInfo.attributes?.['db_user_id'] ?? userInfo.attributes?.['dbUserId'];
    const attributeTenantId =
      userInfo.attributes?.['tenant_id'] ?? userInfo.attributes?.['tenantId'] ?? userInfo.tenantId;

    const userId = this.parsePositiveInt(attributeUserId ?? userInfo.userId);
    const tenantId = this.parsePositiveInt(attributeTenantId);
    if (!userId || !tenantId) {
      return null;
    }

    return { userId, tenantId };
  }

  private async assertUserInfoPrincipalIsActive(userInfo: UserInfo): Promise<User | null> {
    const context = this.extractDbUserContext(userInfo);
    if (!context) {
      return null;
    }

    const [user, organization] = await Promise.all([
      this.authRepository.findById(String(context.tenantId), context.userId),
      this.authRepository.findOrganizationById(context.tenantId)
    ]);

    if (user?.isActive !== true) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.USER_NOT_FOUND,
        message: 'User account is inactive or deleted'
      });
    }

    if (organization?.isActive !== true || organization.deletedAt) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.USER_NOT_FOUND,
        message: 'Organization is inactive or deleted'
      });
    }

    return user;
  }

  /**
   * Delete linked external auth account (GCP Identity Platform) for a user when applicable.
   *
   * Used by account/member removal flows to prevent orphaned provider users that would block
   * re-registration with the same email.
   */
  async deleteLinkedProviderUser(userId: number, organizationId: number): Promise<void> {
    const identity = await this.userIdentityRepository.findPrimaryByUserId(userId);
    if (!identity?.providerUid) {
      return;
    }

    const organization = await this.authRepository.findOrganizationById(organizationId);
    const gcpTenantId = organization?.gcpTenantId ?? null;
    if (!gcpTenantId) {
      return;
    }

    await this.getProvider().deleteUser(identity.providerUid, gcpTenantId);
  }

  /**
   * Authenticate with GCP Identity Platform
   *
   * NOTE: After user creation, GCP Identity Platform may take a few seconds to propagate
   * the user to the authentication endpoint. This method includes retry logic for
   * newly created users.
   */
  private async authenticateWithGCP(
    email: string,
    password: string,
    gcpTenantId: string | null,
    options?: { isRetryForNewUser?: boolean; maxRetries?: number }
  ): Promise<AuthResult> {
    const { isRetryForNewUser = false, maxRetries = isRetryForNewUser ? 5 : 1 } = options ?? {};

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.getProvider().authenticate({
          username: email,
          password,
          ...(gcpTenantId !== null && { tenantId: gcpTenantId })
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isLastAttempt = attempt === maxRetries - 1;

        // Log the actual GCP error for debugging
        this.logger.error(
          `GCP authentication attempt ${attempt + 1}/${maxRetries} failed: ${errorMessage}` +
            (gcpTenantId ? ` (tenant: ${gcpTenantId})` : '')
        );

        // If this is retry mode and not the last attempt, wait and retry
        if (isRetryForNewUser && !isLastAttempt) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s, 16s
          this.logger.debug(`Retrying authentication in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Throw proper error on final attempt
        throw new UnauthorizedException({
          code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Invalid email or password'
        });
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new UnauthorizedException({
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      message: 'Invalid email or password'
    });
  }

  /**
   * Get user info from GCP token
   */
  private async getGCPUserInfo(idToken: string): Promise<UserInfo> {
    try {
      const userInfo = await this.getProvider().getUserInfoFromToken(idToken);
      this.logger.debug('User info extracted from token');
      return userInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to parse GCP token: ${errorMessage}`);
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID,
        message: 'Invalid authentication token'
      });
    }
  }

  /**
   * Update last sign in time for user identity within a transaction (PUBLIC method for handler)
   *
   * This is called by the login handler within a transaction that also includes
   * the outbox event insert. This ensures atomicity - both the last sign-in update
   * and the event insert succeed or fail together.
   *
   * @param tx - Database transaction
   * @param userId - User ID
   */
  async updateUserLastSignInWithTransaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: NodePgDatabase<any>,
    userId: number
  ): Promise<void> {
    const { IdentityProvider } = await import('@package/db-core');

    // Find identity by provider and user ID
    const identity = await this.userIdentityRepository.findByProviderAndUid(
      IdentityProvider.EMAIL_PASSWORD,
      String(userId)
    );

    if (!identity) {
      this.logger.warn('Email/password identity not found for user');
      return; // Don't throw - login should succeed even if this fails
    }

    // Update last sign-in timestamp within the provided transaction
    await this.userIdentityRepository.updateLastSignInWithTransaction(tx, identity.id);
    this.logger.debug('Last sign-in updated successfully within transaction');
  }

  /**
   * Build user info response
   *
   * @param user - Database user entity
   * @param gcpUserInfo - User info from GCP Identity Platform token
   * @param gcpTenantId - GCP tenant ID (if using multi-tenant)
   * @param roles - User roles from database (overrides GCP claims for immediate availability)
   * @param permissions - User permissions from database (overrides GCP claims)
   * @returns Combined user info
   *
   * NOTE: The tenantId returned here is the organization.id (not tenants.id).
   * This is intentional as the entire codebase uses organizationId for tenant scoping.
   * The TenantResolutionService has been updated to look up by organization.id.
   *
   * NOTE: Roles and permissions from database override GCP custom claims because
   * Firebase custom claims can take up to 1 hour to propagate. Using database values
   * ensures immediate availability after registration/role changes.
   */
  private buildUserInfo(
    user: User,
    gcpUserInfo: UserInfo,
    gcpTenantId: string | null,
    roles: string[] = [],
    permissions: string[] = []
  ): UserInfo {
    return {
      userId: `${user.id}`,
      email: gcpUserInfo.email ?? '', // Use email from GCP token
      name: gcpUserInfo.name ?? user.displayName ?? '',
      emailVerified: gcpUserInfo.emailVerified ?? false,
      // Use database roles/permissions (immediate, no Firebase propagation delay)
      roles,
      permissions,
      tenantId: `${user.organizationId}`,
      attributes: {
        ...gcpUserInfo.attributes,
        createdAt: user.createdAt?.toISOString(),
        organizationId: `${user.organizationId}`,
        gcpTenantId: gcpTenantId ?? null
      }
    };
  }

  /**
   * Authenticate with OAuth provider
   *
   * Uses GCP Identity Platform for OAuth token validation
   */
  async authenticateWithOAuth(
    tenantId: string,
    provider: string,
    idToken: string,
    accessToken?: string
  ): Promise<{
    authResult: AuthResult;
    userInfo: UserInfo;
    isNewUser: boolean;
    profile: ProviderProfile;
  }> {
    this.logger.debug(`Authenticating with OAuth provider: ${provider}`);

    // Step 1: Validate OAuth token and get user info
    const gcpUserInfo = await this.validateOAuthToken(provider, idToken);

    // Step 2: Build provider profile
    const profile = this.buildProviderProfile(provider, gcpUserInfo);

    // Step 3: Handle existing or new user
    const existingIdentity = await this.userIdentityRepository.findByProviderAndUid(
      provider,
      profile.providerUid
    );

    const { userInfo, isNewUser } = existingIdentity
      ? await this.handleExistingOAuthUser(
          tenantId,
          existingIdentity.id,
          existingIdentity.userId,
          gcpUserInfo,
          profile
        )
      : await this.handleNewOAuthUser(tenantId, provider, gcpUserInfo, profile);

    // Step 4: Build auth result
    const authResult = this.buildAuthResult(idToken, accessToken);

    return { authResult, userInfo, isNewUser, profile };
  }

  /**
   * Validate OAuth token and get user info
   */
  private async validateOAuthToken(_provider: string, idToken: string): Promise<UserInfo> {
    try {
      return await this.getProvider().getUserInfoFromToken(idToken);
    } catch {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID,
        message: 'Invalid OAuth token'
      });
    }
  }

  /**
   * Build provider profile from GCP user info
   */
  private buildProviderProfile(provider: string, gcpUserInfo: UserInfo): ProviderProfile {
    return {
      provider,
      providerUid: gcpUserInfo.userId,
      ...(gcpUserInfo.name !== undefined && { displayName: gcpUserInfo.name }),
      ...(gcpUserInfo.username !== undefined && { displayName: gcpUserInfo.username }),
      ...(gcpUserInfo.email !== undefined && { email: gcpUserInfo.email }),
      emailVerified: gcpUserInfo.emailVerified ?? false,
      ...(gcpUserInfo.attributes?.['photoURL'] !== undefined && {
        photoUrl: gcpUserInfo.attributes['photoURL'] as string
      })
    };
  }

  /**
   * Handle existing OAuth user login
   */
  private async handleExistingOAuthUser(
    tenantId: string,
    identityId: number,
    userId: number,
    gcpUserInfo: UserInfo,
    profile: ProviderProfile
  ): Promise<{ userInfo: UserInfo; isNewUser: boolean }> {
    const user = await this.authRepository.findById(tenantId, userId);
    if (!user) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.ACCOUNT_NOT_FOUND,
        message: 'User account not found'
      });
    }

    await this.userIdentityRepository.updateLastSignIn(identityId);

    // Fetch roles and permissions from database (immediate, no Firebase delay)
    const dbRoles = await this.cachedRoleService.getUserRoles(
      user.id,
      user.organizationId ?? undefined
    );
    const dbPermissions = await this.cachedPermissionService.getUserPermissions(
      user.id,
      user.organizationId ?? undefined
    );

    const userInfo: UserInfo = {
      userId: `${user.id}`,
      email: profile.email ?? '',
      name: user.displayName ?? profile.displayName ?? '',
      emailVerified: (user.isVerified || profile.emailVerified) ?? false,
      roles: dbRoles, // Use database roles (immediate, no Firebase propagation delay)
      permissions: dbPermissions, // Use database permissions
      tenantId,
      attributes: {
        ...gcpUserInfo.attributes,
        createdAt: user.createdAt?.toISOString(),
        organizationId: `${user.organizationId}`
      }
    };

    return { userInfo, isNewUser: false };
  }

  /**
   * Handle new OAuth user registration
   */
  private async handleNewOAuthUser(
    tenantId: string,
    provider: string,
    gcpUserInfo: UserInfo,
    profile: ProviderProfile
  ): Promise<{ userInfo: UserInfo; isNewUser: boolean }> {
    // OAuth providers MUST provide email - we don't support phone-only OAuth flows
    if (!profile.email?.trim()) {
      throw new Error(
        `OAuth provider ${provider} did not provide email. Phone-only OAuth flows are not supported.`
      );
    }

    const fallbackDisplayName = profile.displayName ?? profile.email.split('@')[0];
    const { firstName, lastName } = this.extractNameParts(fallbackDisplayName, profile.email);
    const newUser = await this.authRepository.createWithEmail(tenantId, profile.email, {
      displayName: fallbackDisplayName,
      isVerified: profile.emailVerified,
      firstNameEncrypted: firstName,
      lastNameEncrypted: lastName
    });

    if (!newUser) {
      throw new Error('Failed to create user during OAuth registration');
    }

    await this.userIdentityRepository.createWithUserId({
      userId: newUser.id,
      provider,
      providerUid: profile.providerUid,
      providerEmail: profile.email,
      phoneNumber: profile.phoneNumber,
      displayName: fallbackDisplayName, // Use fallbackDisplayName consistently
      photoUrl: profile.photoUrl,
      emailVerified: profile.emailVerified,
      isPrimary: true
    });

    // Fetch roles and permissions from database (immediate, no Firebase delay)
    // Note: New OAuth users may not have roles yet, so empty arrays are expected
    const dbRoles = await this.cachedRoleService.getUserRoles(
      newUser.id,
      newUser.organizationId ?? undefined
    );
    const dbPermissions = await this.cachedPermissionService.getUserPermissions(
      newUser.id,
      newUser.organizationId ?? undefined
    );

    const userInfo: UserInfo = {
      userId: `${newUser.id}`,
      email: profile.email, // Already validated as non-empty above
      name: fallbackDisplayName, // Use fallbackDisplayName consistently
      emailVerified: profile.emailVerified ?? false,
      roles: dbRoles, // Use database roles (immediate, no Firebase propagation delay)
      permissions: dbPermissions, // Use database permissions
      tenantId,
      attributes: {
        ...gcpUserInfo.attributes,
        createdAt: newUser.createdAt?.toISOString(),
        organizationId: `${newUser.organizationId ?? 0}`
      }
    };

    return { userInfo, isNewUser: true };
  }

  /**
   * Build auth result from OAuth tokens
   */
  private buildAuthResult(idToken: string, _accessToken?: string): AuthResult {
    return {
      // Standardize on ID token for backend authorization headers.
      accessToken: idToken,
      refreshToken: '', // OAuth tokens from GCP don't include refresh tokens by default
      idToken,
      expiresIn: 3600,
      refreshExpiresIn: 0
    };
  }

  /**
   * Authenticate with phone number
   *
   * Uses GCP Identity Platform for phone authentication
   * Note: GCP Identity Platform supports phone auth via Firebase Auth
   */
  async authenticateWithPhone(
    _tenantId: string,
    _phoneNumber: string,
    _verificationCode: string
  ): Promise<{ authResult: AuthResult; userInfo: UserInfo; isNewUser: boolean }> {
    // NOTE: GCP Identity Platform supports phone authentication via Firebase Auth
    // However, the IAuthProvider interface doesn't have a dedicated phone auth method
    // This would typically use Firebase's signInWithPhoneNumber method
    //
    // For now, we'll throw an error indicating this needs to be implemented
    // via direct Firebase Admin SDK calls or a custom provider method
    //
    // TODO: Implement phone auth via Firebase Admin SDK's phone auth methods
    // Reference: https://firebase.google.com/docs/auth/web/phone-auth

    throw new BadRequestException({
      code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
      message: 'Phone authentication is not yet implemented. Please use email/password or OAuth.'
    });

    /* Future implementation:
    // Step 1: Verify phone code with GCP
    const gcpAuthResult = await this.authProvider.authenticate({
      username: phoneNumber,
      password: verificationCode, // Using verification code as "password"
      tenantId,
    });

    // Step 2: Get user info from token
    const gcpUserInfo = await this.authProvider.getUserInfoFromToken(gcpAuthResult.idToken);

    // Step 3: Sync to local DB (similar to email/password flow)
    // ...
    */
  }

  /**
   * Register a new user with email/password SYNCHRONOUSLY
   *
   * EVERYTHING happens in ONE TRANSACTION:
   * 1. Provision GCP tenant (if new organization)
   * 2. Create organization in DB with gcpTenantId
   * 3. Provision GCP user in tenant
   * 4. Create user in DB
   * 5. Create user identity with actual GCP UID
   *
   * If ANY step fails, ENTIRE transaction rolls back (including GCP resources).
   * User can login IMMEDIATELY after successful registration.
   *
   * @returns User entity, tenant ID, and flag indicating if new organization was created
   */
  async registerWithEmailPassword(
    tenantId: string | undefined,
    email: string,
    password: string,
    displayName?: string,
    organizationName?: string,
    isVerified?: boolean,
    isActive?: boolean,
    organizationSlug?: string,
    trace: AuditTraceContext = {}
  ): Promise<{
    user: User;
    tenantId: string;
    isNewOrganization: boolean;
    gcpTenantId: string | null;
  }> {
    // Step 0: Check if user already exists
    await this.checkUserExists(tenantId, email);

    // Step 1: Get or create organization with GCP tenant
    const { effectiveTenantId, tenantIdForRole, isNewOrganization, gcpTenantId } =
      await this.getOrCreateOrganization(
        tenantId,
        email,
        displayName,
        organizationName,
        organizationSlug
      );

    // Step 2: Provision GCP user synchronously
    const gcpUid = await this.provisionUserInGcp(
      email,
      password,
      displayName,
      gcpTenantId,
      isNewOrganization
    );

    // Step 3: Create user in database with actual GCP UID
    const user = await this.createUserInDatabase(
      effectiveTenantId,
      tenantIdForRole,
      email,
      displayName,
      isVerified,
      isActive,
      gcpUid,
      isNewOrganization,
      gcpTenantId,
      trace
    );

    return { user, tenantId: effectiveTenantId, isNewOrganization, gcpTenantId };
  }

  async bootstrapInstallFirstSystemOwner(
    params: BootstrapInstallParams,
    trace: AuditTraceContext = {}
  ): Promise<{ user: User; tenantId: string; organizationId: string }> {
    await this.checkUserExists(undefined, params.email);

    const gcpTenantId = await this.provisionGcpTenantSync(params.organizationName);
    let gcpUid: string | null = null;

    try {
      gcpUid = await this.provisionGcpUserSync(
        params.email,
        params.password,
        params.displayName,
        gcpTenantId
      );
      const ensuredGcpUid = gcpUid;

      const result = await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(${AuthService.BOOTSTRAP_INSTALL_ADVISORY_LOCK_KEY})`
        );

        await this.checkUserExists(undefined, params.email);

        const systemOwnerExistsBeforeWrite = await this.authRepository.hasActiveSystemOwner(tx);
        if (systemOwnerExistsBeforeWrite) {
          throw new ConflictException({
            code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            message: 'Bootstrap installation is no longer available.'
          });
        }

        const { organizationId, tenantId } =
          await this.authRepository.createOrganizationForUserInTransaction(
            tx,
            params.email,
            params.organizationName,
            gcpTenantId,
            params.organizationSlug,
            'organization'
          );

        const user = await this.authRepository.createWithEmailInTransaction(
          `${organizationId}`,
          tx,
          params.email,
          {
            displayName: params.displayName,
            isVerified: true,
            isActive: true,
            firstNameEncrypted:
              AuthService.normalizeSensitiveNamePart(params.firstName) ??
              this.extractNameParts(params.displayName, params.email).firstName,
            lastNameEncrypted:
              AuthService.normalizeSensitiveNamePart(params.lastName) ??
              this.extractNameParts(params.displayName, params.email).lastName
          }
        );

        const { IdentityProvider } = await import('@package/db-core');

        await this.userIdentityRepository.createWithTransaction(tx, {
          userId: user.id,
          provider: IdentityProvider.EMAIL_PASSWORD,
          providerUid: ensuredGcpUid,
          providerEmail: params.email,
          displayName: params.displayName,
          emailVerified: true,
          isPrimary: true
        });

        await this.authRepository.setOrganizationOwnerInTransaction(tx, organizationId, user.id);
        await this.roleService.assignTenantRoleInTransaction(
          tx,
          user.id,
          tenantId,
          TENANT_ROLE.OWNER,
          true
        );
        await this.roleService.assignSystemRoleInTransaction(tx, user.id, SYSTEM_ROLE.OWNER, null);

        const systemOwnerExistsBeforeCommit = await this.authRepository.hasActiveSystemOwner(tx);
        if (!systemOwnerExistsBeforeCommit) {
          throw new ConflictException({
            code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
            message: 'Bootstrap installation failed to create the initial system owner.'
          });
        }

        await this.outboxRepo.insert(tx, {
          eventId: randomUUID(),
          eventType: 'organization.owner.assigned',
          aggregateId: `${organizationId}`,
          aggregateVersion: '1',
          payload: {
            tenantId: `${tenantId}`,
            organizationId: `${organizationId}`,
            userId: String(user.id),
            actorId: undefined,
            isNewOrganization: true,
            timestamp: new Date().toISOString()
          },
          correlationId: trace.correlationId,
          causationId: trace.causationId,
          tenantId: `${organizationId}`,
          schemaVersion: AuthEventSchemaVersion.V1_0
        });

        await this.outboxRepo.insert(
          tx,
          buildAuthAuditEvent({
            eventType: 'bootstrap.install.completed.audit',
            tenantId: PUBLIC_AUTH_TENANT_ID,
            requestId: trace.requestId,
            aggregateId: 'bootstrap',
            action: 'COMPLETE_BOOTSTRAP_INSTALL',
            target: {
              entityType: 'system_owner',
              entityId: String(user.id)
            },
            details: {
              organizationId: `${organizationId}`,
              tenantId: `${tenantId}`,
              organizationSlug: params.organizationSlug,
              emailHash: this.hashEmailHelper(params.email)
            },
            correlationId: trace.correlationId,
            causationId: trace.causationId
          })
        );

        return {
          user,
          tenantId: `${tenantId}`,
          organizationId: `${organizationId}`
        };
      });

      await this.setUserCustomClaims(gcpUid, result.organizationId, result.user.id, gcpTenantId);
      await this.cachedPermissionService.invalidateAllPermissions(result.user.id);
      await this.cachedRoleService.invalidateAllRoles(result.user.id);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Bootstrap installation failed: ${errorMessage}`, error);
      if (gcpUid) {
        await this.rollbackGcpUser(gcpUid, gcpTenantId);
      }
      await this.rollbackGcpTenant(gcpTenantId);
      throw error;
    }
  }

  /**
   * Find active user by email within a tenant.
   * Used to make invitation registration idempotent when the account already exists.
   */
  async findActiveUserByEmailInTenant(tenantId: string, email: string): Promise<User | null> {
    const user = await this.authRepository.findByEmail(tenantId, email);
    return (user as User | null) ?? null;
  }

  /**
   * Find active user by email across all tenants.
   */
  async findActiveUserByEmailGlobally(email: string): Promise<User | null> {
    const user = await this.authRepository.findByEmail(undefined, email);
    return (user as User | null) ?? null;
  }

  /**
   * Ensure an existing invited account is active and verified before login.
   */
  async activateAndVerifyExistingUserForInvitation(
    tenantId: string,
    userId: number
  ): Promise<User> {
    return this.db.transaction(async (tx) => {
      const updatedUser = await this.authRepository.activateAndVerifyUser(tenantId, userId, tx);
      await this.userIdentityRepository.markPrimaryEmailVerified(userId, tx);
      return updatedUser as User;
    });
  }

  /**
   * Check if user already exists
   */
  private async checkUserExists(tenantId: string | undefined, email: string): Promise<void> {
    const existingCheck = await this.authRepository.findByEmail(undefined, email);
    if (existingCheck && (!tenantId || `${existingCheck.organizationId}` === tenantId)) {
      throw new ConflictException({
        code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
        message: 'An account with this email address already exists'
      });
    }
  }

  private static normalizeSensitiveNamePart(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Get or create organization with GCP tenant
   *
   * NOTE: Returns organization.id as effectiveTenantId (not tenants.id).
   * This is intentional as the entire codebase uses organizationId for tenant scoping.
   * The TenantResolutionService has been updated to look up by organization.id.
   */
  private async getOrCreateOrganization(
    tenantId: string | undefined,
    email: string,
    displayName?: string,
    organizationName?: string,
    organizationSlug?: string
  ): Promise<{
    effectiveTenantId: string;
    tenantIdForRole: string | null;
    isNewOrganization: boolean;
    gcpTenantId: string | null;
  }> {
    if (tenantId) {
      // Existing organization - fetch by organization ID to ensure correct GCP tenant mapping
      const organizationId = Number(tenantId);
      const org =
        Number.isInteger(organizationId) && organizationId > 0
          ? await this.authRepository.findOrganizationById(organizationId)
          : null;
      return {
        effectiveTenantId: tenantId,
        tenantIdForRole: org?.tenantId ? `${org.tenantId}` : null,
        isNewOrganization: false,
        gcpTenantId: org?.gcpTenantId ?? null
      };
    }

    // Create new organization with GCP tenant
    const emailHash = this.hashEmailHelper(email);
    const lockKey = `lock:register:${emailHash}`;

    const result = await this.cache.withLock(
      lockKey,
      async () =>
        this.createOrganizationWithLock(email, displayName, organizationName, organizationSlug),
      {
        timeout: 30,
        expiry: 60,
        retryInterval: 100
      }
    );

    if (!result) {
      throw new ConflictException({
        code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        message: 'Too many registration attempts. Please try again in a few seconds.'
      });
    }

    return {
      effectiveTenantId: `${result.organizationId}`,
      tenantIdForRole: result.tenantId ? `${result.tenantId}` : null,
      isNewOrganization: result.created,
      gcpTenantId: result.gcpTenantId
    };
  }

  /**
   * Create organization within distributed lock
   */
  private async createOrganizationWithLock(
    email: string,
    displayName?: string,
    organizationName?: string,
    organizationSlug?: string
  ): Promise<{
    created: boolean;
    organizationId: number;
    tenantId: number | null;
    gcpTenantId: string | null;
  }> {
    // Double-check: Another request might have created the organization
    const existingUser = await this.authRepository.findByEmail(undefined, email);
    if (existingUser) {
      return {
        created: false,
        organizationId: existingUser.organizationId ?? 0,
        tenantId: null,
        gcpTenantId: null
      };
    }

    const provider = this.getProvider();
    const gcpTenantId = this.supportsFirebaseAuth(provider)
      ? await this.provisionGcpTenantSync(
          organizationName ?? displayName ?? `${email.split('@')[0]}'s Organization`
        )
      : null;

    // Create organization with GCP tenant ID
    const { organizationId, tenantId } = await this.authRepository.createOrganizationForUser(
      email,
      organizationName ?? displayName,
      gcpTenantId ?? undefined,
      organizationSlug
    );

    return { created: true, organizationId, tenantId, gcpTenantId };
  }

  /**
   * Provision user in GCP synchronously
   */
  private async provisionUserInGcp(
    email: string,
    password: string,
    displayName: string | undefined,
    gcpTenantId: string | null,
    isNewOrganization: boolean
  ): Promise<string> {
    try {
      const provider = this.getProvider();

      if (!this.supportsFirebaseAuth(provider)) {
        return this.buildLocalProviderUid(email);
      }

      const defaultDisplayName = email.split('@')[0];
      if (defaultDisplayName === undefined) {
        throw new Error('Invalid email format');
      }
      return await this.provisionGcpUserSync(
        email,
        password,
        displayName ?? defaultDisplayName,
        gcpTenantId
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to provision GCP user: ${errorMessage}`);

      // Rollback GCP tenant if new organization
      if (isNewOrganization && gcpTenantId) {
        await this.rollbackGcpTenant(gcpTenantId);
      }

      throw error;
    }
  }

  private supportsFirebaseAuth(
    provider: IAuthProvider
  ): provider is IAuthProvider & { firebaseAuth: NonNullable<unknown> } {
    return (
      'firebaseAuth' in provider &&
      typeof (provider as { firebaseAuth?: unknown }).firebaseAuth !== 'undefined'
    );
  }

  private buildLocalProviderUid(email: string): string {
    return `custom-jwt:${this.hashEmailHelper(email)}`;
  }

  /**
   * Create user in database with GCP UID
   *
   * @param effectiveTenantId - Organization ID (used as tenant ID in the codebase)
   * @param tenantIdForRole - Actual tenant ID from tenants table (for user_tenants role assignment)
   * @param email - User email
   * @param displayName - User display name
   * @param isVerified - Email verification status
   * @param isActive - Account active status
   * @param gcpUid - GCP user UID
   * @param isNewOrganization - Whether this is a new organization registration
   * @param gcpTenantId - GCP tenant ID
   */
  private async createUserInDatabase(
    effectiveTenantId: string,
    tenantIdForRole: string | null,
    email: string,
    displayName: string | undefined,
    isVerified: boolean | undefined,
    isActive: boolean | undefined,
    gcpUid: string,
    isNewOrganization: boolean,
    gcpTenantId: string | null,
    trace: AuditTraceContext = {}
  ): Promise<User> {
    try {
      return await this.db.transaction(async (tx) => {
        const { firstName, lastName } = this.extractNameParts(displayName, email);
        const user = await this.authRepository.createWithEmailInTransaction(
          effectiveTenantId,
          tx,
          email,
          {
            displayName: displayName ?? email.split('@')[0],
            isVerified: isVerified ?? true,
            isActive: isActive ?? true,
            firstNameEncrypted: firstName,
            lastNameEncrypted: lastName
          }
        );

        if (!user) {
          throw new Error('Failed to create user during registration');
        }

        const { IdentityProvider } = await import('@package/db-core');

        await this.userIdentityRepository.createWithTransaction(tx, {
          userId: user.id,
          provider: IdentityProvider.EMAIL_PASSWORD,
          providerUid: gcpUid,
          providerEmail: email,
          displayName: displayName ?? email.split('@')[0],
          emailVerified: isVerified ?? true,
          isPrimary: true
        });

        // Set owner for new organizations
        if (isNewOrganization) {
          await this.authRepository.setOrganizationOwnerInTransaction(
            tx,
            Number(effectiveTenantId),
            user.id
          );

          // Validate tenantIdForRole is provided for new organizations
          if (!tenantIdForRole) {
            throw new BadRequestException({
              code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
              message: 'tenantId is required for role assignment in new organizations'
            });
          }

          // Assign tenant_owner role in user_tenants table
          await this.roleService.assignTenantRoleInTransaction(
            tx,
            user.id,
            Number(tenantIdForRole),
            TENANT_ROLE.OWNER,
            true // isDefault
          );

          // Publish owner assigned event to outbox for audit logging
          await this.outboxRepo.insert(tx, {
            eventId: randomUUID(),
            eventType: 'organization.owner.assigned',
            aggregateId: effectiveTenantId,
            aggregateVersion: '1',
            payload: {
              tenantId: tenantIdForRole,
              organizationId: effectiveTenantId,
              userId: String(user.id),
              actorId: undefined, // System operation during registration
              isNewOrganization: true,
              timestamp: new Date().toISOString()
            },
            correlationId: trace.correlationId,
            causationId: trace.causationId,
            tenantId: effectiveTenantId,
            schemaVersion: AuthEventSchemaVersion.V1_0
          });
        }

        await this.outboxRepo.insert(
          tx,
          buildAuthAuditEvent({
            eventType: 'auth.registration.completed.audit',
            tenantId: effectiveTenantId,
            actorId: String(user.id),
            requestId: trace.requestId,
            aggregateId: String(user.id),
            action: 'REGISTER_ACCOUNT',
            target: {
              entityType: 'user',
              entityId: String(user.id)
            },
            details: {
              identityProvider: AUTH_PROVIDERS.EMAIL_PASSWORD,
              organizationCreated: isNewOrganization,
              gcpTenantProvisioned: Boolean(gcpTenantId),
              emailVerified: isVerified ?? true,
              accountActive: isActive ?? true
            },
            correlationId: trace.correlationId,
            causationId: trace.causationId
          })
        );

        // Set custom claims on GCP user AFTER successful database transaction
        await this.setUserCustomClaims(gcpUid, effectiveTenantId, user.id, gcpTenantId);

        // Invalidate permissions cache for new organization owners
        // This must happen AFTER transaction commits to ensure consistency
        if (isNewOrganization && tenantIdForRole) {
          await this.cachedPermissionService.invalidatePermissions(
            user.id,
            Number(tenantIdForRole)
          );
        }

        // Note: Custom claims may take up to 1 hour to propagate in Firebase
        // The subsequent login call will retry token refresh with claims if needed
        return user;
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Database transaction failed during user creation: ${errorMessage}`);

      // Rollback GCP resources
      await this.rollbackGcpUser(gcpUid, gcpTenantId);
      if (isNewOrganization && gcpTenantId) {
        await this.rollbackGcpTenant(gcpTenantId);
      }

      throw error;
    }
  }

  /**
   * Rollback GCP tenant
   */
  private async rollbackGcpTenant(gcpTenantId: string): Promise<void> {
    try {
      await this.deleteGcpTenantSync(gcpTenantId);
      this.logger.debug('Rolled back GCP tenant');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to rollback GCP tenant: ${errorMessage}`);
    }
  }

  /**
   * Rollback GCP user
   */
  private async rollbackGcpUser(gcpUid: string, gcpTenantId: string | null): Promise<void> {
    try {
      await this.deleteGcpUserSync(gcpUid, gcpTenantId);
      this.logger.debug('Rolled back GCP user');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to rollback GCP user: ${errorMessage}`);
    }
  }

  /**
   * Sanitize display name for GCP tenant creation
   *
   * GCP requirements:
   * - Must start with a letter
   * - Only letters, digits, and hyphens
   * - Length: 4-20 characters
   *
   * @param displayName - Raw display name (e.g., "MiviaLabs LLC")
   * @returns Sanitized name (e.g., "MiviaLabs")
   */
  private sanitizeGcpDisplayName(displayName: string): string {
    // Remove all characters except letters, digits, and hyphens
    let sanitized = displayName.replace(/[^a-zA-Z0-9-]/g, '');

    // Ensure starts with a letter
    sanitized = sanitized.replace(/^[^a-zA-Z]+/, '');

    // Truncate to 20 characters max
    sanitized = sanitized.slice(0, 20);

    // If too short after sanitization, pad with default
    if (sanitized.length < 4) {
      sanitized = 'Org-' + Date.now().toString().slice(-4);
    }

    return sanitized;
  }

  /**
   * Provision GCP tenant synchronously
   *
   * @param displayName - Tenant display name
   * @returns GCP tenant ID
   */
  private async provisionGcpTenantSync(displayName: string): Promise<string> {
    try {
      const provider = this.getProvider();

      if (
        !('firebaseAuth' in provider) ||
        typeof (provider as { firebaseAuth?: unknown }).firebaseAuth === 'undefined'
      ) {
        throw new BadRequestException({
          code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
          message: 'Provider does not support tenant management'
        });
      }

      const googleProvider = provider as {
        firebaseAuth: {
          tenantManager: () => {
            createTenant: (config: Record<string, unknown>) => Promise<{ tenantId: string }>;
          };
        };
      };

      // Sanitize display name to meet GCP requirements
      const sanitizedDisplayName = this.sanitizeGcpDisplayName(displayName);

      this.logger.debug(
        `Creating GCP tenant with sanitized display name: "${sanitizedDisplayName}" (original: "${displayName}")`
      );

      const tenantManager = googleProvider.firebaseAuth.tenantManager();
      const tenant = await tenantManager.createTenant({
        displayName: sanitizedDisplayName,
        emailSignInConfig: {
          enabled: true,
          passwordRequired: true
        }
      });

      return tenant.tenantId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to provision GCP tenant: ${errorMessage}`);
      // Re-throw if it's already a proper exception
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
        message: `GCP tenant provisioning failed: ${errorMessage}`
      });
    }
  }

  /**
   * Provision GCP user synchronously
   *
   * @param email - User email
   * @param password - User password
   * @param displayName - User display name
   * @param gcpTenantId - GCP tenant ID (optional)
   * @returns GCP user UID
   */
  private async provisionGcpUserSync(
    email: string,
    password: string,
    displayName: string,
    gcpTenantId: string | null
  ): Promise<string> {
    try {
      const provider = this.getProvider();

      if (
        !('firebaseAuth' in provider) ||
        typeof (provider as { firebaseAuth?: unknown }).firebaseAuth === 'undefined'
      ) {
        throw new BadRequestException({
          code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
          message: 'Provider does not support Firebase Auth'
        });
      }

      const googleProvider = provider as {
        firebaseAuth: {
          tenantManager: () => {
            authForTenant: (tenantId: string) => {
              createUser: (data: unknown) => Promise<{ uid: string }>;
            };
          };
          createUser: (data: unknown) => Promise<{ uid: string }>;
        };
      };

      const userData = {
        email,
        password,
        displayName,
        emailVerified: false,
        disabled: false
      };

      let userRecord: { uid: string };

      if (gcpTenantId) {
        const tenantAuth = googleProvider.firebaseAuth.tenantManager().authForTenant(gcpTenantId);
        userRecord = await tenantAuth.createUser(userData);
      } else {
        userRecord = await googleProvider.firebaseAuth.createUser(userData);
      }

      return userRecord.uid;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to provision GCP user: ${errorMessage}`);

      // Re-throw if it's already a proper exception
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }

      // Check for email already in use error from Firebase/GCP
      // Firebase error codes: auth/email-already-exists, auth/email-already-in-use
      // Error message patterns: "email address is already in use", "email already exists"
      const isEmailAlreadyInUse =
        errorMessage.toLowerCase().includes('email') &&
        (errorMessage.toLowerCase().includes('already in use') ||
          errorMessage.toLowerCase().includes('already exists'));

      if (isEmailAlreadyInUse) {
        throw new ConflictException({
          code: AUTH_ERROR_CODES.EMAIL_ALREADY_EXISTS,
          message: 'An account with this email address already exists'
        });
      }

      throw new BadRequestException({
        code: AUTH_ERROR_CODES.PROVIDER_NOT_SUPPORTED,
        message: `GCP user provisioning failed: ${errorMessage}`
      });
    }
  }

  /**
   * Delete GCP tenant synchronously (for rollback)
   *
   * @param gcpTenantId - GCP tenant ID
   */
  private async deleteGcpTenantSync(gcpTenantId: string): Promise<void> {
    const provider = this.getProvider();

    if (
      !('firebaseAuth' in provider) ||
      typeof (provider as { firebaseAuth?: unknown }).firebaseAuth === 'undefined'
    ) {
      return;
    }

    const googleProvider = provider as {
      firebaseAuth: {
        tenantManager: () => {
          deleteTenant: (tenantId: string) => Promise<void>;
        };
      };
    };

    const tenantManager = googleProvider.firebaseAuth.tenantManager();
    await tenantManager.deleteTenant(gcpTenantId);
  }

  /**
   * Delete GCP user synchronously (for rollback)
   *
   * @param gcpUid - GCP user UID
   * @param gcpTenantId - GCP tenant ID (optional)
   */
  private async deleteGcpUserSync(gcpUid: string, gcpTenantId: string | null): Promise<void> {
    const provider = this.getProvider();

    if (
      !('firebaseAuth' in provider) ||
      typeof (provider as { firebaseAuth?: unknown }).firebaseAuth === 'undefined'
    ) {
      return;
    }

    const googleProvider = provider as {
      firebaseAuth: {
        tenantManager: () => {
          authForTenant: (tenantId: string) => {
            deleteUser: (uid: string) => Promise<void>;
          };
        };
        deleteUser: (uid: string) => Promise<void>;
      };
    };

    if (gcpTenantId) {
      const tenantAuth = googleProvider.firebaseAuth.tenantManager().authForTenant(gcpTenantId);
      await tenantAuth.deleteUser(gcpUid);
    } else {
      await googleProvider.firebaseAuth.deleteUser(gcpUid);
    }
  }

  /**
   * Ensure custom claims are set for user
   *
   * Checks if custom claims exist, and sets them if missing (for existing users)
   * This is called during login to ensure all users have the required claims
   *
   * @returns true if claims were just set, false if they already existed
   */
  private async ensureCustomClaims(
    gcpUid: string,
    tenantId: string,
    userId: number,
    gcpTenantId: string | null
  ): Promise<boolean> {
    try {
      const provider = this.getProvider();

      // Check if provider supports checking claims
      if (
        !('firebaseAuth' in provider) ||
        typeof (provider as { firebaseAuth?: unknown }).firebaseAuth === 'undefined'
      ) {
        return false;
      }

      const googleProvider = provider as {
        firebaseAuth: {
          tenantManager: () => {
            authForTenant: (tenantId: string) => {
              getUser: (uid: string) => Promise<{ customClaims?: Record<string, unknown> }>;
            };
          };
          getUser: (uid: string) => Promise<{ customClaims?: Record<string, unknown> }>;
        };
      };

      // Get user record to check custom claims
      let userRecord: { customClaims?: Record<string, unknown> };
      if (gcpTenantId) {
        const tenantAuth = googleProvider.firebaseAuth.tenantManager().authForTenant(gcpTenantId);
        userRecord = await tenantAuth.getUser(gcpUid);
      } else {
        userRecord = await googleProvider.firebaseAuth.getUser(gcpUid);
      }

      const currentClaims = userRecord.customClaims ?? {};
      const currentRoles = Array.isArray(currentClaims['roles'])
        ? (currentClaims['roles'] as unknown[]).map((role) => String(role)).sort()
        : [];

      const systemRoles = await this.roleService.getSystemRoles(userId);
      const tenantRole = await this.roleService.getTenantRole(userId, parseInt(tenantId, 10));
      const expectedRoles = [...systemRoles, ...(tenantRole ? [tenantRole] : [])].sort();

      // Check for db_user_id (not user_id, which is reserved by Firebase) and stale role claims.
      const hasClaimsSet =
        'tenant_id' in currentClaims &&
        'db_user_id' in currentClaims &&
        String(currentClaims['tenant_id']) === tenantId &&
        String(currentClaims['db_user_id']) === String(userId) &&
        currentRoles.join(',') === expectedRoles.join(',');

      if (!hasClaimsSet) {
        this.logger.debug(`Custom claims missing or stale for user ${gcpUid}, setting them now`);
        await this.setUserCustomClaims(gcpUid, tenantId, userId, gcpTenantId);
        return true; // Claims were just set
      }

      return false; // Claims already existed
    } catch (error) {
      // Log but don't throw - login should succeed even if claims check/set fails
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to ensure custom claims for user ${gcpUid}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Set custom claims on GCP user
   *
   * Sets tenant_id, user_id, roles, and perm_version as custom claims
   * so they're included in JWT tokens for RBAC
   */
  private async setUserCustomClaims(
    gcpUid: string,
    tenantId: string,
    userId: number,
    gcpTenantId: string | null
  ): Promise<void> {
    try {
      const provider = this.getProvider();

      // Check if this is a Google Identity Platform provider
      if (
        !('firebaseAuth' in provider) ||
        typeof (provider as { firebaseAuth?: unknown }).firebaseAuth === 'undefined'
      ) {
        this.logger.warn('Provider does not support setCustomClaims');
        return;
      }

      const googleProvider = provider as {
        firebaseAuth: {
          tenantManager: () => {
            authForTenant: (tenantId: string) => {
              setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
            };
          };
          setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
        };
      };

      // Fetch user roles from database
      const systemRoles = await this.roleService.getSystemRoles(userId);
      const tenantRole = tenantId
        ? await this.roleService.getTenantRole(userId, parseInt(tenantId, 10))
        : null;

      // Combine roles
      const roles = [...systemRoles];
      if (tenantRole) {
        roles.push(tenantRole);
      }

      // Generate permission version hash for cache invalidation
      const permVersion = this.generatePermissionVersion(roles);

      // NOTE: user_id is a reserved Firebase claim and cannot be overwritten
      // We use db_user_id for the database user ID instead
      const claims = {
        tenant_id: tenantId,
        db_user_id: String(userId), // Database user ID (user_id is reserved by Firebase)
        organization_id: tenantId, // Alias for tenant_id
        roles, // User roles for RBAC
        perm_version: permVersion // Permission version for cache invalidation
      };

      // Use tenant-specific auth if gcpTenantId is provided
      if (gcpTenantId) {
        const tenantAuth = googleProvider.firebaseAuth.tenantManager().authForTenant(gcpTenantId);
        await tenantAuth.setCustomUserClaims(gcpUid, claims);
      } else {
        await googleProvider.firebaseAuth.setCustomUserClaims(gcpUid, claims);
      }

      this.logger.log(
        `Set custom claims for user ${userId} (${gcpUid}): roles=${roles.join(', ')}, perm_version=${permVersion}`
      );
    } catch (error) {
      // Log but don't throw - operation should succeed even if claims fail
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to set custom claims for user ${gcpUid}: ${errorMessage}`);
      // Re-throw to allow caller to handle the error
      throw error;
    }
  }

  /**
   * Generate permission version hash from roles
   *
   * Used for cache invalidation when roles change.
   * Creates a consistent hash based on sorted role names.
   *
   * @param roles - Array of role names
   * @returns Permission version string (e.g., "vYWJjZGVmZ2hpams")
   * @private
   */
  private generatePermissionVersion(roles: string[]): string {
    // Sort roles for consistency
    const sortedRoles = [...roles].sort();
    const roleHash = sortedRoles.join(',');

    // Create base64 hash (first 16 chars for compact token size)
    const hash = Buffer.from(roleHash).toString('base64').slice(0, 16);

    return `v${hash}`;
  }

  /**
   * Invalidate user permissions cache
   *
   * Call this after role changes to force fresh permissions on next request.
   * This ensures that permission changes take effect immediately.
   *
   * @param userId - Database user ID
   * @param tenantId - Optional tenant ID for tenant-scoped permissions
   */
  async invalidateUserPermissions(userId: number, tenantId?: number): Promise<void> {
    await this.cachedPermissionService.invalidateAllPermissions(userId);

    this.logger.log(
      `Invalidated permissions cache for user ${userId}${tenantId ? ` in tenant ${tenantId}` : ''}`
    );
  }

  /**
   * Helper to hash email
   */
  private hashEmailHelper(email: string): string {
    return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }

  /**
   * Extracts first and last name from a display name or email fallback.
   *
   * The method prioritizes the display name if provided and non-empty,
   * otherwise falls back to the email local part (before @).
   *
   * Name splitting logic:
   * - Single word: firstName only, lastName undefined
   * - Two+ words: firstName is first word, lastName is remaining words joined
   *
   * @param displayName - The display name to extract from (optional)
   * @param fallbackEmail - Email to use as fallback if displayName is empty (optional)
   * @returns Object with firstName and lastName, both may be undefined if no name available
   *
   * @example
   * extractNameParts("John Doe") // { firstName: "John", lastName: "Doe" }
   * extractNameParts("John", "user@example.com") // { firstName: "John", lastName: undefined }
   * extractNameParts(undefined, "john.doe@example.com") // { firstName: "john.doe", lastName: undefined }
   * extractNameParts("John William Doe III") // { firstName: "John", lastName: "William Doe III" }
   */
  private extractNameParts(
    displayName: string | undefined,
    fallbackEmail?: string
  ): { firstName: string | undefined; lastName: string | undefined } {
    const displayNameCandidate = displayName?.trim();
    const fallbackNameCandidate = fallbackEmail?.split('@')[0]?.trim();
    const candidateName =
      displayNameCandidate && displayNameCandidate.length > 0
        ? displayNameCandidate
        : fallbackNameCandidate && fallbackNameCandidate.length > 0
          ? fallbackNameCandidate
          : '';
    if (!candidateName) {
      return { firstName: undefined, lastName: undefined };
    }

    const nameParts = candidateName.split(/\s+/).filter((part) => part.length > 0);
    if (nameParts.length === 0) {
      return { firstName: undefined, lastName: undefined };
    }

    const [firstName, ...lastNameParts] = nameParts;
    const lastName = lastNameParts.length > 0 ? lastNameParts.join(' ') : undefined;
    return { firstName, lastName };
  }

  /**
   * Link identity provider to user
   */
  async linkIdentity(
    userId: number,
    tenantId: string,
    provider: string,
    providerUid: string,
    profile: ProviderProfile
  ): Promise<void> {
    // Check if identity is already linked to another user
    const existing = await this.userIdentityRepository.findByProviderAndUid(provider, providerUid);
    if (existing && existing.userId !== userId) {
      throw new ConflictException({
        code: AUTH_ERROR_CODES.IDENTITY_ALREADY_LINKED,
        message: 'This identity is already linked to another account'
      });
    }

    // Check if user already has this provider
    const userHasProvider = await this.userIdentityRepository.userHasProvider(userId, provider);
    if (userHasProvider) {
      throw new ConflictException({
        code: AUTH_ERROR_CODES.IDENTITY_ALREADY_LINKED,
        message: 'You already have this identity provider linked'
      });
    }

    // Verify user exists and belongs to tenant
    const user = await this.authRepository.findById(tenantId, userId);
    if (!user) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.USER_NOT_FOUND,
        message: 'User account not found'
      });
    }

    // Link identity
    await this.userIdentityRepository.createWithUserId({
      userId,
      provider,
      providerUid,
      displayName: profile.displayName,
      photoUrl: profile.photoUrl,
      emailVerified: profile.emailVerified ?? false,
      isPrimary: false
    });
  }

  /**
   * Unlink identity provider from user
   */
  async unlinkIdentity(userId: number, provider: string, providerUid: string): Promise<void> {
    // Get identity
    const identity = await this.userIdentityRepository.findByProviderAndUid(provider, providerUid);

    if (!identity) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.IDENTITY_NOT_FOUND,
        message: 'Identity not found'
      });
    }

    // Verify ownership
    if (identity.userId !== userId) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.USER_NOT_FOUND,
        message: 'This identity does not belong to you'
      });
    }

    // Check if it's the primary identity
    if (identity.isPrimary) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.CANNOT_UNLINK_PRIMARY_IDENTITY,
        message: 'Cannot unlink primary identity'
      });
    }

    // Check if user has other identities
    const count = await this.userIdentityRepository.countByUserId(userId);
    if (count <= 1) {
      throw new BadRequestException({
        code: AUTH_ERROR_CODES.IDENTITY_NOT_FOUND,
        message: 'Cannot unlink the only identity'
      });
    }

    // Unlink
    await this.userIdentityRepository.delete(identity.id);
  }

  /**
   * Refresh access token
   *
   * Rotates app-local session tokens from the stored refresh token state.
   */
  async refreshToken(
    tenantId: string,
    refreshToken: string
  ): Promise<AuthResult & { user?: UserInfo }> {
    const lookupTenantId = tenantId === PUBLIC_AUTH_TENANT_ID ? undefined : tenantId;
    const storedToken = await this.authSessionStore.getRefreshTokenInfo(
      refreshToken,
      lookupTenantId
    );

    if (!storedToken || storedToken.revoked) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID,
        message: 'Invalid or expired refresh token'
      });
    }

    const userId = this.parsePositiveInt(storedToken.userId);
    const resolvedTenantId = this.parsePositiveInt(storedToken.tenantId);

    if (!userId || !resolvedTenantId) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID,
        message: 'Invalid or expired refresh token'
      });
    }

    const [user, organization, systemRoles, tenantRole, permissions] = await Promise.all([
      this.authRepository.findById(String(resolvedTenantId), userId),
      this.authRepository.findOrganizationById(resolvedTenantId),
      this.roleService.getSystemRoles(userId),
      this.roleService.getTenantRole(userId, resolvedTenantId),
      this.cachedPermissionService.getUserPermissions(userId, resolvedTenantId)
    ]);

    if (user?.isActive !== true || organization?.isActive !== true || organization.deletedAt) {
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.USER_NOT_FOUND,
        message: 'User account is inactive or deleted'
      });
    }

    const roles = [...systemRoles, ...(tenantRole ? [tenantRole] : [])];
    const email = (await this.authRepository.decryptEmail(user.emailEncrypted)) ?? '';
    const authResult = await this.buildLocalAuthResult({
      userId: String(user.id),
      email,
      tenantId: String(resolvedTenantId),
      roles,
      permissions,
      name: user.displayName ?? undefined
    });
    await this.authSessionStore.rotateSession({
      tenantId: String(resolvedTenantId),
      userId: String(user.id),
      currentRefreshToken: refreshToken,
      nextRefreshToken: authResult.refreshToken,
      refreshExpiresIn: authResult.refreshExpiresIn,
      accessToken: authResult.accessToken,
      accessTokenExpiresIn: authResult.expiresIn
    });

    return {
      ...authResult,
      user: {
        userId: String(user.id),
        username: email,
        email,
        emailVerified: user.isVerified ?? false,
        roles,
        permissions,
        tenantId: String(resolvedTenantId)
      }
    };
  }

  /**
   * Logout user and invalidate tokens
   *
   * Revokes the current app-local session or falls back to provider logout for provider tokens.
   */
  async logout(
    _userId: number,
    tenantId: string,
    refreshToken: string,
    accessToken?: string
  ): Promise<void> {
    if (!this.isProviderIssuedAccessToken(accessToken)) {
      await this.authSessionStore.revokeRefreshToken(refreshToken, tenantId, accessToken);
      return;
    }

    try {
      await this.getProvider().logout(refreshToken, accessToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Logout error occurred: ${errorMessage}`);
    }
  }

  /**
   * Validate access token
   *
   * Uses GCP Identity Platform for token validation.
   *
   * NOTE: tenantId is not used for token validation because JWT validation
   * is performed globally against the GCP Identity Platform. The token itself
   * contains tenant claims (tenant_id, user_id) that are extracted and returned
   * in the UserInfo. The parameter is kept for API consistency with other
   * auth service methods that accept tenantId.
   */
  async validateToken(_tenantId: string, token: string): Promise<UserInfo> {
    try {
      const providerName = this.getProvider().constructor.name;
      const redisTarget = getPhase0RedisTarget();

      recordPhase0Note('api.auth.validate_token.infrastructure', {
        providerName,
        ...redisTarget
      });

      return await measurePhase0(
        'api.auth.validate_token.total',
        {
          providerName,
          tenantIdPresent: Boolean(_tenantId)
        },
        async () => {
          const isRevoked = await measurePhase0(
            'api.auth.validate_token.revocation_check',
            {
              providerName
            },
            () => this.authSessionStore.isAccessTokenRevoked(token, _tenantId)
          );
          if (isRevoked) {
            throw new UnauthorizedException({
              code: AUTH_ERROR_CODES.TOKEN_INVALID,
              message: 'Token has been revoked'
            });
          }

          const decodedPayload = this.decodeTokenPayload(token);
          const userInfo = this.isFirebaseTokenPayload(decodedPayload)
            ? await (async () => {
                const validationResult = await measurePhase0(
                  'api.auth.validate_token.provider_validate',
                  {
                    providerName
                  },
                  () => this.getProvider().validateToken(token)
                );

                if (!validationResult.valid) {
                  throw new UnauthorizedException({
                    code: AUTH_ERROR_CODES.TOKEN_INVALID,
                    message: validationResult.error ?? 'Invalid token'
                  });
                }

                return await measurePhase0(
                  'api.auth.validate_token.provider_user_info',
                  {
                    providerName
                  },
                  () => this.getProvider().getUserInfoFromToken(token)
                );
              })()
            : (() => {
                const localUserInfo = this.tryValidateLocalAccessToken(token);
                if (!localUserInfo) {
                  throw new UnauthorizedException({
                    code: AUTH_ERROR_CODES.TOKEN_INVALID,
                    message: 'Invalid token'
                  });
                }

                return localUserInfo;
              })();
          const activeUser = await measurePhase0(
            'api.auth.validate_token.assert_principal_active',
            {
              providerName
            },
            () => this.assertUserInfoPrincipalIsActive(userInfo as UserInfo)
          );

          if (!activeUser) {
            return userInfo as UserInfo;
          }

          return {
            ...(userInfo as UserInfo),
            name: activeUser.displayName ?? (userInfo as UserInfo).name,
            displayName: activeUser.displayName ?? undefined,
            tenantId: String(activeUser.organizationId),
            photoUrl: activeUser.photoUrl,
            avatarFileId: activeUser.avatarFileId
          };
        }
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({
        code: AUTH_ERROR_CODES.TOKEN_INVALID,
        message: 'Invalid token'
      });
    }
  }

  /**
   * Get user identities
   */
  async getUserIdentities(userId: number): Promise<unknown[]> {
    return await this.userIdentityRepository.findByUserId(userId);
  }
}
