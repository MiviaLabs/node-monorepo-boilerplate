import type { IEvent } from '@package/types';

/**
 * Password reset completed event
 *
 * Published when a user successfully completes a password reset
 */
export class PasswordResetCompletedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string | undefined;
  readonly userId: number;
  readonly email: string;
  readonly resetMethod: string;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(tenantId: string | undefined, userId: number, email: string, resetMethod: string) {
    this.aggregateId = String(userId);
    this.tenantId = tenantId;
    this.userId = userId;
    this.email = email;
    this.resetMethod = resetMethod;
    this.occurredAt = new Date();
    this.version = 1;
  }
}
