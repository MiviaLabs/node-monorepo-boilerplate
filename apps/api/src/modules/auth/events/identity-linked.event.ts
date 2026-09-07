import type { IdentityProvider } from '@package/db-core';
import type { IEvent } from '@package/types';

/**
 * Identity linked event
 *
 * Published when an identity provider is linked to a user
 */
export class IdentityLinkedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly userId: number;
  readonly provider: IdentityProvider;
  readonly providerUid: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(tenantId: string, userId: number, provider: IdentityProvider, providerUid: string) {
    this.aggregateId = String(userId);
    this.tenantId = tenantId;
    this.userId = userId;
    this.provider = provider;
    this.providerUid = providerUid;
    this.occurredAt = new Date();
    this.version = 1;
  }
}
