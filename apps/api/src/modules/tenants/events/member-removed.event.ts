import type { IEvent } from '@package/types';

/**
 * Member removed event
 *
 * Published when a member is removed from the tenant
 */
export class MemberRemovedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly memberId: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId: string;
    memberId: string;
    version: number;
    eventId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.aggregateId = props.tenantId;
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.memberId = props.memberId;
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
