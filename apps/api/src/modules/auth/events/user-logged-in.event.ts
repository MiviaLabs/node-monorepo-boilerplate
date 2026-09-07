import type { IEvent } from '@package/types';

/**
 * User logged in event
 *
 * Published when a user successfully logs in
 */
export class UserLoggedInEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly userId: number;
  readonly provider: string;
  readonly sessionId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(
    tenantId: string,
    userId: number,
    provider: string,
    sessionId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    this.aggregateId = String(userId);
    this.tenantId = tenantId;
    this.userId = userId;
    this.provider = provider;
    this.sessionId = sessionId;
    if (ipAddress !== undefined) {
      this.ipAddress = ipAddress;
    }
    if (userAgent !== undefined) {
      this.userAgent = userAgent;
    }
    this.occurredAt = new Date();
    this.version = 1;
  }
}
