import type { ICommand } from '@package/types';

/**
 * Reset Password Command
 *
 * Validates a password reset token and updates the user's password
 * to the new value provided
 */
export class ResetPasswordCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId?: string;
  readonly token: string;
  readonly newPassword: string;
  readonly organizationId?: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId?: string;
    token: string;
    newPassword: string;
    organizationId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    if (props.actorId !== undefined) {
      this.actorId = props.actorId;
    }
    this.token = props.token;
    this.newPassword = props.newPassword;
    if (props.organizationId !== undefined) {
      this.organizationId = props.organizationId;
    }
    this.createdAt = new Date();
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
