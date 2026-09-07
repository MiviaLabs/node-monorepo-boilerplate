/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  Inject,
  Optional
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import {
  AUTH_PROVIDER_FACTORY,
  AuthProviderFactory,
  AuthProviderType,
  PermissionService,
  RoleService
} from '@package/auth';

import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthRepository } from '../repositories/auth.repository';
import { OrganizationRepository } from '../repositories/organization.repository';
import { AuthSessionStoreService } from '../services/auth-session-store.service';

import type { CurrentUserData } from '@/common/decorators/current-user.decorator';

/**
 * JWT Authentication Guard
 *
 * Extends NestJS Passport JWT guard with public route support and Firebase token verification.
 *
 * This guard supports two authentication flows:
 * 1. Firebase tokens (GCP Identity Platform) - When issuer contains 'securetoken.google.com'
 * 2. Local JWT tokens - Using JWT_SECRET for verification
 *
 * Firebase tokens are verified using the auth provider's validateToken() method.
 * Local tokens are verified using the JwtService with JWT_SECRET.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private gcpConfigured: boolean | null = null;

  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    @Optional()
    @Inject(AUTH_PROVIDER_FACTORY)
    private authProviderFactory?: AuthProviderFactory,
    @Optional() private readonly authRepository?: AuthRepository,
    @Optional() private readonly organizationRepository?: OrganizationRepository,
    @Optional() private readonly roleService?: RoleService,
    @Optional() private readonly permissionService?: PermissionService,
    @Optional() private readonly authSessionStore?: AuthSessionStoreService
  ) {
    super();
  }

  /**
   * Check if GCP Identity Platform is configured
   *
   * Caches the result for performance
   */
  private isGcpConfigured(): boolean {
    if (this.gcpConfigured !== null) {
      return this.gcpConfigured;
    }

    // Check if auth provider factory is available and has a Google Identity Platform provider
    if (this.authProviderFactory) {
      const provider = this.authProviderFactory.getProvider(
        AuthProviderType.GOOGLE_IDENTITY_PLATFORM
      );
      if (provider) {
        this.gcpConfigured = true;
        this.logger.debug('GCP Identity Platform provider is configured');
        return true;
      }
    }

    // Fallback: Check environment variables
    const hasGcpEnvVars =
      !!process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
      !!process.env['FIREBASE_PROJECT_ID'] ||
      !!process.env['GCP_PROJECT_ID'] ||
      !!process.env['GOOGLE_APPLICATION_CREDENTIALS'];

    this.gcpConfigured = hasGcpEnvVars;
    this.logger.debug(`GCP configured via env vars: ${hasGcpEnvVars}`);
    return hasGcpEnvVars;
  }

  /**
   * Check if a token is a Firebase token based on its issuer
   */
  private isFirebaseToken(payload: Record<string, unknown>): boolean {
    const issuer = payload['iss'] as string | undefined;
    return issuer?.includes('securetoken.google.com') ?? false;
  }

  /**
   * Verify a Firebase token using the auth provider
   *
   * This method verifies the token cryptographically and extracts claims from
   * the decoded payload. It does NOT look up the user in Firebase, which allows
   * tokens to remain valid even if the Firebase user record has been deleted
   * (the token was still issued by Firebase and contains valid custom claims).
   */
  private async verifyFirebaseToken(token: string): Promise<Record<string, unknown>> {
    if (!this.authProviderFactory) {
      throw new UnauthorizedException('Auth provider not configured');
    }

    const provider = this.authProviderFactory.getProvider(
      AuthProviderType.GOOGLE_IDENTITY_PLATFORM
    );

    if (!provider) {
      throw new UnauthorizedException('GCP Identity Platform provider not available');
    }

    const result = await provider.validateToken(token);

    if (!result.valid) {
      throw new UnauthorizedException(result.error ?? 'Invalid Firebase token');
    }

    // Decode the token payload to extract all custom claims
    // We don't call getUserInfoFromToken() because it tries to look up the user
    // in Firebase, which will fail if the user has been deleted from Firebase
    // but still has a valid token with custom claims
    const decodedPayload = this.decodeTokenPayload(token);

    // Return payload-like structure combining validation result with decoded claims
    return {
      sub: result.userId,
      tenant_id: result.tenantId ?? decodedPayload['tenant_id'],
      db_user_id: decodedPayload['db_user_id'],
      email: decodedPayload['email'],
      roles: decodedPayload['roles'] ?? [],
      permissions: decodedPayload['permissions'] ?? [],
      exp: result.exp,
      // Include any additional custom claims from the decoded payload
      ...decodedPayload
    };
  }

  /**
   * Verify token based on its type (Firebase or local JWT)
   */
  private async verifyToken(token: string): Promise<Record<string, unknown>> {
    // Decode token WITHOUT verification to inspect payload
    const decodedPayload = this.decodeTokenPayload(token);

    const isFirebase = this.isFirebaseToken(decodedPayload);
    const gcpConfigured = this.isGcpConfigured();
    this.logger.debug(
      `Token type: ${isFirebase ? 'Firebase' : 'Local JWT'}, GCP configured: ${gcpConfigured}`
    );

    // Use Firebase verification for Firebase tokens when GCP is configured
    if (isFirebase && gcpConfigured) {
      this.logger.debug('Verifying Firebase token via GCP Identity Platform');
      return this.verifyFirebaseToken(token);
    }

    // Use local JWT verification
    this.logger.debug('Verifying token via local JwtService');
    return this.jwtService.verify(token) as Record<string, unknown>;
  }

  /**
   * Safely convert an unknown value to a string
   */
  private toStringValue(value: unknown): string {
    if (value == null) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    // For objects, return empty string to avoid [object Object]
    return '';
  }

  /**
   * Extract user data from token payload
   */
  private extractUserFromPayload(payload: Record<string, unknown>): CurrentUserData {
    const ids = this.extractIds(payload);
    const userInfo = this.extractUserInfo(payload);
    const authInfo = this.extractAuthInfo(payload);

    return {
      ...ids,
      ...userInfo,
      ...authInfo
    };
  }

  /**
   * Extract ID fields from payload
   */
  private extractIds(
    payload: Record<string, unknown>
  ): Pick<CurrentUserData, 'userId' | 'tenantId' | 'actorId'> {
    const dbUserId = payload['db_user_id'] ?? payload['dbUserId'];
    const tenantId = payload['tenant_id'] ?? payload['tenantId'];
    const actorId = payload['actor_id'] ?? payload['actorId'] ?? payload['sub'];

    // If custom claims are missing, log a warning but don't fail
    if (!dbUserId) {
      this.logger.warn(
        'db_user_id custom claim missing from JWT. Using Firebase UID as fallback. ' +
          'This may cause issues with database operations. User should re-login to refresh token.'
      );
    }

    const userIdStr = this.toStringValue(dbUserId) || this.toStringValue(payload['sub']);
    const tenantIdStr = this.toStringValue(tenantId);
    const actorIdStr = this.toStringValue(actorId) || userIdStr;

    return {
      userId: userIdStr,
      tenantId: tenantIdStr,
      actorId: actorIdStr
    };
  }

  /**
   * Extract user info fields from payload
   */
  private extractUserInfo(
    payload: Record<string, unknown>
  ): Pick<CurrentUserData, 'email' | 'username' | 'name'> {
    const emailStr = this.toStringValue(payload['email']);
    const usernameStr = this.toStringValue(payload['username']);
    const nameStr = this.toStringValue(payload['name']);

    return {
      email: emailStr,
      ...(usernameStr !== undefined && usernameStr !== null && { username: usernameStr }),
      ...(nameStr !== undefined && nameStr !== null && { name: nameStr })
    };
  }

  /**
   * Extract authorization info from payload
   */
  private extractAuthInfo(
    payload: Record<string, unknown>
  ): Pick<CurrentUserData, 'roles' | 'permissions' | 'permVersion'> {
    const permVersionStr = this.toStringValue(payload['perm_version']);

    return {
      roles: Array.isArray(payload['roles']) ? (payload['roles'] as string[]) : [],
      permissions: Array.isArray(payload['permissions'])
        ? (payload['permissions'] as string[])
        : [],
      ...(permVersionStr !== undefined &&
        permVersionStr !== null && { permVersion: permVersionStr })
    };
  }

  private parsePositiveInt(value: string): number | null {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private async assertPrincipalIsActive(user: CurrentUserData): Promise<void> {
    if (!this.authRepository || !this.organizationRepository) {
      return;
    }

    const userId = this.parsePositiveInt(user.userId);
    const tenantId = this.parsePositiveInt(user.tenantId);
    if (!userId || !tenantId) {
      return;
    }

    const [dbUser, organization] = await Promise.all([
      this.authRepository.findById(String(tenantId), userId),
      this.organizationRepository.findById(String(tenantId))
    ]);

    if (dbUser?.isActive !== true) {
      throw new UnauthorizedException('User account is inactive or deleted');
    }

    if (organization?.isActive !== true || organization.deletedAt) {
      throw new UnauthorizedException('Organization is inactive or deleted');
    }
  }

  private async hydrateAuthorizationContext(user: CurrentUserData): Promise<CurrentUserData> {
    await this.assertPrincipalIsActive(user);

    if (!this.roleService || !this.permissionService) {
      return user;
    }

    const userId = this.parsePositiveInt(user.userId);
    const tenantId = this.parsePositiveInt(user.tenantId);
    if (!userId || !tenantId) {
      return user;
    }

    try {
      const [systemRoles, tenantRole, permissions] = await Promise.all([
        this.roleService.getSystemRoles(userId),
        this.roleService.getTenantRole(userId, tenantId),
        this.permissionService.getUserPermissions(userId, tenantId)
      ]);

      const dbRoles = [...systemRoles, ...(tenantRole ? [tenantRole] : [])];
      this.logger.debug(
        `Hydrated auth context from DB: roles=${dbRoles.length}, permissions=${permissions.length}`
      );
      return {
        ...user,
        roles: dbRoles.length > 0 ? dbRoles : user.roles,
        permissions: permissions.length > 0 ? permissions : user.permissions
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to hydrate roles/permissions from DB: ${errorMessage}`);
      return user;
    }
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    // For non-public routes, verify JWT manually for better error messages
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request as Request);

    if (!token) {
      throw new UnauthorizedException('Access token is missing');
    }

    try {
      const payload = await this.verifyToken(token);
      const tenantId = this.toStringValue(payload['tenant_id'] ?? payload['tenantId']);
      if (
        this.authSessionStore &&
        (await this.authSessionStore.isAccessTokenRevoked(token, tenantId))
      ) {
        throw new UnauthorizedException('Invalid or expired access token');
      }
      const extractedUser = this.extractUserFromPayload(payload);
      const currentUser = await this.hydrateAuthorizationContext(extractedUser);

      this.logger.debug(
        `User authenticated: userId=${currentUser.userId}, tenantId=${currentUser.tenantId}`
      );

      (request as Record<string, unknown>)['user'] = currentUser;
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Token verification failed: ${errorMessage}`);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /**
   * Decode JWT token payload without verification
   */
  private decodeTokenPayload(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token format');
    }

    const payloadBase64 = parts[1];
    if (!payloadBase64) {
      throw new UnauthorizedException('Invalid token payload');
    }

    try {
      const decoded = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Invalid token encoding');
    }
  }

  /**
   * Extract Bearer token from Authorization header
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const headers = request as unknown as Record<string, Record<string, string>>;
    const authorization = headers['headers']?.['authorization'];
    if (!authorization) {
      return undefined;
    }
    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
