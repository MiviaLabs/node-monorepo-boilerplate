import type { IdentityProvider } from '@package/db-core';
import type { ICommand } from '@package/types';

/**
 * Unlink identity command
 *
 * Unlinks an identity provider from a user
 */
export class UnlinkIdentityCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId: string;
  readonly userId: number;
  readonly provider: IdentityProvider;
  readonly providerUid: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    actorId: string;
    userId: number;
    provider: IdentityProvider;
    providerUid: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.userId = props.userId;
    this.provider = props.provider;
    this.providerUid = props.providerUid;
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
