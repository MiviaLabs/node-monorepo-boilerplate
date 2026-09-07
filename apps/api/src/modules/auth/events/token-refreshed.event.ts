import type { IEvent } from '@package/types';

/**
 * Token refreshed event
 *
 * Published when a token is refreshed
 */
export class TokenRefreshedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly userId: number;
  readonly sessionId: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(tenantId: string, userId: number, sessionId: string) {
    this.aggregateId = String(userId);
    this.tenantId = tenantId;
    this.userId = userId;
    this.sessionId = sessionId;
    this.occurredAt = new Date();
    this.version = 1;
  }
}
