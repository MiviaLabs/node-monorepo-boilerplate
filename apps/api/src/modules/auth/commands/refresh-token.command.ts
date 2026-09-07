import type { ICommand } from '@package/types';

/**
 * Refresh token command
 *
 * Refreshes access token using refresh token
 */
export class RefreshTokenCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly refreshToken: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    refreshToken: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.refreshToken = props.refreshToken;
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
