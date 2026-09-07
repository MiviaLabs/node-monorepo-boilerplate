import type { IdentityProvider } from '@package/db-core';
import type { ICommand } from '@package/types';

/**
 * Login with OAuth command
 *
 * Authenticates user with OAuth provider (Google, Microsoft, etc.)
 */
export class LoginWithOAuthCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly provider: IdentityProvider;
  readonly idToken: string;
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
    provider: IdentityProvider;
    idToken: string;
    accessToken?: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.provider = props.provider;
    this.idToken = props.idToken;
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
