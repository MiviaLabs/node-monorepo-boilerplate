import type { IdentityProvider } from '@package/db-core';
import type { ICommand } from '@package/types';

/**
 * Link identity command
 *
 * Links an additional identity provider to an existing user
 */
export class LinkIdentityCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly actorId: string;
  readonly userId: number;
  readonly provider: IdentityProvider;
  readonly providerUid: string;
  readonly idToken?: string;
  readonly accessToken?: string;
  readonly displayName?: string;
  readonly photoUrl?: string;
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
    idToken?: string;
    accessToken?: string;
    displayName?: string;
    photoUrl?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.userId = props.userId;
    this.provider = props.provider;
    this.providerUid = props.providerUid;
    if (props.idToken !== undefined) {
      this.idToken = props.idToken;
    }
    if (props.accessToken !== undefined) {
      this.accessToken = props.accessToken;
    }
    if (props.displayName !== undefined) {
      this.displayName = props.displayName;
    }
    if (props.photoUrl !== undefined) {
      this.photoUrl = props.photoUrl;
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
