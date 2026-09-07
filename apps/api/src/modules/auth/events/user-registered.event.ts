import type { IEvent } from '@package/types';

/**
 * User registered event
 *
 * Published when a new user registers
 */
export class UserRegisteredEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string | undefined;
  readonly userId: number;
  readonly email: string;
  readonly provider: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(tenantId: string | undefined, userId: number, email: string, provider: string) {
    this.aggregateId = String(userId);
    this.tenantId = tenantId;
    this.userId = userId;
    this.email = email;
    this.provider = provider;
    this.occurredAt = new Date();
    this.version = 1;
  }
}
