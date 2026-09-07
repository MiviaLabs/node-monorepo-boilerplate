import type { IEvent } from '@package/types';

/**
 * Password reset requested event
 *
 * Published when a user requests a password reset
 *
 * IMPORTANT: Contains the raw reset token (UUID), NOT the tokenHash.
 * The raw token is needed for the email reset link. The hash is stored
 * in the database, but the raw token is only shown once in the email.
 */
export class PasswordResetRequestedEvent implements IEvent {
  readonly readonly = true;
  readonly aggregateId: string;
  readonly tenantId: string | undefined;
  readonly userId: number;
  readonly email: string;
  readonly resetToken: string; // Raw token (UUID) for email link
  readonly expiresAt: Date;
  readonly occurredAt: Date;
  readonly version: number;

  // Outbox pattern support
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(
    tenantId: string | undefined,
    userId: number,
    email: string,
    resetToken: string,
    expiresAt: Date
  ) {
    this.aggregateId = String(userId);
    this.tenantId = tenantId;
    this.userId = userId;
    this.email = email;
    this.resetToken = resetToken;
    this.expiresAt = expiresAt;
    this.occurredAt = new Date();
    this.version = 1;
  }
}
