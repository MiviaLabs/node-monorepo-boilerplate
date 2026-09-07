import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventHandler } from '@package/events';

import { AuthRepository } from '../../../auth/repositories/auth.repository';
import { TrackedEmailService } from '../../../email-tracking/services/tracked-email.service';
import { buildInvitationEmailTemplate } from '../../email/invitation-email.template';
import { InvitationRepository } from '../../repositories/invitation.repository';

import type { MemberInvitedEventPayload } from '../../events/member-invited.event';

interface TenantMemberInvitedEventMessage {
  eventId: string;
  data?: MemberInvitedEventPayload;
  payload?: MemberInvitedEventPayload;
}

/**
 * Consumer for tenant.member.invited events.
 */
@Injectable()
export class InvitationEmailConsumer {
  private readonly logger = new Logger(InvitationEmailConsumer.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly invitationRepo: InvitationRepository,
    private readonly authRepository: AuthRepository,
    private readonly trackedEmailService: TrackedEmailService
  ) {}

  /**
   * Sends invitation email and rethrows failures for retry processing.
   *
   * Security: Looks up invitation by ID and decrypts email from storage
   * instead of reading from persisted event payload.
   */
  @EventHandler('tenant.member.invited')
  async handle(event: TenantMemberInvitedEventMessage): Promise<void> {
    const payload = event.data ?? event.payload;
    if (!payload) {
      this.logger.warn(`Invitation event ${event.eventId} missing payload data`);
      return;
    }

    // Skip if this is an existing-user invite (no invitationId)
    if (!('invitationId' in payload)) {
      this.logger.debug(
        `Skipping invitation email for existing member invite eventId=${event.eventId}, tenantId=${payload.tenantId}`
      );
      return;
    }

    const tenantId = Number(payload.tenantId);
    const invitationId = Number(payload.invitationId);

    try {
      // Look up invitation from database (not from event payload)
      const invitation = await this.invitationRepo.findById(tenantId, invitationId);

      if (!invitation) {
        this.logger.warn(
          `Invitation not found for eventId=${event.eventId}, tenantId=${tenantId}, invitationId=${invitationId}`
        );
        return;
      }
      if (invitation.status !== 'pending') {
        this.logger.warn(
          `Invitation ${invitationId} is no longer pending for eventId=${event.eventId}, tenantId=${tenantId}`
        );
        return;
      }

      // Decrypt email from storage
      if (!invitation.emailEncrypted) {
        this.logger.warn(
          `Invitation ${invitationId} missing emailEncrypted field for eventId=${event.eventId}`
        );
        return;
      }
      const email = await this.invitationRepo.decryptEmail(invitation.emailEncrypted);

      const invitationToken = this.invitationRepo.getCurrentInvitationToken(invitation);

      const invitationAppUrl =
        this.configService.get<string>('INVITATION_WEBAPP_URL')?.trim() ??
        this.configService.get<string>('WEBAPP_PUBLIC_URL')?.trim() ??
        this.configService.get<string>('APP_URL', 'http://localhost:3000')?.trim() ??
        'http://localhost:3000';
      const invitationUrl = `${invitationAppUrl.replace(/\/$/, '')}/invitations/accept?tenantId=${tenantId}&token=${encodeURIComponent(invitationToken)}`;
      const organization = await this.authRepository.findOrganizationById(tenantId);
      const tenantDisplayName =
        organization?.displayName?.trim() ?? organization?.name?.trim() ?? `Tenant ${tenantId}`;

      await this.trackedEmailService.sendTrackedEmail({
        organizationId: tenantId,
        correlationId: event.eventId,
        causationId: event.eventId,
        request: {
          to: email,
          subject: `You are invited to join ${tenantDisplayName}`,
          html: buildInvitationEmailTemplate({
            invitationUrl,
            tenantName: tenantDisplayName,
            expiresAt: payload.expiresAt
          }),
          emailTracking: {
            messageKind: 'tenant_invitation',
            referenceType: 'invitation',
            referenceId: String(invitationId),
            correlationKey: `tenant-invitation:${invitationId}`,
            safeMetadata: {
              tenantId,
              eventId: event.eventId
            }
          }
        }
      });

      this.logger.log(
        `Invitation email sent for eventId=${event.eventId}, tenantId=${tenantId}, invitationId=${invitationId}`
      );
    } catch (error) {
      this.logger.error(
        `Invitation email failed for eventId=${event.eventId}, tenantId=${tenantId}, invitationId=${invitationId}`,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }
}
