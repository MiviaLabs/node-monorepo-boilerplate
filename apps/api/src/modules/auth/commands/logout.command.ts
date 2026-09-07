import type { ICommand } from '@package/types';

/**
 * Logout command
 *
 * Logs out user and invalidates tokens
 */
export class LogoutCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId: string;
  readonly userId: number;
  readonly refreshToken: string;
  readonly accessToken?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId: string;
    userId: number;
    refreshToken: string;
    accessToken?: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.userId = props.userId;
    this.refreshToken = props.refreshToken;
    if (props.accessToken !== undefined) {
      this.accessToken = props.accessToken;
    }
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
