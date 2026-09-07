/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
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
 * JWT + Tenant Authentication Guard
 *
 * Combined guard that validates JWT authentication for protected routes.
 *
 * NOTE: Tenant header validation is now handled by TenantGuard (global APP_GUARD),
 * which executes before this guard. TenantGuard respects @Public() decorator and
 * validates x-tenant-id header for all non-public routes.
 *
 * This guard focuses solely on JWT validation:
 * 1. Checks @Public() decorator - returns true for public routes
 * 2. Validates JWT token - throws 401 Unauthorized if missing/invalid
 *
 * This ensures proper HTTP status codes:
 * - Missing/invalid JWT -> 401 (not authenticated)
 * - Missing/invalid tenant -> 400 (bad request, handled by TenantGuard)
 *
 * Execution order:
 * 1. TenantGuard (global) - validates tenant header for non-public routes
 * 2. JwtTenantGuard (applied to specific routes) - validates JWT token
 */
@Injectable()
export class JwtTenantGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtTenantGuard.name);
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

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Validate JWT token (tenant header already validated by TenantGuard)
    await this.validateAndAttachUser(request);

    return true;
  }

  private isGcpConfigured(): boolean {
    if (this.gcpConfigured !== null) {
      return this.gcpConfigured;
    }

    if (this.authProviderFactory) {
      const provider = this.authProviderFactory.getProvider(
        AuthProviderType.GOOGLE_IDENTITY_PLATFORM
      );
      if (provider) {
        this.gcpConfigured = true;
        return true;
      }
    }

    this.gcpConfigured =
      !!process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
      !!process.env['FIREBASE_PROJECT_ID'] ||
      !!process.env['GCP_PROJECT_ID'] ||
      !!process.env['GOOGLE_APPLICATION_CREDENTIALS'];

    return this.gcpConfigured;
  }

  private isFirebaseToken(payload: Record<string, unknown>): boolean {
    const issuer = payload['iss'] as string | undefined;
    return issuer?.includes('securetoken.google.com') ?? false;
  }

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

    const decodedPayload = this.decodeTokenPayload(token);

    return {
      sub: result.userId,
      tenant_id: result.tenantId ?? decodedPayload['tenant_id'],
      db_user_id: decodedPayload['db_user_id'],
      email: decodedPayload['email'],
      roles: decodedPayload['roles'] ?? [],
      permissions: decodedPayload['permissions'] ?? [],
      exp: result.exp,
      ...decodedPayload
    };
  }

  private async verifyToken(token: string): Promise<Record<string, unknown>> {
    const decodedPayload = this.decodeTokenPayload(token);
    const isFirebase = this.isFirebaseToken(decodedPayload);
    const gcpConfigured = this.isGcpConfigured();
    if (isFirebase && gcpConfigured) {
      return this.verifyFirebaseToken(token);
    }

    return this.jwtService.verify(token) as Record<string, unknown>;
  }

  /**
   * Validate JWT token and attach user to request
   * @throws UnauthorizedException if token is missing or invalid
   */
  private async validateAndAttachUser(request: unknown): Promise<void> {
    const token = this.extractTokenFromHeader(request as Request);

    if (!token) {
      throw new UnauthorizedException('Access token is missing');
    }

    try {
      const payload = await this.verifyToken(token);
      const tenantId =
        typeof payload['tenant_id'] === 'string'
          ? payload['tenant_id']
          : typeof payload['tenantId'] === 'string'
            ? payload['tenantId']
            : '';

      if (
        this.authSessionStore &&
        (await this.authSessionStore.isAccessTokenRevoked(token, tenantId))
      ) {
        throw new UnauthorizedException('Invalid or expired access token');
      }

      const extractedUser = this.buildCurrentUser(payload);
      const currentUser = await this.hydrateAuthorizationContext(extractedUser);
      (request as Record<string, unknown>)['user'] = currentUser;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  /**
   * Build CurrentUserData from JWT payload
   *
   * IMPORTANT: db_user_id custom claim contains the DATABASE user ID
   * Firebase's user_id is reserved and always contains Firebase UID, so we use db_user_id instead
   */
  private buildCurrentUser(payload: Record<string, unknown>): CurrentUserData {
    // CRITICAL: Use db_user_id (database user ID), not user_id (Firebase UID)
    // user_id is a reserved Firebase claim that always contains the Firebase UID
    const dbUserId = payload['db_user_id'] ?? payload['dbUserId'];
    const tenantId = payload['tenant_id'] ?? payload['tenantId'];
    const email = payload['email'];

    // If custom claims are missing, log a warning but don't fail
    // This allows the request to proceed, but operations requiring database user ID may fail
    if (!dbUserId) {
      this.logger.warn(
        '[JwtTenantGuard] db_user_id custom claim missing from JWT. Using Firebase UID as fallback. ' +
          'This may cause issues with database operations. User should re-login to refresh token.'
      );
    }

    // Fallback to Firebase UID (sub) if db_user_id is missing
    const fallbackUserId = typeof payload['sub'] === 'string' ? payload['sub'] : '';

    const userId =
      typeof dbUserId === 'string' || typeof dbUserId === 'number'
        ? String(dbUserId)
        : fallbackUserId;

    return {
      userId,
      tenantId: typeof tenantId === 'string' || typeof tenantId === 'number' ? `${tenantId}` : '',
      actorId: userId, // actorId is the same as userId (the database user ID)
      email: typeof email === 'string' ? email : '',
      roles: Array.isArray(payload['roles']) ? (payload['roles'] as string[]) : [],
      permissions: Array.isArray(payload['permissions']) ? (payload['permissions'] as string[]) : []
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

  /**
   * Extract Bearer token from Authorization header
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const headers = request as unknown as Record<string, Record<string, string | string[]>>;
    const authorization = headers['headers']?.['authorization'];
    if (!authorization) {
      return undefined;
    }
    // Handle array headers by taking the first value
    const authValue = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!authValue) {
      return undefined;
    }
    const [type, token] = authValue.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
