import { createHash } from 'node:crypto';

import {
  Post,
  Body,
  Get,
  Delete,
  Patch,
  Put,
  Headers,
  Ip,
  Req,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  GoneException,
  Inject,
  Param
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { User } from '@package/auth';
import { Action, Resource } from '@package/opa';

import { MonitorSecurity } from '../../security/decorators';
import { SecurityEventType } from '../../security/events';
import { SecurityMonitoringService } from '../../security/security-monitoring.service';
import { InvitationRepository } from '../../tenants/repositories';
import { PUBLIC_AUTH_TENANT_ID } from '../auth.constants';
import {
  RegisterCommand,
  LoginCommand,
  LoginWithOAuthCommand,
  LoginWithPhoneCommand,
  AcceptInvitationCommand,
  DeclineInvitationCommand,
  LinkIdentityCommand,
  UnlinkIdentityCommand,
  LogoutCommand,
  RevokeSessionCommand,
  RefreshTokenCommand,
  UpdateMyAvatarCommand,
  RemoveMyAvatarCommand,
  UpdateMyProfileCommand,
  ChangeMyPasswordCommand,
  UpdateCurrentUserSettingCommand
} from '../commands';
import {
  RegisterDto,
  LoginDto,
  LoginWithOAuthDto,
  LoginWithPhoneDto,
  InvitationActionDto,
  LinkIdentityDto,
  UnlinkIdentityDto,
  RefreshTokenDto,
  UpdateMyAvatarDto,
  UpdateMyProfileDto,
  ChangeMyPasswordDto,
  AuthResponseDto,
  InvitationActionResponseDto,
  InvitationPreviewQueryDto,
  InvitationPreviewResponseDto,
  SessionDto,
  UserIdentityDto,
  UserRolesResponseDto,
  UserProfileResponseDto,
  UserOrganizationDto,
  CurrentUserSettingKeyParamDto,
  CurrentUserSettingsResponseDto,
  UpdateCurrentUserSettingDto,
  AuthBootstrapResponseDto,
  type SessionEntity
} from '../dto';
import { buildAuthAuditEvent } from '../events';
import { JwtAuthGuard, JwtTenantGuard, Public } from '../guards';
import {
  GetUserRolesQuery,
  GetUserSessionQuery,
  GetUserProfileQuery,
  GetAuthBootstrapQuery,
  GetMyOrganizationsQuery,
  ListUserIdentitiesQuery,
  ValidateTokenQuery,
  GetCurrentUserSettingsQuery
} from '../queries';
import { AuthRepository } from '../repositories/auth.repository';

import type { AuthResponse, UserInfo } from '../auth.types';
import type { NodePgDatabase, UserIdentity } from '@package/db-core';
import type { Request } from 'express';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { type RequestTrace, toCqrsTrace } from '@/common/cqrs/request-trace';
import { MAIN_DB } from '@/common/database/database.constants';
import { type CurrentUserData, CurrentUser, RequestTraceData, UserId } from '@/common/decorators';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { HybridPolicyGuard } from '@/modules/auth/guards';

const enum InvitationPreviewStatus {
  VALID = 'valid',
  EXPIRED = 'expired',
  CONSUMED = 'consumed',
  INVALID = 'invalid'
}

/**
 * Auth Controller
 *
 * Handles authentication operations: register, login, logout, token refresh, identity management
 * Routes are prefixed with /api/v1/auth
 */
@ApiTags('Identity')
@VersionedController('v1', 'iam')
export class IdentityController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly securityMonitoring: SecurityMonitoringService,
    private readonly invitationRepository: InvitationRepository,
    private readonly authRepository: AuthRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  /**
   * Extract user-agent from request headers
   * Handles both string and array headers, with fallback to 'Unknown'
   */
  private extractUserAgent(req: Request): string {
    const header = req.headers['user-agent'];
    // Express headers can be string | string[] | undefined
    if (typeof header === 'string') {
      return header;
    }
    if (Array.isArray(header)) {
      return header[0] || 'Unknown';
    }
    return 'Unknown';
  }

  private maskEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    const [localPart, domainPart] = normalized.split('@');
    if (!localPart || !domainPart) {
      return 'hidden';
    }

    if (localPart.length <= 2) {
      return `${localPart[0] ?? '*'}***@${domainPart}`;
    }

    return `${localPart[0]}***${localPart[localPart.length - 1]}@${domainPart}`;
  }

  private mapInvitationStatus(
    invitationStatus: string,
    expiresAt: Date | null
  ): InvitationPreviewStatus {
    if (invitationStatus === 'accepted') {
      return InvitationPreviewStatus.CONSUMED;
    }

    if (invitationStatus === 'cancelled') {
      return InvitationPreviewStatus.INVALID;
    }

    if (invitationStatus === 'expired') {
      return InvitationPreviewStatus.EXPIRED;
    }

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      return InvitationPreviewStatus.EXPIRED;
    }

    return invitationStatus === 'pending'
      ? InvitationPreviewStatus.VALID
      : InvitationPreviewStatus.INVALID;
  }

  private buildUnavailableInvitationError(status: InvitationPreviewStatus): GoneException {
    return new GoneException({
      message:
        status === InvitationPreviewStatus.CONSUMED
          ? 'Invitation has already been used'
          : status === InvitationPreviewStatus.EXPIRED
            ? 'Invitation has expired'
            : 'Invitation is not available',
      status
    });
  }

  /**
   * Preview invitation metadata safely before registration.
   *
   * Returns only non-sensitive context data for invitation acceptance UX.
   */
  @Public()
  @Throttle({ invitationPreview: {} })
  @Get('invitations/preview')
  @ApiOperation({
    summary: 'Preview invitation metadata',
    description:
      'Returns safe invitation context (tenant name, inviter display name, masked email, expiration) for invitation acceptance page.'
  })
  @ApiResponse({ status: 200, description: 'Invitation preview available.' })
  @ApiResponse({ status: 400, description: 'Missing or invalid invitation parameters.' })
  @ApiResponse({ status: 404, description: 'Invitation not found for tenant/token pair.' })
  @ApiResponse({ status: 410, description: 'Invitation is expired or already consumed.' })
  async previewInvitation(
    @Query() query: InvitationPreviewQueryDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<InvitationPreviewResponseDto> {
    const token = query.token?.trim();

    if (!token) {
      throw new BadRequestException('token is required');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invitation = await this.invitationRepository.findByTokenHashGlobal(tokenHash);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    const tenantId = invitation.organizationId;
    const status = this.mapInvitationStatus(invitation.status, invitation.expiresAt ?? null);
    if (status !== InvitationPreviewStatus.VALID) {
      throw this.buildUnavailableInvitationError(status);
    }

    const organization = await this.authRepository.findOrganizationById(tenantId);
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    let inviterDisplayName = 'Tenant administrator';
    if (invitation.invitedByUserId) {
      const inviter = await this.authRepository.findById(
        String(tenantId),
        invitation.invitedByUserId
      );
      inviterDisplayName = inviter?.displayName?.trim() ?? inviterDisplayName;
    }

    let invitedEmailMasked = 'hidden';
    if (invitation.emailEncrypted) {
      try {
        const email = await this.invitationRepository.decryptEmail(invitation.emailEncrypted);
        invitedEmailMasked = this.maskEmail(email);
      } catch {
        invitedEmailMasked = 'hidden';
      }
    }

    const existingAccount = invitation.emailHash
      ? await this.authRepository.findWithOrganizationByEmailHash(invitation.emailHash)
      : null;

    await this.auditOutbox.insert(
      this.db,
      buildAuthAuditEvent({
        eventType: 'auth.invitation.previewed.audit',
        tenantId,
        requestId: trace.requestId,
        aggregateId: tenantId,
        action: 'VIEW_INVITATION_PREVIEW',
        target: {
          entityType: 'invitation',
          entityId: String(tenantId)
        },
        details: {
          invitationStatus: InvitationPreviewStatus.VALID,
          acceptanceMode: existingAccount ? 'existing_account' : 'register',
          hasInviter: Boolean(invitation.invitedByUserId),
          expiresAtPresent: Boolean(invitation.expiresAt)
        },
        correlationId: trace.correlationId,
        causationId: trace.causationId
      })
    );

    return {
      status: InvitationPreviewStatus.VALID,
      acceptanceMode: existingAccount ? 'existing_account' : 'register',
      tenantName: organization.displayName?.trim() ?? organization.name,
      inviterDisplayName,
      invitedEmailMasked,
      expiresAt: invitation.expiresAt?.toISOString() ?? null
    };
  }

  @Post('invitations/accept')
  @UseGuards(JwtAuthGuard, HybridPolicyGuard)
  @Resource({ type: OPA_RESOURCES.INVITATIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.ACCEPT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Accept invitation as authenticated user',
    description:
      'Accepts a pending invitation for the signed-in account when the invitation email matches the authenticated user.'
  })
  @ApiResponse({ status: 200, description: 'Invitation accepted successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid invitation payload.' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token.' })
  async acceptInvitation(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: InvitationActionDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<InvitationActionResponseDto>> {
    const result = await this.commandBus.execute<
      AcceptInvitationCommand,
      InvitationActionResponseDto
    >(
      new AcceptInvitationCommand({
        actorId: user.userId,
        actorEmail: user.email,
        ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
        invitationToken: dto.token,
        ...toCqrsTrace(trace)
      })
    );

    return BaseResponseDto.withTimestamp(result);
  }

  @Post('invitations/decline')
  @UseGuards(JwtAuthGuard, HybridPolicyGuard)
  @Resource({ type: OPA_RESOURCES.INVITATIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.DECLINE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Decline invitation as authenticated user',
    description:
      'Declines a pending invitation for the signed-in account when the invitation email matches the authenticated user.'
  })
  @ApiResponse({ status: 200, description: 'Invitation declined successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid invitation payload.' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token.' })
  async declineInvitation(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: InvitationActionDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<InvitationActionResponseDto>> {
    const result = await this.commandBus.execute<
      DeclineInvitationCommand,
      InvitationActionResponseDto
    >(
      new DeclineInvitationCommand({
        actorId: user.userId,
        actorEmail: user.email,
        ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
        invitationToken: dto.token,
        ...toCqrsTrace(trace)
      })
    );

    return BaseResponseDto.withTimestamp(result);
  }

  /**
   * Register new user
   */
  @Public()
  @Throttle({ registration: {} })
  @Post('register')
  @ApiOperation({
    summary: 'Register new user',
    description:
      'Create a new user account with email and password. Public endpoint - no tenant required.'
  })
  async register(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() dto: RegisterDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<AuthResponseDto> {
    const userAgent = this.extractUserAgent(req);

    const command = new RegisterCommand({
      ...(tenantId !== undefined && { tenantId }),
      email: dto.email,
      password: dto.password,
      ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      ...(dto.organizationName !== undefined && { organizationName: dto.organizationName }),
      ...(dto.organizationSlug !== undefined && { organizationSlug: dto.organizationSlug }),
      ...(dto.invitationToken !== undefined && { invitationToken: dto.invitationToken }),
      ipAddress,
      userAgent,
      isVerified: true,
      isActive: true,
      ...toCqrsTrace(trace)
    });

    const result: AuthResponse = await this.commandBus.execute(command);

    return AuthResponseDto.fromAuthResponse(result);
  }

  /**
   * Login with email/password
   */
  @Public()
  @MonitorSecurity([SecurityEventType.AUTH_LOGIN_FAILED, SecurityEventType.AUTH_LOGIN_SUCCEEDED])
  @Throttle({ login: {} })
  @Post('login')
  @ApiOperation({
    summary: 'Login with email/password',
    description: 'Authenticate with email and password'
  })
  async login(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() dto: LoginDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<AuthResponseDto> {
    const userAgent = this.extractUserAgent(req);
    // Use PUBLIC_AUTH_TENANT_ID as fallback for public auth routes (tenantId from header is optional)
    const effectiveTenantId = tenantId ?? PUBLIC_AUTH_TENANT_ID;

    const command = new LoginCommand({
      tenantId: effectiveTenantId,
      email: dto.email,
      password: dto.password,
      ipAddress,
      userAgent,
      ...toCqrsTrace(trace)
    });

    try {
      const result: AuthResponse = await this.commandBus.execute(command);

      // Record successful authentication (no PII - use userId only)
      // NOTE: result.user.userId is a string, we need the actual user ID number
      // The tenantId is already available from the command context
      this.securityMonitoring.recordAuthSuccess(effectiveTenantId, result.user.userId);

      return AuthResponseDto.fromAuthResponse(result);
    } catch (error) {
      // Record failed authentication (no PII - use tenantId only)
      // We don't have userId yet since authentication failed
      this.securityMonitoring.recordAuthFailure(effectiveTenantId, 'anonymous');

      // Re-throw the error for proper error handling
      throw error;
    }
  }

  /**
   * Login with OAuth provider
   */
  @Public()
  @Throttle({ oauth: {} })
  @Post('login/oauth')
  @ApiOperation({
    summary: 'Login with OAuth provider',
    description: 'Authenticate with OAuth provider (Google, Microsoft, etc.)'
  })
  async loginWithOAuth(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() dto: LoginWithOAuthDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<AuthResponseDto> {
    const userAgent = this.extractUserAgent(req);
    // Use PUBLIC_AUTH_TENANT_ID as fallback for public auth routes (tenantId from header is optional)
    const effectiveTenantId = tenantId ?? PUBLIC_AUTH_TENANT_ID;

    const command = new LoginWithOAuthCommand({
      tenantId: effectiveTenantId,
      provider: dto.provider,
      idToken: dto.idToken,
      ...(dto.accessToken !== undefined && { accessToken: dto.accessToken }),
      ipAddress,
      userAgent,
      ...toCqrsTrace(trace)
    });

    const result: AuthResponse = await this.commandBus.execute(command);

    return AuthResponseDto.fromAuthResponse(result);
  }

  /**
   * Login with phone number
   */
  @Public()
  @Throttle({ phoneLogin: {} })
  @Post('login/phone')
  @ApiOperation({
    summary: 'Login with phone',
    description: 'Authenticate with phone number and verification code'
  })
  async loginWithPhone(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() dto: LoginWithPhoneDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<AuthResponseDto> {
    const userAgent = this.extractUserAgent(req);
    // Use PUBLIC_AUTH_TENANT_ID as fallback for public auth routes (tenantId from header is optional)
    const effectiveTenantId = tenantId ?? PUBLIC_AUTH_TENANT_ID;

    const command = new LoginWithPhoneCommand({
      tenantId: effectiveTenantId,
      phoneNumber: dto.phoneNumber,
      verificationCode: dto.verificationCode,
      ipAddress,
      userAgent,
      ...toCqrsTrace(trace)
    });

    const result: AuthResponse = await this.commandBus.execute(command);

    return AuthResponseDto.fromAuthResponse(result);
  }

  /**
   * Refresh access token
   */
  @Public()
  @Throttle({ refreshToken: {} })
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Get new access token using refresh token'
  })
  async refreshToken(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body() dto: RefreshTokenDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<AuthResponseDto> {
    const userAgent = this.extractUserAgent(req);
    // Use PUBLIC_AUTH_TENANT_ID as fallback for public auth routes (tenantId from header is optional)
    const effectiveTenantId = tenantId ?? PUBLIC_AUTH_TENANT_ID;

    const command = new RefreshTokenCommand({
      tenantId: effectiveTenantId,
      refreshToken: dto.refreshToken,
      ipAddress,
      userAgent,
      ...toCqrsTrace(trace)
    });

    const result: AuthResponse = await this.commandBus.execute(command);

    return AuthResponseDto.fromAuthResponse(result);
  }

  /**
   * Logout user
   */
  @Post('logout')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout user',
    description: 'Invalidate current session and tokens'
  })
  @Resource({ type: OPA_RESOURCES.AUTH_SESSIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.REVOKE)
  async logout(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: RefreshTokenDto,
    @Headers('authorization') authHeader: string,
    @Ip() ipAddress: string,
    @Req() req: Request,
    @CurrentUser() user: CurrentUserData,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<{ message: string }> {
    const accessToken = authHeader?.replace('Bearer ', '');
    const userAgent = this.extractUserAgent(req);

    const command = new LogoutCommand({
      tenantId,
      actorId: user.userId,
      userId: Number(user.userId),
      refreshToken: dto.refreshToken,
      accessToken,
      ipAddress,
      userAgent,
      ...toCqrsTrace(trace)
    });

    await this.commandBus.execute(command);

    return { message: 'Logged out successfully' };
  }

  /**
   * Link identity provider to user
   */
  @Post('identities/link')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Link identity provider',
    description: 'Link an additional identity provider (Google, LinkedIn, etc.) to the current user'
  })
  @Resource({ type: OPA_RESOURCES.USER_IDENTITIES, scope: 'tenant' })
  @Action(OPA_ACTIONS.LINK)
  async linkIdentity(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: LinkIdentityDto,
    @CurrentUser() user: CurrentUserData,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<{ message: string }> {
    const command = new LinkIdentityCommand({
      tenantId,
      actorId: user.userId,
      userId: Number(user.userId),
      provider: dto.provider,
      providerUid: dto.providerUid,
      ...(dto.idToken !== undefined && { idToken: dto.idToken }),
      ...(dto.accessToken !== undefined && { accessToken: dto.accessToken }),
      ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      ...(dto.photoUrl !== undefined && { photoUrl: dto.photoUrl }),
      ...toCqrsTrace(trace)
    });

    await this.commandBus.execute(command);

    return { message: 'Identity linked successfully' };
  }

  /**
   * Unlink identity provider from user
   */
  @Post('identities/unlink')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Unlink identity provider',
    description: 'Unlink an identity provider from the current user'
  })
  @Resource({ type: OPA_RESOURCES.USER_IDENTITIES, scope: 'tenant' })
  @Action(OPA_ACTIONS.UNLINK)
  async unlinkIdentity(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UnlinkIdentityDto,
    @CurrentUser() user: CurrentUserData,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<{ message: string }> {
    const command = new UnlinkIdentityCommand({
      tenantId,
      actorId: user.userId,
      userId: Number(user.userId),
      provider: dto.provider,
      providerUid: dto.providerUid,
      ...toCqrsTrace(trace)
    });

    await this.commandBus.execute(command);

    return { message: 'Identity unlinked successfully' };
  }

  /**
   * Get current user's identities
   */
  @Get('identities')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user identities',
    description: 'Get all identity providers linked to the current user'
  })
  @Resource({ type: OPA_RESOURCES.USER_IDENTITIES, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  async getUserIdentities(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<UserIdentityDto[]> {
    const query = new ListUserIdentitiesQuery({
      tenantId,
      actorId: user.actorId,
      userId: Number(user.userId),
      ...toCqrsTrace(trace)
    });

    const identities = (await this.queryBus.execute(query)) as UserIdentity[];

    return identities.map((identity) => UserIdentityDto.fromEntity(identity));
  }

  /**
   * Get current user's sessions
   */
  @Get('sessions')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user sessions',
    description: 'Get all active sessions for the current user'
  })
  @Resource({ type: OPA_RESOURCES.AUTH_SESSIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.LIST)
  async getUserSessions(
    @Headers('x-tenant-id') tenantId: string,
    @CurrentUser() user: CurrentUserData,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<SessionDto[]> {
    const query = new GetUserSessionQuery({
      tenantId,
      userId: Number(user.userId),
      sessionId: trace.requestId
    });

    const sessions = (await this.queryBus.execute(query)) as SessionEntity[];

    return sessions.map((session) => SessionDto.fromEntity(session));
  }

  /**
   * Revoke one of the current user's sessions.
   */
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke user session',
    description:
      'Revokes a session belonging to the current authenticated user within the current tenant.'
  })
  @ApiResponse({
    status: 204,
    description: 'Session revoked successfully'
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions'
  })
  @ApiResponse({
    status: 404,
    description: 'Session not found'
  })
  @Resource({ type: OPA_RESOURCES.AUTH_SESSIONS, scope: 'tenant' })
  @Action(OPA_ACTIONS.REVOKE)
  async revokeUserSession(
    @Headers('x-tenant-id') tenantId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: CurrentUserData,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    await this.commandBus.execute(
      new RevokeSessionCommand({
        tenantId,
        actorId: user.actorId,
        userId: Number(user.userId),
        sessionId,
        requestId: trace.requestId,
        ...toCqrsTrace(trace)
      })
    );
  }

  /**
   * Validate token
   */
  @Public()
  @Throttle({ validateToken: {} })
  @Post('validate')
  @ApiOperation({
    summary: 'Validate access token',
    description: 'Validate an access token and return user information'
  })
  async validateToken(
    @Headers('x-tenant-id') tenantId: string | undefined,
    @Body('token') token: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<{ valid: boolean; user?: UserInfo }> {
    // Use PUBLIC_AUTH_TENANT_ID as fallback for public auth routes (tenantId from header is optional)
    const effectiveTenantId = tenantId ?? PUBLIC_AUTH_TENANT_ID;

    const query = new ValidateTokenQuery({
      tenantId: effectiveTenantId,
      token,
      ...toCqrsTrace(trace)
    });

    const result: UserInfo = await this.queryBus.execute(query);

    return {
      valid: true,
      user: result
    };
  }

  /**
   * Get user roles
   */
  @Get('roles')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user roles',
    description: 'Get roles and permissions for the authenticated user'
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ_ROLES)
  async getUserRoles(
    @Headers('x-tenant-id') tenantId: string,
    @UserId() userId: string,
    @CurrentUser('actorId') actorId: string,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<UserRolesResponseDto>> {
    const result = await this.queryBus.execute<GetUserRolesQuery, UserRolesResponseDto>(
      new GetUserRolesQuery({
        tenantId: Number(tenantId),
        userId: Number(userId),
        actorId,
        ...toCqrsTrace(trace)
      })
    );
    // Return wrapped in BaseResponseDto (VersionInterceptor will unwrap and add meta)
    return new BaseResponseDto(result, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get current user profile
   *
   * Returns the authenticated user's profile including roles and permissions.
   * This endpoint is intended for use by client applications (web, mobile) to
   * fetch the current user's information for display and authorization decisions.
   */
  @Get('me')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the authenticated user profile including DB-backed displayName and authorization claims.'
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User unique identifier' },
            tenantId: { type: 'string', description: 'Tenant (organization) unique identifier' },
            actorId: { type: 'string', description: 'Actor ID for audit tracking' },
            email: { type: 'string', description: 'User email address' },
            name: { type: 'string', description: 'User display name' },
            displayName: {
              type: 'string',
              description: 'Authoritative display name from persisted profile'
            },
            photoUrl: {
              type: 'string',
              description: 'Resolved profile photo URL when an avatar is attached'
            },
            isActive: {
              type: 'boolean',
              description: 'Whether account is active in database'
            },
            isVerified: {
              type: 'boolean',
              description: 'Whether account is verified in database'
            },
            emailVerified: {
              type: 'boolean',
              description: 'Whether primary identity email is verified'
            },
            roles: { type: 'array', items: { type: 'string' }, description: 'User roles' },
            permissions: {
              type: 'array',
              items: { type: 'string' },
              description: 'User permissions'
            }
          }
        },
        metadata: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', description: 'Response timestamp' },
            version: { type: 'string', description: 'API version' }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ_SELF)
  async getMe(@User() user: CurrentUserData): Promise<BaseResponseDto<UserProfileResponseDto>> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const query = new GetUserProfileQuery({
      userId: user.userId,
      tenantId: user.tenantId,
      actorId: user.actorId,
      email: user.email,
      name: user.name,
      username: user.username,
      roles: user.roles as string[] | undefined,
      permissions: user.permissions as string[] | undefined
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const profile = await this.queryBus.execute<GetUserProfileQuery, UserProfileResponseDto>(query);

    // Return wrapped in BaseResponseDto (VersionInterceptor will unwrap and add meta)
    return new BaseResponseDto(profile, {
      timestamp: new Date().toISOString()
    });
  }

  @Get('me/bootstrap')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user shell bootstrap',
    description:
      'Returns the authenticated user shell payload needed for protected server rendering in one response.'
  })
  @ApiResponse({
    status: 200,
    description: 'Current user bootstrap retrieved successfully',
    type: AuthBootstrapResponseDto
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ_SELF)
  async getMeBootstrap(
    @User() user: CurrentUserData,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<AuthBootstrapResponseDto>> {
    const bootstrap = await this.queryBus.execute<GetAuthBootstrapQuery, AuthBootstrapResponseDto>(
      new GetAuthBootstrapQuery({
        userId: user.userId,
        tenantId: user.tenantId,
        actorId: user.actorId,
        ...toCqrsTrace(trace),
        email: user.email,
        name: user.name,
        username: user.username,
        roles: user.roles as string[] | undefined,
        permissions: user.permissions as string[] | undefined
      })
    );

    return new BaseResponseDto(bootstrap, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get organizations/workspaces for current user.
   */
  @Get('me/organizations')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user organizations',
    description:
      'Returns active organization memberships for the authenticated user to support workspace switching.'
  })
  @ApiResponse({
    status: 200,
    description: 'User organizations retrieved successfully',
    type: UserOrganizationDto,
    isArray: true
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ_SELF)
  async getMyOrganizations(
    @User() user: CurrentUserData
  ): Promise<BaseResponseDto<UserOrganizationDto[]>> {
    const query = new GetMyOrganizationsQuery({ userId: user.userId });
    const organizations = await this.queryBus.execute<
      GetMyOrganizationsQuery,
      UserOrganizationDto[]
    >(query);

    return new BaseResponseDto(organizations, {
      timestamp: new Date().toISOString()
    });
  }

  @Get('me/settings')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user workspace settings',
    description:
      'Returns authenticated user settings scoped to the current workspace, including sidebar section order.'
  })
  @ApiResponse({
    status: 200,
    description: 'Current user workspace settings retrieved successfully',
    type: CurrentUserSettingsResponseDto
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.READ_SELF)
  async getCurrentUserSettings(
    @User() user: CurrentUserData
  ): Promise<BaseResponseDto<CurrentUserSettingsResponseDto>> {
    const settings = await this.queryBus.execute<
      GetCurrentUserSettingsQuery,
      CurrentUserSettingsResponseDto
    >(
      new GetCurrentUserSettingsQuery({
        tenantId: user.tenantId,
        userId: user.userId
      })
    );

    return new BaseResponseDto(settings, {
      timestamp: new Date().toISOString()
    });
  }

  @Put('me/settings/:settingKey')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update current user workspace setting',
    description:
      'Updates a typed authenticated user setting for the current workspace and returns the normalized settings payload.'
  })
  @ApiResponse({
    status: 200,
    description: 'Current user workspace setting updated successfully',
    type: CurrentUserSettingsResponseDto
  })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE_SELF)
  async updateCurrentUserSetting(
    @User() user: CurrentUserData,
    @Param() params: CurrentUserSettingKeyParamDto,
    @Body() dto: UpdateCurrentUserSettingDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<CurrentUserSettingsResponseDto>> {
    const settings = await this.commandBus.execute<
      UpdateCurrentUserSettingCommand,
      CurrentUserSettingsResponseDto
    >(
      new UpdateCurrentUserSettingCommand({
        tenantId: user.tenantId,
        userId: user.userId,
        actorId: user.actorId,
        settingKey: params.settingKey,
        value: dto.value,
        ...toCqrsTrace(trace)
      })
    );

    return new BaseResponseDto(settings, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Update current user profile
   *
   * Updates only the authenticated user's own profile.
   */
  @Patch('me')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Updates the authenticated subject user profile fields (displayName and phoneNumber) in tenant scope.'
  })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully'
  })
  @ApiResponse({ status: 400, description: 'Invalid profile payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE_SELF)
  async updateMe(
    @User() user: CurrentUserData,
    @Body() dto: UpdateMyProfileDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<UserProfileResponseDto>> {
    const command = new UpdateMyProfileCommand({
      tenantId: user.tenantId,
      userId: user.userId,
      actorId: user.actorId,
      email: user.email,
      name: user.name,
      username: user.username,
      displayName: dto.displayName,
      phoneNumber: dto.phoneNumber,
      ...toCqrsTrace(trace)
    });

    const profile = await this.commandBus.execute<UpdateMyProfileCommand, UserProfileResponseDto>(
      command
    );

    return new BaseResponseDto(profile, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Update current user avatar
   *
   * Attaches a finalized storage file as the authenticated user's avatar.
   */
  @Patch('me/avatar')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update current user avatar',
    description:
      'Attaches a finalized user_avatar storage file to the authenticated subject user and returns the refreshed profile.'
  })
  @ApiResponse({
    status: 200,
    description: 'User avatar updated successfully'
  })
  @ApiResponse({ status: 400, description: 'Invalid avatar payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE_SELF)
  async updateMyAvatar(
    @User() user: CurrentUserData,
    @Body() dto: UpdateMyAvatarDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<UserProfileResponseDto>> {
    const command = new UpdateMyAvatarCommand({
      tenantId: user.tenantId,
      userId: user.userId,
      actorId: user.actorId,
      fileId: dto.fileId,
      email: user.email,
      name: user.name,
      username: user.username,
      ...toCqrsTrace(trace)
    });

    const profile = await this.commandBus.execute<UpdateMyAvatarCommand, UserProfileResponseDto>(
      command
    );

    return new BaseResponseDto(profile, {
      timestamp: new Date().toISOString()
    });
  }

  @Delete('me/avatar')
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove current user avatar',
    description:
      'Clears the authenticated subject user avatar attachment, soft-deletes the detached uploaded avatar file when eligible, and returns the refreshed profile.'
  })
  @ApiResponse({
    status: 200,
    description: 'User avatar removed successfully'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.UPDATE_SELF)
  async removeMyAvatar(
    @User() user: CurrentUserData,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<BaseResponseDto<UserProfileResponseDto>> {
    const command = new RemoveMyAvatarCommand({
      tenantId: user.tenantId,
      userId: user.userId,
      actorId: user.actorId,
      email: user.email,
      name: user.name,
      username: user.username,
      ...toCqrsTrace(trace)
    });

    const profile = await this.commandBus.execute<RemoveMyAvatarCommand, UserProfileResponseDto>(
      command
    );

    return new BaseResponseDto(profile, {
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Change current user password
   */
  @Patch('me/password')
  @Throttle({ passwordReset: {} })
  @UseGuards(JwtTenantGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change current user password',
    description:
      'Changes the authenticated subject user password after verifying the current password.'
  })
  @ApiResponse({
    status: 204,
    description: 'Password changed successfully'
  })
  @ApiResponse({ status: 400, description: 'Invalid password payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid current password' })
  @ApiResponse({ status: 403, description: 'Password change not supported for this account' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Resource({ type: OPA_RESOURCES.USERS, scope: 'tenant' })
  @Action(OPA_ACTIONS.CHANGE_PASSWORD_SELF)
  async changeMyPassword(
    @User() user: CurrentUserData,
    @Body() dto: ChangeMyPasswordDto,
    @RequestTraceData() trace: RequestTrace = {}
  ): Promise<void> {
    const command = new ChangeMyPasswordCommand({
      tenantId: user.tenantId,
      userId: user.userId,
      actorId: user.actorId,
      email: user.email,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
      ...toCqrsTrace(trace)
    });

    await this.commandBus.execute<ChangeMyPasswordCommand, void>(command);
  }
}
