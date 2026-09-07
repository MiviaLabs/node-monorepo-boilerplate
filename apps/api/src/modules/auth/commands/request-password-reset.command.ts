import type { ICommand } from '@package/types';

/**
 * Request Password Reset Command
 *
 * Initiates a password reset request by generating a secure token
 * and sending a reset link to the user's email address.
 *
 * Only email is required - the system automatically determines the user's organization
 * by looking up the user globally across all organizations.
 */
export class RequestPasswordResetCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId?: string;
  readonly email: string;
  readonly requestIp?: string;
  readonly requestUserAgent?: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId?: string;
    email: string;
    requestIp?: string;
    requestUserAgent?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    if (props.actorId !== undefined) {
      this.actorId = props.actorId;
    }
    this.email = props.email;
    if (props.requestIp !== undefined) {
      this.requestIp = props.requestIp;
    }
    if (props.requestUserAgent !== undefined) {
      this.requestUserAgent = props.requestUserAgent;
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
