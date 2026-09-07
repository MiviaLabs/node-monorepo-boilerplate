import type { IQuery } from '@package/types';

export class GetAuthBootstrapQuery implements IQuery {
  readonly readonly = true;
  readonly userId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly email?: string;
  readonly name?: string;
  readonly username?: string;
  readonly roles?: string[] | Set<string>;
  readonly permissions?: string[] | Set<string>;

  constructor(props: {
    userId: string;
    tenantId: string;
    actorId: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
    email?: string;
    name?: string;
    username?: string;
    roles?: string[] | Set<string>;
    permissions?: string[] | Set<string>;
  }) {
    this.userId = props.userId;
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
    this.email = props.email;
    this.name = props.name;
    this.username = props.username;
    this.roles = props.roles;
    this.permissions = props.permissions;
  }
}
