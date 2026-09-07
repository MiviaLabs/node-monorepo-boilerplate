import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

import { MemberRemovedEvent } from '../../events/member-removed.event';

/**
 * Member removed event handler
 *
 * Handles side effects after a member is removed
 */
@Injectable()
@EventsHandler(MemberRemovedEvent)
export class MemberRemovedHandler implements IEventHandler<MemberRemovedEvent> {
  private readonly logger = new Logger(MemberRemovedHandler.name);

  handle(event: MemberRemovedEvent): void {
    this.logger.log(
      `Member ${event.memberId} removed from tenant: ${event.tenantId} by actor: ${event.actorId}`
    );

    // TODO: Implement side effects
    // This could include:
    // 1. Send notification to removed member
    // 2. Invalidate user permissions cache
    // 3. Log audit trail
    // 4. Clean up user-specific resources
  }
}
