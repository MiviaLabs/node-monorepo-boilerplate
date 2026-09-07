import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';

import { TenantSettingsUpdatedEvent } from '../../events/tenant-settings-updated.event';

/**
 * Tenant settings updated event handler
 *
 * Handles side effects after tenant settings are updated
 */
@Injectable()
@EventsHandler(TenantSettingsUpdatedEvent)
export class TenantSettingsUpdatedHandler implements IEventHandler<TenantSettingsUpdatedEvent> {
  private readonly logger = new Logger(TenantSettingsUpdatedHandler.name);

  handle(event: TenantSettingsUpdatedEvent): void {
    this.logger.log(
      `Tenant settings updated for tenant: ${event.tenantId} by actor: ${event.actorId}`
    );

    // TODO: Implement side effects
    // This could include:
    // 1. Invalidate cached tenant settings
    // 2. Send notifications to relevant users
    // 3. Log audit trail
    // 4. Sync with external services
  }
}
