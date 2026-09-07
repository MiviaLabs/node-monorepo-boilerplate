import type { UpdateTenantSettingsDto } from '../dto';
import type { IEvent } from '@package/types';

/**
 * Tenant settings updated event
 *
 * Published when tenant settings are updated
 */
export class TenantSettingsUpdatedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly settings: UpdateTenantSettingsDto;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId: string;
    settings: UpdateTenantSettingsDto;
    version: number;
    eventId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.aggregateId = props.tenantId;
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.settings = props.settings;
    this.occurredAt = new Date();
    this.version = props.version;
    if (props.eventId !== undefined) {
      this.eventId = props.eventId;
    }
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
