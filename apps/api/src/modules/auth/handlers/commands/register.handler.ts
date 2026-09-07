import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { and, eq, userTenants } from '@package/db-core';
import { Errors } from '@package/errors';
import { hashEmail } from '@package/utils';

import { InvitationRepository, UserTenantRepository } from '../../../tenants/repositories';
import { RegisterCommand } from '../../commands/register.command';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { AuthService } from '../../services/auth.service';

import type { AuthResponseDto } from '../../dto/auth-response.dto';
import type { User } from '@package/db-core';

const enum InvitationRole {
  OWNER = 'tenant_owner',
  ADMIN = 'tenant_admin',
  USER = 'tenant_user',
  VIEWER = 'tenant_viewer'
}

function normalizeInvitationRole(role: string | null | undefined): InvitationRole {
  switch (role) {
    case InvitationRole.OWNER:
      return InvitationRole.OWNER;
    case InvitationRole.ADMIN:
      return InvitationRole.ADMIN;
    case InvitationRole.VIEWER:
      return InvitationRole.VIEWER;
    default:
      return InvitationRole.USER;
  }
}

/**
 * Register command handler
 *
 * Handles user registration with email/password
 * - If tenantId provided: validates organization exists and allows public registration
 * - If no tenantId: auto-creates new organization (organizationName is optional, will use defaults)
 */
@CommandHandler(RegisterCommand)
export class RegisterHandler implements ICommandHandler<RegisterCommand> {
  private readonly logger = new Logger(RegisterHandler.name);

  constructor(
    private readonly authService: AuthService,
    private readonly organizationRepository: OrganizationRepository,
    private readonly invitationRepository: InvitationRepository,
    private readonly userTenantRepository: UserTenantRepository
  ) {}

  async execute(command: RegisterCommand): Promise<AuthResponseDto & { isNewUser: boolean }> {
    const normalizedEmail = command.email.trim().toLowerCase();
    const invitationToken = command.invitationToken?.trim() ?? '';
    const hasInvitationToken = invitationToken.length > 0;
    let acceptedInvitationId: number | null = null;
    let acceptedInvitationTenantId: number | null = null;
    let acceptedInvitationMembershipTenantId: number | null = null;
    let acceptedInvitationRole: InvitationRole = InvitationRole.USER;
    let user: User | null = null;
    let effectiveTenantId = command.tenantId ?? '';
    let isNewUser = true;

    // Step 1: Validate invitation token or tenant public registration rules
    if (hasInvitationToken) {
      if (!command.tenantId) {
        throw Errors.validationinvalidValueFor002({
          field: 'tenantId',
          expectedType: 'required with invitationToken'
        });
      }

      const tenantIdAsNumber = Number(command.tenantId);
      if (!Number.isInteger(tenantIdAsNumber) || tenantIdAsNumber <= 0) {
        throw Errors.validationinvalidValueFor002({
          field: 'tenantId',
          expectedType: 'positive integer'
        });
      }

      const tokenHash = createHash('sha256').update(invitationToken).digest('hex');
      const invitation = await this.invitationRepository.findPendingByTokenHash(
        tenantIdAsNumber,
        tokenHash
      );

      if (!invitation) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'Invalid or already-used invitation token'
        });
      }

      if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'Invitation has expired'
        });
      }

      if (!invitation.emailHash) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'Invitation is missing the required email binding'
        });
      }

      if (invitation.emailHash !== hashEmail(normalizedEmail)) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'Invitation token does not match this email address'
        });
      }

      acceptedInvitationId = invitation.id;
      acceptedInvitationTenantId = tenantIdAsNumber;
      const invitationOrganization = await this.organizationRepository.findById(command.tenantId);
      acceptedInvitationMembershipTenantId = invitationOrganization?.tenantId ?? null;
      if (
        !Number.isInteger(acceptedInvitationMembershipTenantId) ||
        (acceptedInvitationMembershipTenantId ?? 0) <= 0
      ) {
        throw Errors.databaserecordNotFound004({ entity: 'Organization' });
      }
      acceptedInvitationRole = normalizeInvitationRole(invitation.role);

      this.logger.debug(`Invitation token validated for tenant=${tenantIdAsNumber}`);
    } else if (command.tenantId) {
      // Check if organization exists
      const organization = await this.organizationRepository.findById(command.tenantId);

      if (!organization) {
        throw Errors.databaserecordNotFound004({ entity: 'Organization' });
      }

      // Check if organization allows public registration
      const allowsPublicReg = await this.organizationRepository.allowsPublicRegistration(
        command.tenantId
      );

      if (!allowsPublicReg) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'This organization does not allow public registration'
        });
      }

      this.logger.debug('Tenant validation completed successfully');
    } else {
      // No tenantId provided - organization will be auto-created by AuthService
      // organizationName is optional and will default to displayName or email
      this.logger.debug('No tenant provided, will create new organization');
    }

    // Step 2: Register user via auth service
    // Note: ALL GCP provisioning happens SYNCHRONOUSLY now - user can login immediately
    // Owner assignment and audit events are published to outbox within the service transaction
    if (hasInvitationToken && command.tenantId) {
      user = await this.authService.findActiveUserByEmailInTenant(command.tenantId, command.email);
      if (user) {
        effectiveTenantId = command.tenantId;
        isNewUser = false;
        user = await this.authService.activateAndVerifyExistingUserForInvitation(
          command.tenantId,
          user.id
        );
        this.logger.debug(
          `Invitation registration reusing existing account userId=${user.id}, tenant=${effectiveTenantId}`
        );
      }
    }

    if (!user && hasInvitationToken) {
      const existingGlobalUser = await this.authService.findActiveUserByEmailGlobally(
        command.email
      );
      if (existingGlobalUser) {
        throw Errors.businessoperationNotAllowed001({
          reason:
            'An account with this email already exists. Sign in to accept or decline this invitation.'
        });
      }
    }

    if (!user) {
      const result: {
        user: User;
        tenantId: string;
        isNewOrganization: boolean;
        gcpTenantId: string | null;
      } =
        command.organizationSlug !== undefined
          ? await this.authService.registerWithEmailPassword(
              command.tenantId,
              command.email,
              command.password,
              command.displayName,
              command.organizationName,
              command.isVerified,
              command.isActive,
              command.organizationSlug,
              {
                requestId: command.requestId,
                correlationId: command.correlationId,
                causationId: command.causationId
              }
            )
          : await this.authService.registerWithEmailPassword(
              command.tenantId,
              command.email,
              command.password,
              command.displayName,
              command.organizationName,
              command.isVerified,
              command.isActive,
              undefined,
              {
                requestId: command.requestId,
                correlationId: command.correlationId,
                causationId: command.causationId
              }
            );
      user = result.user;
      effectiveTenantId = result.tenantId;
      isNewUser = true;
    }

    if (!user) {
      throw Errors.systeminternalServerError001({});
    }

    // Step 3: Authenticate the newly created user to get tokens
    // Use retry mode since GCP Identity Platform may take a few seconds to propagate the new user
    const { authResult, userInfo } = await this.authService.authenticateWithEmailPassword(
      effectiveTenantId,
      command.email,
      command.password,
      { isRetryForNewUser: isNewUser } // Enable retry only for newly created users
    );

    // Step 4: If this registration accepted an invitation, create membership and consume invitation.
    // This runs only after auth succeeds, preventing false "accepted/active" state on auth failures.
    if (
      acceptedInvitationId !== null &&
      acceptedInvitationTenantId !== null &&
      acceptedInvitationMembershipTenantId !== null
    ) {
      await this.invitationRepository.transaction(async (tx) => {
        const transactionalDb = tx as Parameters<
          InvitationRepository['markAsAcceptedWithTransaction']
        >[0];
        const acceptedInvitation = await this.invitationRepository.markAsAcceptedWithTransaction(
          transactionalDb,
          acceptedInvitationTenantId,
          acceptedInvitationId
        );

        if (!acceptedInvitation) {
          throw Errors.businessoperationNotAllowed001({
            reason: 'Invitation is no longer available'
          });
        }

        const [existingMembership] = await tx
          .select()
          .from(userTenants)
          .where(
            and(
              eq(userTenants.tenantId, acceptedInvitationMembershipTenantId),
              eq(userTenants.userId, user.id)
            )
          )
          .limit(1);

        if (!existingMembership) {
          await this.userTenantRepository.createMembershipWithTransaction(transactionalDb, {
            userId: user.id,
            tenantId: acceptedInvitationMembershipTenantId,
            role: acceptedInvitationRole,
            isActive: true,
            isDefault: false
          });
        }
      });
    }

    // Step 5: Return full AuthResponse with tokens (matching LoginHandler pattern)
    return {
      accessToken: authResult.accessToken,
      refreshToken: authResult.refreshToken,
      idToken: authResult.idToken,
      expiresIn: authResult.expiresIn,
      refreshExpiresIn: authResult.refreshExpiresIn,
      user: {
        userId: userInfo.userId ?? '',
        username: userInfo.username ?? userInfo.email ?? '',
        email: userInfo.email ?? '',
        emailVerified: userInfo.emailVerified,
        roles: userInfo.roles ?? [],
        permissions: userInfo.permissions ?? [],
        tenantId: userInfo.tenantId ?? ''
      },
      isNewUser
    };
  }
}
