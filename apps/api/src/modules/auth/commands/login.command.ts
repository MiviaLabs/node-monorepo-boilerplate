import type { ICommand } from '@package/types';

/**
 * Login command
 *
 * Authenticates user with email/password
 */
export class LoginCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly email: string;
  readonly password: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.email = props.email;
    this.password = props.password;
    if (props.ipAddress !== undefined) {
      this.ipAddress = props.ipAddress;
    }
    if (props.userAgent !== undefined) {
      this.userAgent = props.userAgent;
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
