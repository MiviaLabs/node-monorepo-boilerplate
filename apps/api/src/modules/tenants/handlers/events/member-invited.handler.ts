import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

import { MemberInvitedEvent } from '../../events/member-invited.event';

/**
 * Member invited event handler
 *
 * Handles side effects after a member is invited
 */
@Injectable()
@EventsHandler(MemberInvitedEvent)
export class MemberInvitedHandler implements IEventHandler<MemberInvitedEvent> {
  private readonly logger = new Logger(MemberInvitedHandler.name);

  handle(event: MemberInvitedEvent): void {
    const aggregateSubject = 'userId' in event.invitation ? event.invitation.userId : undefined;
    const invitationId =
      'invitationId' in event.invitation ? event.invitation.invitationId : undefined;

    this.logger.log(
      `Member invited event processed for tenant=${event.tenantId}, actor=${event.actorId}, userId=${aggregateSubject ?? 'n/a'}, invitationId=${invitationId ?? 'n/a'}`
    );

    // TODO: Implement side effects
    // This could include:
    // 1. Send invitation email
    // 2. Store invitation in database
    // 3. Log audit trail
    // 4. Track invitation metrics
  }
}
